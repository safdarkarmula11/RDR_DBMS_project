// NimbusHost integrity tests.
// Proves that the database itself enforces its rules, whatever the application does.
// Every fixture is created inside one transaction that is ROLLED BACK at the end,
// so your data is not changed (the partition test at the end is the one exception:
// it only adds empty future partitions, which is harmless and safe to repeat).
//
// Usage (from the backend folder, after db:setup and seed-users):
//   node scripts/integrityTests.js
// Save the output for the report:
//   node scripts/integrityTests.js

import { pool } from '../src/db.js';

const results = [];
const record = (id, desc, status, detail = '') => {
  results.push({ id, desc, status, detail });
  const mark = status === 'PASS' ? 'PASS' : status === 'SKIP' ? 'SKIP' : 'FAIL';
  console.log(`${mark}  ${id}  ${desc}${detail ? `\n        ${detail}` : ''}`);
};

async function expectError(id, desc, pattern, fn) {
  try {
    await fn();
    record(id, desc, 'FAIL', 'the statement succeeded but should have been rejected');
  } catch (err) {
    const msg = err.sqlMessage || err.message;
    if (pattern.test(msg)) record(id, desc, 'PASS', `rejected: ${msg}`);
    else record(id, desc, 'FAIL', `rejected with an unexpected message: ${msg}`);
  }
}

async function expectOk(id, desc, fn) {
  try {
    await fn();
    record(id, desc, 'PASS');
  } catch (err) {
    record(id, desc, 'FAIL', `should have worked but failed: ${err.sqlMessage || err.message}`);
  }
}

async function expectTrue(id, desc, fn) {
  try {
    const ok = await fn();
    record(id, desc, ok ? 'PASS' : 'FAIL', ok ? '' : 'condition was false');
  } catch (err) {
    record(id, desc, 'FAIL', err.sqlMessage || err.message);
  }
}

