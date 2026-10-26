// NimbusHost test-data generator.
// Fills the database with realistic volume so the Performance Lab shows real
// index differences. Everything goes through the normal rules: instances are
// launched with sp_launch_instance, invoices come from sp_generate_invoice,
// payments from sp_apply_payment, and every insert fires the normal triggers.
//
// Usage (from the backend folder, after db:setup and seed-users):
//   node scripts/generateData.js                              (about 90,000 usage rows)
//   node scripts/generateData.js --instances=100 --days=365   (about 1,000,000 usage rows)
//
// Options:
//   --instances=N   servers to create in the "LoadTest Corp" organization (default 40, max 150)
//   --days=N        days of usage history (default 90, max 700)
//   --tickets=N     support tickets with messages (default 300)
//
// It also creates a login for that organization (owner@loadtest.test / LoadTest123!), fills the
// star schema (sp_refresh_star_schema), and is safe to run again: servers, invoices and tickets
// are not duplicated.
// Usage rows are only generated when the organization has none yet.

import bcrypt from 'bcryptjs';
import { pool } from '../src/db.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  })
);
const INSTANCES = Math.min(Math.max(Number(args.instances ?? 40), 1), 150);
const DAYS = Math.min(Math.max(Number(args.days ?? 90), 1), 700);
const TICKETS = Math.max(Number(args.tickets ?? 300), 0);
const ORG_NAME = 'LoadTest Corp';
const BATCH = 3000;

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
const day = (d) => fmt(d).slice(0, 10);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const log = (msg) => console.log(msg);

async function ensureOrg() {
  const [rows] = await pool.query('SELECT org_id FROM organizations WHERE name = ?', [ORG_NAME]);
  if (rows[0]) return rows[0].org_id;
  const [tier] = await pool.query("SELECT tier_id FROM account_tiers WHERE name = 'Enterprise'");
  if (!tier[0]) throw new Error('Enterprise tier not found. Run: npm run db:setup');
  const [res] = await pool.query('INSERT INTO organizations(name, tier_id) VALUES (?, ?)', [ORG_NAME, tier[0].tier_id]);
  return res.insertId;
}

async function launchInstances(orgId) {
  const [types] = await pool.query('SELECT type_id, disk_gb FROM instance_types ORDER BY type_id');
  const [images] = await pool.query('SELECT image_id, min_disk_gb FROM images ORDER BY image_id');
  const [regions] = await pool.query('SELECT region_id FROM regions ORDER BY region_id');
  if (!types.length || !images.length || !regions.length) {
    throw new Error('Catalog is empty. Run: npm run db:setup');
  }

  let created = 0;
  let failed = 0;
  for (let i = 1; i <= INSTANCES; i += 1) {
    // Small types are more common than large ones
    const type = types[Math.min(types.length - 1, Math.floor(Math.pow(Math.random(), 1.6) * types.length))];
    const fitting = images.filter((im) => im.min_disk_gb <= type.disk_gb);
    const image = pick(fitting.length ? fitting : images);
    const region = regions[i % regions.length];
    const name = `lt-${String(i).padStart(3, '0')}`;
    const config = JSON.stringify({ auto_backup: i % 3 === 0, env: i % 2 ? 'prod' : 'staging' });
    try {
      await pool.query('CALL sp_launch_instance(?,?,?,?,?,?,?)', [
        orgId, type.type_id, image.image_id, region.region_id, name, config, `loadtest-${orgId}-${i}`,
      ]);
      created += 1;
    } catch (err) {
      failed += 1;
      if (failed <= 3) log(`  could not launch ${name}: ${err.sqlMessage || err.message}`);
    }
  }
  log(`Servers: ${created} launched or already present, ${failed} failed`);
  const [running] = await pool.query(
    "SELECT instance_id, type_id FROM instances WHERE org_id = ? AND status = 'running' ORDER BY instance_id",
    [orgId]
  );
  return running;
}

