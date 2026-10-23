// NimbusHost concurrency and isolation demo.
// Opens several real MySQL connections at once and shows, with measured results:
//   1. Dirty read          (READ UNCOMMITTED vs READ COMMITTED)
//   2. Non-repeatable read (READ COMMITTED vs REPEATABLE READ)
//   3. Lost update         (plain read-modify-write vs SELECT ... FOR UPDATE)
//   4. Deadlock            (opposite lock order vs one consistent lock order)
//   5. SKIP LOCKED         (how the compute scheduler avoids waiting on a busy host)
//   6. Quota race          (6 simultaneous server launches against a 2-server quota)
// Scenarios 1 to 5 use a scratch table (_demo_account) that is dropped at the end.
// Scenario 6 uses a small organization called "Concurrency Demo Org" on the Free tier.
//
// Usage (from the backend folder, after db:setup and seed-users):
//   node scripts/concurrencyDemo.js
// Save the output for the report:
//   node scripts/concurrencyDemo.js | Tee-Object ..\docs\test_results_concurrency.txt

import { pool } from '../src/db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (id, title, pass, detail) => {
  results.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${title}\n        ${detail}`);
};
const val = async (conn, sql) => Number((await conn.query(sql))[0][0].balance);

async function resetTable(conn) {
  await conn.query('DROP TABLE IF EXISTS _demo_account');
  await conn.query('CREATE TABLE _demo_account (id INT PRIMARY KEY, balance INT NOT NULL) ENGINE=InnoDB');
  await conn.query('INSERT INTO _demo_account VALUES (1, 100), (2, 100)');
}
const resetRows = (conn) => conn.query('UPDATE _demo_account SET balance = 100');
const BAL1 = 'SELECT balance FROM _demo_account WHERE id = 1';

async function finish(...conns) {
  for (const c of conns) {
    try { await c.rollback(); } catch { /* nothing open */ }
    try { await c.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ'); } catch { /* ignore */ }
  }
}

async function dirtyRead(A, B) {
  await resetRows(A);
  await A.beginTransaction();
  await A.query('UPDATE _demo_account SET balance = 500 WHERE id = 1'); // not committed

  await B.query('SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED');
  await B.beginTransaction();
  const dirty = await val(B, BAL1);
  await B.commit();

  await B.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
  await B.beginTransaction();
  const clean = await val(B, BAL1);
  await B.commit();

  await A.rollback();
  check('C1', 'Dirty read', dirty === 500 && clean === 100,
    `READ UNCOMMITTED saw the uncommitted value ${dirty}; READ COMMITTED saw ${clean} (the committed value). InnoDB default is REPEATABLE READ, which never allows dirty reads.`);
  await finish(A, B);
}

async function nonRepeatableRead(A, B) {
  const run = async (level) => {
    await resetRows(A);
    await B.query(`SET SESSION TRANSACTION ISOLATION LEVEL ${level}`);
    await B.beginTransaction();
    const first = await val(B, BAL1);
    await A.beginTransaction();
    await A.query('UPDATE _demo_account SET balance = 150 WHERE id = 1');
    await A.commit();
    const second = await val(B, BAL1);
    await B.commit();
    return [first, second];
  };
  const [rc1, rc2] = await run('READ COMMITTED');
  const [rr1, rr2] = await run('REPEATABLE READ');
  check('C2', 'Non-repeatable read', rc1 !== rc2 && rr1 === rr2,
    `READ COMMITTED read ${rc1} then ${rc2} (value changed inside one transaction); REPEATABLE READ read ${rr1} then ${rr2} (stable snapshot).`);
  await finish(A, B);
}

async function lostUpdate(A, B) {
  // Without a lock: both read 100, both add 10, the second write overwrites the first
  await resetRows(A);
  await A.beginTransaction();
  await B.beginTransaction();
  const a = await val(A, BAL1);
  const b = await val(B, BAL1);
  await A.query('UPDATE _demo_account SET balance = ? WHERE id = 1', [a + 10]);
  await A.commit();
  await B.query('UPDATE _demo_account SET balance = ? WHERE id = 1', [b + 10]);
  await B.commit();
  const unsafe = await val(A, BAL1);

  // With SELECT ... FOR UPDATE: the second reader waits and sees the first commit
  await resetRows(A);
  await A.beginTransaction();
  await B.beginTransaction();
  const a2 = await val(A, `${BAL1} FOR UPDATE`);
  const pendingB = val(B, `${BAL1} FOR UPDATE`); // blocks until A commits
  await sleep(300);
  await A.query('UPDATE _demo_account SET balance = ? WHERE id = 1', [a2 + 10]);
  await A.commit();
  const b2 = await pendingB;
  await B.query('UPDATE _demo_account SET balance = ? WHERE id = 1', [b2 + 10]);
  await B.commit();
  const safe = await val(A, BAL1);

  check('C3', 'Lost update', unsafe === 110 && safe === 120,
    `Two +10 updates without a lock ended at ${unsafe} (one update was lost); with SELECT ... FOR UPDATE they ended at ${safe} (correct).`);
  await finish(A, B);
}

async function deadlock(A, B) {
  await resetRows(A);

  // Opposite lock order: A locks 1 then wants 2, B locks 2 then wants 1
  await A.beginTransaction();
  await B.beginTransaction();
  await A.query('UPDATE _demo_account SET balance = balance + 1 WHERE id = 1');
  await B.query('UPDATE _demo_account SET balance = balance + 1 WHERE id = 2');
  const pa = A.query('UPDATE _demo_account SET balance = balance + 1 WHERE id = 2').then(() => 'ok', (e) => e);
  await sleep(300);
  const pb = B.query('UPDATE _demo_account SET balance = balance + 1 WHERE id = 1').then(() => 'ok', (e) => e);
  const [ra, rb] = await Promise.all([pa, pb]);
  const victims = [ra, rb].filter((r) => r !== 'ok' && r.errno === 1213).length;
  await finish(A, B);

  // Same lock order for both: no deadlock, the second one simply waits
  await resetRows(A);
  await A.beginTransaction();
  await B.beginTransaction();
  await A.query('UPDATE _demo_account SET balance = balance + 1 WHERE id = 1');
  const waitB = B.query('UPDATE _demo_account SET balance = balance + 1 WHERE id = 1').then(() => 'ok', (e) => e);
  await sleep(300);
  await A.query('UPDATE _demo_account SET balance = balance + 1 WHERE id = 2');
  await A.commit();
  const rWait = await waitB;
  await B.query('UPDATE _demo_account SET balance = balance + 1 WHERE id = 2').catch(() => {});
  await B.commit();
  await finish(A, B);

  check('C4', 'Deadlock and lock ordering', victims === 1 && rWait === 'ok',
    `Opposite lock order: MySQL chose ${victims} victim(s) with error 1213 (the API retries these). Same lock order: ${rWait === 'ok' ? 'no deadlock, the second transaction just waited' : 'unexpected error'}.`);
}

async function skipLocked(A, B) {
  await resetRows(A);
  await A.beginTransaction();
  await B.beginTransaction();
  const [a] = await A.query('SELECT id FROM _demo_account ORDER BY id LIMIT 1 FOR UPDATE');
  const [b] = await B.query('SELECT id FROM _demo_account ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED');
  await A.commit();
  await B.commit();
  check('C5', 'SKIP LOCKED (compute scheduler)', a[0].id === 1 && b[0] && b[0].id === 2,
    `Connection A locked row ${a[0].id}; connection B, using SKIP LOCKED, immediately took row ${b[0] ? b[0].id : 'none'} instead of waiting. sp_launch_instance uses this to pick a free host.`);
  await finish(A, B);
}

async function quotaRace() {
  const LAUNCHES = 6;
  let orgId;
  const [existing] = await pool.query("SELECT org_id FROM organizations WHERE name = 'Concurrency Demo Org'");
  if (existing[0]) {
    orgId = existing[0].org_id;
  } else {
    const [tier] = await pool.query("SELECT tier_id, max_instances FROM account_tiers WHERE name = 'Free'");
    if (!tier[0]) throw new Error('Free tier not found. Run: npm run db:setup');
    orgId = (await pool.query('INSERT INTO organizations(name, tier_id) VALUES (?, ?)', ['Concurrency Demo Org', tier[0].tier_id]))[0].insertId;
  }
  const [[quota]] = await pool.query(
    'SELECT t.max_instances AS m FROM organizations o JOIN account_tiers t ON t.tier_id = o.tier_id WHERE o.org_id = ?', [orgId]);
  const max = Number(quota.m);

  // Start clean: terminate anything left from an earlier run
  const [old] = await pool.query("SELECT instance_id FROM instances WHERE org_id = ? AND status <> 'terminated'", [orgId]);
  for (const row of old) await pool.query('CALL sp_terminate_instance(?, ?)', [row.instance_id, orgId]).catch(() => {});

  const [[type]] = await pool.query('SELECT type_id FROM instance_types WHERE active = 1 ORDER BY vcpu, ram_gb LIMIT 1');
  const [[image]] = await pool.query('SELECT image_id FROM images ORDER BY min_disk_gb LIMIT 1');
  const [[region]] = await pool.query('SELECT region_id FROM regions ORDER BY region_id LIMIT 1');
  if (!type || !image || !region) throw new Error('Catalog is empty. Run: npm run db:setup');

  const stamp = Date.now();
  const outcomes = await Promise.all(
    Array.from({ length: LAUNCHES }, (_, i) =>
      pool.query('CALL sp_launch_instance(?,?,?,?,?,?,?)', [
        orgId, type.type_id, image.image_id, region.region_id, `race-${stamp}-${i}`, '{}', '',
      ]).then(() => 'launched', (e) => e.sqlMessage || e.message)));

  const [[active]] = await pool.query("SELECT COUNT(*) AS c FROM instances WHERE org_id = ? AND status <> 'terminated'", [orgId]);
  const launched = outcomes.filter((o) => o === 'launched').length;
  const rejected = outcomes.filter((o) => o !== 'launched');
  check('C6', 'Quota race (simultaneous launches)', Number(active.c) <= max,
    `${LAUNCHES} launches started at the same time against a quota of ${max}: ${launched} launched, ${rejected.length} rejected ` +
    `(${[...new Set(rejected)].join(' | ') || 'none'}); active servers now ${active.c}. The organization-row lock in trg_instances_bi_rules keeps this at or below the quota.`);

  for (const row of (await pool.query("SELECT instance_id FROM instances WHERE org_id = ? AND status <> 'terminated'", [orgId]))[0]) {
    await pool.query('CALL sp_terminate_instance(?, ?)', [row.instance_id, orgId]).catch(() => {});
  }
}

async function main() {
  console.log('NimbusHost concurrency demo\n');
  const A = await pool.getConnection();
  const B = await pool.getConnection();
  try {
    await resetTable(A);
    await dirtyRead(A, B);
    await nonRepeatableRead(A, B);
    await lostUpdate(A, B);
    await deadlock(A, B);
    await skipLocked(A, B);
  } catch (err) {
    console.error(`\nDemo error: ${err.sqlMessage || err.message}`);
    process.exitCode = 1;
  } finally {
    try { await A.query('DROP TABLE IF EXISTS _demo_account'); } catch { /* ignore */ }
    A.release();
    B.release();
  }

  try {
    await quotaRace();
  } catch (err) {
    console.error(`\nQuota race demo error: ${err.sqlMessage || err.message}`);
    process.exitCode = 1;
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nSummary: ${results.length - failed} passed, ${failed} failed, ${results.length} total`);
  if (failed) process.exitCode = 1;
  await pool.end();
}

await main();