async function runInTransaction() {
  const conn = await pool.getConnection();
  const q = async (sql, params) => (await conn.query(sql, params))[0];
  try {
    await conn.beginTransaction();

    // ---------- fixtures ----------
    const [tier] = await q("SELECT tier_id FROM account_tiers ORDER BY (name = 'Enterprise') DESC, tier_id LIMIT 1");
    if (!tier) throw new Error('No account tier found. Run: npm run db:setup');
    const orgA = (await q('INSERT INTO organizations(name, tier_id) VALUES (?, ?)', ['it-org-a', tier.tier_id])).insertId;
    const orgB = (await q('INSERT INTO organizations(name, tier_id) VALUES (?, ?)', ['it-org-b', tier.tier_id])).insertId;
    const mkUser = async (email, role) =>
      (await q('INSERT INTO users(email, password_hash, full_name, system_role) VALUES (?, ?, ?, ?)',
        [email, '$2b$12$fixturehashfixturehashfixturehashfixturehashfixturehash', email, role])).insertId;
    const custA = await mkUser('it-cust-a@test.local', 'customer');
    const custB = await mkUser('it-cust-b@test.local', 'customer');
    const support = await mkUser('it-support@test.local', 'support');
    await q("INSERT INTO org_members(org_id, user_id, member_role) VALUES (?, ?, 'owner')", [orgA, custA]);
    await q("INSERT INTO org_members(org_id, user_id, member_role) VALUES (?, ?, 'owner')", [orgB, custB]);

    // ---------- 1. normalization (images split) ----------
    await expectTrue('N01', 'Functional dependency name -> os_family holds (each OS has one family)', async () => {
      const [r] = await q('SELECT COUNT(*) AS c FROM (SELECT name FROM v_images GROUP BY name HAVING COUNT(DISTINCT os_family) > 1) x');
      return Number(r.c) === 0;
    });
    const [img] = await q('SELECT os_id, version FROM images LIMIT 1');
    if (img) {
      await expectError('N02', 'Duplicate (os_id, version) image is rejected', /Duplicate entry/i, () =>
        q('INSERT INTO images(os_id, version, min_disk_gb) VALUES (?, ?, 10)', [img.os_id, img.version]));
    } else {
      record('N02', 'Duplicate (os_id, version) image is rejected', 'SKIP', 'no images in the catalog');
    }
    await expectError('N03', 'An image must reference an existing operating system', /foreign key/i, () =>
      q("INSERT INTO images(os_id, version, min_disk_gb) VALUES (999999, '1.0', 10)"));

    // ---------- 1b. strict 3NF: derived values are not stored ----------
    await expectTrue('N04', 'No derived columns are stored (total, tax, amount, live_name, usage org_id, month_name ...)', async () => {
      const [r] = await q(`SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND (
          (TABLE_NAME = 'invoices' AND COLUMN_NAME IN ('total', 'tax'))
       OR (TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'amount')
       OR (TABLE_NAME = 'usage_records' AND COLUMN_NAME IN ('org_id', 'type_id', 'usage_id'))
       OR (TABLE_NAME IN ('instances', 'volumes') AND COLUMN_NAME = 'live_name')
       OR (TABLE_NAME = 'dim_date' AND COLUMN_NAME IN ('month_name', 'quarter', 'is_weekend')))`);
      return Number(r.c) === 0;
    });
    await expectTrue('N05', 'No table has a GENERATED column', async () => {
      const [r] = await q(`SELECT COUNT(*) AS c FROM information_schema.COLUMNS c JOIN information_schema.TABLES t
          ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
          WHERE c.TABLE_SCHEMA = DATABASE() AND c.EXTRA IN ('VIRTUAL GENERATED', 'STORED GENERATED')`);
      return Number(r.c) === 0;
    });
    const draftInv = (await q(
      "INSERT INTO invoices(org_id, period_start, period_end, subtotal, credit_applied, status) VALUES (?, '2025-01-01', '2025-01-31', 100, 10, 'draft')",
      [orgA])).insertId;
    await expectTrue('N06', 'v_invoices derives tax and total (100 + 18% - 10 credit = 108.00)', async () => {
      const [r] = await q('SELECT tax, total FROM v_invoices WHERE invoice_id = ?', [draftInv]);
      return Number(r.tax) === 18 && Number(r.total) === 108;
    });
    await q("INSERT INTO invoice_items(invoice_id, instance_id, description, quantity, unit_price) VALUES (?, NULL, 'n07 item', 2.5, 4)", [draftInv]);
    await expectTrue('N07', 'v_invoice_items derives amount (2.5 x 4 = 10.00)', async () => {
      const [r] = await q('SELECT amount FROM v_invoice_items WHERE invoice_id = ?', [draftInv]);
      return Number(r.amount) === 10;
    });
    await expectError('N08', 'Credit larger than subtotal + tax is rejected (chk_inv_credit)', /chk_inv_credit/i, () =>
      q('UPDATE invoices SET credit_applied = 500 WHERE invoice_id = ?', [draftInv]));
    await expectTrue('N09', 'dim_month and dim_weekday hold the month and weekday attributes (12 and 7 rows)', async () => {
      const [m] = await q('SELECT COUNT(*) AS c FROM dim_month');
      const [w] = await q('SELECT COUNT(*) AS c FROM dim_weekday');
      return Number(m.c) === 12 && Number(w.c) === 7;
    });

    await expectTrue('N10', 'Every instance has an instance_type_history row and v_usage_records derives type_id from it', async () => {
      const [r] = await q('SELECT COUNT(*) AS c FROM instances i WHERE NOT EXISTS (SELECT 1 FROM instance_type_history h WHERE h.instance_id = i.instance_id)');
      const [v] = await q('SELECT COUNT(*) AS c FROM v_usage_records WHERE type_id IS NULL');
      return Number(r.c) === 0 && Number(v.c) === 0;
    });

    // ---------- 2. redundant indexes removed ----------
    await expectTrue('I01', 'Redundant indexes idx_usage_instance and idx_inv_status no longer exist', async () => {
      const rows = await q(
        "SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME IN ('idx_usage_instance', 'idx_inv_status')");
      return Number(rows[0].c) === 0;
    });

    // ---------- 3. billing evidence is protected ----------
    const [usage] = await q('SELECT recorded_at, instance_id, metric FROM usage_records LIMIT 1');
    if (usage) {
      await expectError('U01', 'A usage record cannot be updated (append-only)', /append-only/i, () =>
        q('UPDATE usage_records SET quantity = quantity WHERE recorded_at = ? AND instance_id = ? AND metric = ?', [usage.recorded_at, usage.instance_id, usage.metric]));
      await expectError('U02', 'A usage record cannot be deleted (append-only)', /append-only/i, () =>
        q('DELETE FROM usage_records WHERE recorded_at = ? AND instance_id = ? AND metric = ?', [usage.recorded_at, usage.instance_id, usage.metric]));
    } else {
      record('U01', 'A usage record cannot be updated (append-only)', 'SKIP', 'no usage rows yet; run node scripts/generateData.js');
      record('U02', 'A usage record cannot be deleted (append-only)', 'SKIP', 'no usage rows yet; run node scripts/generateData.js');
    }

    const inv = (await q(
      "INSERT INTO invoices(org_id, period_start, period_end, subtotal, credit_applied, status) VALUES (?, '2026-01-01', '2026-01-31', 0, 0, 'draft')",
      [orgA])).insertId;
    await expectOk('B01', 'A line item can be added while the invoice is a draft', () =>
      q("INSERT INTO invoice_items(invoice_id, instance_id, description, quantity, unit_price) VALUES (?, NULL, 'it item', 2, 5)", [inv]));
    await q(
      "UPDATE invoices SET subtotal = 10, credit_applied = 0, status = 'issued', issued_at = CURRENT_TIMESTAMP, due_date = DATE_ADD(CURRENT_DATE, INTERVAL 30 DAY) WHERE invoice_id = ?",
      [inv]);
    await expectError('B02', 'A line item cannot be added to an issued invoice', /draft/i, () =>
      q("INSERT INTO invoice_items(invoice_id, instance_id, description, quantity, unit_price) VALUES (?, NULL, 'late item', 1, 1)", [inv]));
    await expectError('B03', 'A line item of an issued invoice cannot be updated', /draft/i, () =>
      q('UPDATE invoice_items SET quantity = 1 WHERE invoice_id = ? LIMIT 1', [inv]));
    await expectError('B04', 'A line item of an issued invoice cannot be deleted', /draft/i, () =>
      q('DELETE FROM invoice_items WHERE invoice_id = ? LIMIT 1', [inv]));
    await expectError('B05', 'An invoice cannot be deleted', /./, () => q('DELETE FROM invoices WHERE invoice_id = ?', [inv]));

    // ---------- 4. tickets ----------
    await expectOk('T01', 'A member of the organization can open a ticket', () =>
      q("INSERT INTO tickets(org_id, created_by, subject, priority, status) VALUES (?, ?, 'it ticket', 'medium', 'open')", [orgA, custA]));
    await expectError('T02', 'A customer of another organization cannot open a ticket here', /member of the organization/i, () =>
      q("INSERT INTO tickets(org_id, created_by, subject, priority, status) VALUES (?, ?, 'bad ticket', 'medium', 'open')", [orgA, custB]));
    await expectError('T03', 'A ticket cannot be assigned to a customer', /support staff/i, () =>
      q("INSERT INTO tickets(org_id, created_by, assigned_to, subject, priority, status) VALUES (?, ?, ?, 'bad assign', 'medium', 'open')", [orgA, custA, custB]));
    const tk = (await q("INSERT INTO tickets(org_id, created_by, subject, priority, status) VALUES (?, ?, 'flow ticket', 'high', 'open')", [orgA, custA])).insertId;
    await expectOk('T04', 'A ticket can be assigned to a support agent', () =>
      q('UPDATE tickets SET assigned_to = ? WHERE ticket_id = ?', [support, tk]));
    await expectError('T05', 'A ticket cannot be moved to another organization', /cannot be changed/i, () =>
      q('UPDATE tickets SET org_id = ? WHERE ticket_id = ?', [orgB, tk]));
    await expectOk('T06', 'A ticket can be closed', () => q("UPDATE tickets SET status = 'closed' WHERE ticket_id = ?", [tk]));
    await expectError('T07', 'A closed ticket cannot be reopened', /cannot be reopened/i, () =>
      q("UPDATE tickets SET status = 'open' WHERE ticket_id = ?", [tk]));
    await expectOk('T08', 'A member can post a message on the ticket', () =>
      q("INSERT INTO ticket_messages(ticket_id, sender_id, body) VALUES (?, ?, 'hello')", [tk, custA]));
    await expectOk('T09', 'Support staff can post a message on any ticket', () =>
      q("INSERT INTO ticket_messages(ticket_id, sender_id, body) VALUES (?, ?, 'we are looking into it')", [tk, support]));
    await expectError('T10', 'A customer of another organization cannot post on the ticket', /not allowed to post/i, () =>
      q("INSERT INTO ticket_messages(ticket_id, sender_id, body) VALUES (?, ?, 'intruder')", [tk, custB]));

    // ---------- 5. audit coverage ----------
    await q("INSERT INTO operating_systems(name, os_family) VALUES ('it-os', 'linux')");
    await expectTrue('A01', 'Creating an operating system writes an audit_log row', async () => {
      const [r] = await q(
        "SELECT COUNT(*) AS c FROM audit_log WHERE table_name = 'operating_systems' AND JSON_UNQUOTE(JSON_EXTRACT(new_data, '$.name')) = 'it-os'");
      return Number(r.c) >= 1;
    });
    await expectTrue('A02', 'Opening a ticket writes an audit_log row', async () => {
      const [r] = await q("SELECT COUNT(*) AS c FROM audit_log WHERE table_name = 'tickets' AND action = 'INSERT'");
      return Number(r.c) >= 1;
    });
    await expectError('A03', 'The audit log is append-only (update is rejected)', /./, () =>
      q("UPDATE audit_log SET table_name = 'tampered' ORDER BY audit_id LIMIT 1"));

    // ---------- 6. star schema ETL ----------
    await expectOk('S01', 'sp_refresh_star_schema runs for yesterday and today', () =>
      q('CALL sp_refresh_star_schema(DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY), CURRENT_DATE)'));
    await expectTrue('S02', 'dim_date contains today after the refresh', async () => {
      const [r] = await q('SELECT COUNT(*) AS c FROM dim_date WHERE full_date = CURRENT_DATE');
      return Number(r.c) === 1;
    });
    await expectTrue('S03', 'dim_org contains every organization', async () => {
      const [r] = await q('SELECT (SELECT COUNT(*) FROM organizations) AS o, (SELECT COUNT(*) FROM dim_org) AS d');
      return Number(r.d) >= Number(r.o);
    });
  } finally {
    await conn.rollback();
    conn.release();
  }
}