async function generateUsage(orgId, instances) {
  const [existing] = await pool.query('SELECT COUNT(*) AS c FROM v_usage_records WHERE org_id = ?', [orgId]);
  if (Number(existing[0].c) > 0) {
    log(`Usage: ${Number(existing[0].c).toLocaleString()} rows already exist for ${ORG_NAME}, skipping`);
    return;
  }
  if (!instances.length) {
    log('Usage: no running servers, skipping');
    return;
  }

  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const sql = 'INSERT INTO usage_records (recorded_at, instance_id, metric, quantity) VALUES ?';
  const conn = await pool.getConnection();
  let rows = [];
  let total = 0;

  const flush = async () => {
    if (!rows.length) return;
    await conn.beginTransaction();
    await conn.query(sql, [rows]);
    await conn.commit();
    total += rows.length;
    rows = [];
    process.stdout.write(`\r  usage rows inserted: ${total.toLocaleString()}   `);
  };

  try {
    for (const inst of instances) {
      const baseStorage = 20 + ((inst.instance_id * 7) % 180);
      for (let h = DAYS * 24; h >= 1; h -= 1) {
        const ts = new Date(now.getTime() - h * 3600 * 1000);
        if (Math.random() > 0.04) {
          rows.push([fmt(ts), inst.instance_id, 'cpu_hour', 1]);
        }
        if (ts.getUTCHours() === 0) {
          rows.push([fmt(ts), inst.instance_id, 'storage_gb', (baseStorage + rand(-2, 2)).toFixed(3)]);
          rows.push([fmt(ts), inst.instance_id, 'egress_gb', rand(0.2, 9).toFixed(3)]);
        }
        if (rows.length >= BATCH) await flush();
      }
    }
    await flush();
  } finally {
    conn.release();
  }
  process.stdout.write('\n');
  log(`Usage: ${total.toLocaleString()} rows inserted`);
}

async function generateInvoices(orgId) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  start.setUTCDate(1);
  start.setUTCDate(start.getUTCDate() - DAYS);
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  let made = 0;
  let skipped = 0;
  for (let m = new Date(first); m < thisMonth; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const end = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
    try {
      await pool.query('CALL sp_generate_invoice(?,?,?)', [orgId, day(m), day(end)]);
      made += 1;
    } catch (err) {
      skipped += 1;
      if (!/already exists/i.test(err.sqlMessage || '')) log(`  invoice ${day(m)}: ${err.sqlMessage || err.message}`);
    }
  }
  log(`Invoices: ${made} generated, ${skipped} skipped`);

  // Pay every second invoice so the billing screens show a mix of paid and unpaid
  const [open] = await pool.query(
    "SELECT invoice_id, total FROM v_invoices WHERE org_id = ? AND status IN ('issued','overdue') AND total > 0 ORDER BY invoice_id",
    [orgId]
  );
  let paid = 0;
  for (let i = 0; i < open.length; i += 2) {
    const inv = open[i];
    try {
      await pool.query("CALL sp_apply_payment(?, ?, 'card', ?, ?)", [inv.invoice_id, inv.total, `LT-${inv.invoice_id}`, `lt-pay-${inv.invoice_id}`]);
      paid += 1;
    } catch (err) {
      log(`  payment for invoice ${inv.invoice_id}: ${err.sqlMessage || err.message}`);
    }
  }
  log(`Payments: ${paid} invoices paid`);
}

// The database requires a ticket's creator to belong to the ticket's organization,
// so LoadTest Corp gets its own customer login.
async function ensureLoadTestCustomer(orgId) {
  const email = 'owner@loadtest.test';
  const [found] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
  let userId = found[0]?.user_id;
  if (!userId) {
    const hash = await bcrypt.hash('LoadTest123!', 10);
    const [res] = await pool.query(
      "INSERT INTO users(email, password_hash, full_name, system_role) VALUES (?, ?, 'LoadTest Owner', 'customer')",
      [email, hash]
    );
    userId = res.insertId;
  }
  await pool.query("INSERT IGNORE INTO org_members(org_id, user_id, member_role) VALUES (?, ?, 'owner')", [orgId, userId]);
  return userId;
}

const SUBJECTS = [
  'Database connection timeout on production server',
  'Slow disk performance after resize',
  'Cannot attach volume to instance',
  'DNS record not resolving',
  'Invoice amount looks higher than expected',
  'Request to increase instance quota',
  'High latency between regions',
  'Snapshot restore failed',
  'Need help choosing an instance type',
  'Server stuck in pending state',
];
const BODIES = [
  'Our database queries became slow after the last maintenance window and performance dropped noticeably.',
  'The server stopped responding to SSH and the console shows a timeout. Please check the host.',
  'We added an index on the orders table but the query plan did not change. Can you review the performance?',
  'The attached volume is not visible inside the operating system after the attach request completed.',
  'Could you confirm whether the last invoice includes compute hours for the stopped servers?',
  'Thanks for the quick answer. The issue is resolved on our side, you can close the ticket.',
  'We see packet loss between two instances in different regions during peak traffic.',
  'The snapshot shows as available but restoring it creates an empty volume.',
];