async function partitionTest() {
  const count = async () => {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS c FROM information_schema.PARTITIONS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usage_records' AND PARTITION_NAME IS NOT NULL");
    return Number(rows[0].c);
  };
  try {
    const before = await count();
    await pool.query('CALL sp_add_future_partitions(3)');
    const after = await count();
    record('P01', 'sp_add_future_partitions keeps partitions ahead of today', after >= before ? 'PASS' : 'FAIL', `partitions: ${before} -> ${after}`);
    await pool.query('CALL sp_add_future_partitions(3)');
    const again = await count();
    record('P02', 'Running it again changes nothing (idempotent)', again === after ? 'PASS' : 'FAIL', `partitions: ${after} -> ${again}`);
  } catch (err) {
    record('P01', 'sp_add_future_partitions keeps partitions ahead of today', 'FAIL', err.sqlMessage || err.message);
  }
}

async function main() {
  console.log('NimbusHost integrity tests (fixtures are rolled back)\n');
  try {
    await runInTransaction();
    await partitionTest();
  } catch (err) {
    console.error(`\nFIXTURE ERROR: ${err.sqlMessage || err.message}`);
    console.error('The test data could not be created, so later tests did not run. Check the message above.');
    process.exitCode = 1;
  }

  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`\nSummary: ${pass} passed, ${fail} failed, ${skip} skipped, ${results.length} total`);
  if (fail) process.exitCode = 1;
  await pool.end();
}

await main();