async function generateTickets(orgId) {
  if (!TICKETS) return;
  const [have] = await pool.query('SELECT COUNT(*) AS c FROM tickets WHERE org_id = ?', [orgId]);
  if (Number(have[0].c) >= TICKETS) {
    log(`Tickets: ${have[0].c} already exist for ${ORG_NAME}, skipping`);
    return;
  }
  const [sup] = await pool.query("SELECT user_id FROM users WHERE email = 'support@nimbus.test'");
  if (!sup[0]) {
    log('Tickets: support demo user not found. Run: npm run seed-users, then run this script again');
    return;
  }
  const customerId = await ensureLoadTestCustomer(orgId);
  const supportId = sup[0].user_id;
  const priorities = ['low', 'medium', 'medium', 'high', 'critical'];
  const statuses = ['open', 'in_progress', 'resolved', 'closed', 'closed'];
  const now = Date.now();
  const toMake = TICKETS - Number(have[0].c);

  const conn = await pool.getConnection();
  try {
    for (let done = 0; done < toMake; done += 200) {
      const n = Math.min(200, toMake - done);
      const created = [];
      const ticketRows = [];
      for (let i = 0; i < n; i += 1) {
        const at = new Date(now - rand(0, DAYS) * 86400 * 1000);
        const status = pick(statuses);
        created.push(at);
        ticketRows.push([orgId, customerId, status === 'open' ? null : supportId, pick(SUBJECTS), pick(priorities), status, fmt(at)]);
      }
      await conn.beginTransaction();
      const [res] = await conn.query(
        'INSERT INTO tickets (org_id, created_by, assigned_to, subject, priority, status, created_at) VALUES ?',
        [ticketRows]
      );
      const firstId = res.insertId;
      const messageRows = [];
      for (let i = 0; i < n; i += 1) {
        const count = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < count; k += 1) {
          const at = new Date(created[i].getTime() + k * rand(1, 20) * 3600 * 1000);
          messageRows.push([firstId + i, k % 2 === 0 ? customerId : supportId, pick(BODIES), fmt(at)]);
        }
      }
      await conn.query('INSERT INTO ticket_messages (ticket_id, sender_id, body, created_at) VALUES ?', [messageRows]);
      await conn.commit();
    }
  } finally {
    conn.release();
  }
  log(`Tickets: ${toMake} created with messages`);
}

async function main() {
  log(`Generating data: ${INSTANCES} servers, ${DAYS} days, ${TICKETS} tickets`);
  const orgId = await ensureOrg();
  log(`Organization "${ORG_NAME}" has id ${orgId}`);

  const instances = await launchInstances(orgId);
  await generateUsage(orgId, instances);
  await generateInvoices(orgId);
  await generateTickets(orgId);

  log('Refreshing the star schema...');
  await pool.query('CALL sp_refresh_star_schema(DATE_SUB(CURRENT_DATE, INTERVAL ? DAY), CURRENT_DATE)', [Math.min(DAYS, 2900)]);

  log('Refreshing table statistics...');
  await pool.query('ANALYZE TABLE usage_records, instances, invoices, invoice_items, ticket_messages, audit_log, fact_usage_daily');

  const counts = {};
  for (const t of ['usage_records', 'instances', 'invoices', 'invoice_items', 'tickets', 'ticket_messages', 'audit_log', 'fact_usage_daily']) {
    const [r] = await pool.query(`SELECT COUNT(*) AS c FROM ${t}`);
    counts[t] = Number(r[0].c).toLocaleString();
  }
  log('\nRow counts:');
  for (const [t, c] of Object.entries(counts)) log(`  ${t.padEnd(16)} ${c}`);
  log('\nDone. Open the Performance Lab and run the benchmarks.');
}

try {
  await main();
} catch (err) {
  console.error(`\nFailed: ${err.sqlMessage || err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
