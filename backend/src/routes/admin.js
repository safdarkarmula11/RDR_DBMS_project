import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import { simulateUsageSchema, perfRunSchema } from '../validation/schemas.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('super_admin'));

// GET & POST /admin/consistency-check - Run full integrity consistency check
const handleConsistencyCheck = async (req, res, next) => {
  try {
    const results = await withDb(req, async (conn) => {
      const [out] = await conn.execute('CALL sp_check_consistency()');
      return out[0] || [];
    });

    const standardChecks = [
      { id: 'chk_1', key: 'host_used_counters', name: 'Physical Host Resource Accounting', details: 'Physical host used_vcpu, used_ram_gb, used_disk_gb match active VM rows exactly.' },
      { id: 'chk_2', key: 'host_overbooked', name: 'Hypervisor Overbooking Verification', details: 'No physical hypervisor host exceeds 100% capacity in compute or storage.' },
      { id: 'chk_3', key: 'org_quota', name: 'Tenant Tier Quota Compliance', details: 'No tenant exceeds allocated compute instance count or persistent storage quotas.' },
      { id: 'chk_4', key: 'orphan_ip', name: 'Public IP Pool Orphan Verification', details: 'No IP is allocated to a terminated or nonexistent instance ID.' },
      { id: 'chk_5', key: 'invoice_total', name: 'Invoice Item Arithmetic & Total Integrity', details: 'Invoice total is derived (subtotal + tax - credit), never negative, and subtotal equals the sum of line items.' },
      { id: 'chk_6', key: 'partition', name: 'Partition Boundary Alignment (usage_records)', details: 'RANGE COLUMNS monthly partitions are active and properly bounded.' },
    ];

    const checks = standardChecks.map(c => {
      const matchingViolations = results.filter(r => 
        (r.check_name && r.check_name.toLowerCase().includes(c.key.toLowerCase())) ||
        (r.message && r.message.toLowerCase().includes(c.key.toLowerCase()))
      );
      const issuesCount = matchingViolations.length;
      return {
        id: c.id,
        name: c.name,
        status: issuesCount === 0 ? 'pass' : 'fail',
        issues_count: issuesCount,
        details: issuesCount === 0 ? c.details : matchingViolations.map(v => v.message).join('; '),
      };
    });

    res.json({
      timestamp: new Date().toISOString(),
      violation_count: results.length,
      violations: results,
      checks,
    });
  } catch (err) {
    next(err);
  }
};

router.get('/consistency-check', handleConsistencyCheck);
router.post('/consistency-check', handleConsistencyCheck);

// GET /admin/audit - Query audit log with filters
router.get('/audit', async (req, res, next) => {
  try {
    const { table, record_id, action, limit = 50 } = req.query;
    const where = [];
    const params = [];

    if (table) {
      where.push('a.table_name = ?');
      params.push(String(table));
    }
    if (record_id) {
      where.push('a.record_id = ?');
      params.push(Number(record_id));
    }
    if (action) {
      where.push('a.action = ?');
      params.push(String(action).toUpperCase());
    }

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT a.audit_id, a.table_name, a.record_id, a.action,
                          a.old_data, a.new_data, a.changed_at, a.changed_by,
                          COALESCE(u.full_name, 'system') AS changed_by_name
                   FROM audit_log a
                   LEFT JOIN users u ON u.user_id = a.changed_by
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY a.changed_at DESC
                   LIMIT ?`;

      params.push(Math.min(Number(limit) || 50, 200));
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /admin/slow-queries - Query performance_schema via sys.statement_analysis
router.get('/slow-queries', async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT query, exec_count, total_latency, avg_latency, rows_examined, rows_sent
         FROM sys.statement_analysis
         ORDER BY avg_latency DESC
         LIMIT 25`
      );
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /admin/simulate/usage - Generate simulated usage records for demo
router.post('/simulate/usage', validate({ body: simulateUsageSchema }), async (req, res, next) => {
  try {
    const { hours } = req.body;

    const summary = await withDb(req, async (conn) => {
      // Find all running instances
      const [instances] = await conn.execute(
        `SELECT instance_id, org_id, type_id FROM instances WHERE status = 'running'`
      );

      if (instances.length === 0) {
        return { count: 0, msg: 'No running instances to simulate usage for' };
      }

      let insertedCount = 0;
      const now = new Date();

      for (let h = hours - 1; h >= 0; h--) {
        const recordTime = new Date(now.getTime() - h * 3600 * 1000);
        const formattedDate = recordTime.toISOString().slice(0, 19).replace('T', ' ');

        for (const inst of instances) {
          // 1. CPU hour usage
          await conn.execute(
            `INSERT INTO usage_records(recorded_at, instance_id, metric, quantity)
             VALUES (?, ?, 'cpu_hour', 1.000)`,
            [formattedDate, inst.instance_id]
          );

          // 2. Storage GB usage (random between 10 and 50)
          const storageQty = (10 + Math.random() * 40).toFixed(3);
          await conn.execute(
            `INSERT INTO usage_records(recorded_at, instance_id, metric, quantity)
             VALUES (?, ?, 'storage_gb', ?)`,
            [formattedDate, inst.instance_id, storageQty]
          );

          // 3. Egress GB usage (random between 0.1 and 5.0)
          const egressQty = (0.1 + Math.random() * 4.9).toFixed(3);
          await conn.execute(
            `INSERT INTO usage_records(recorded_at, instance_id, metric, quantity)
             VALUES (?, ?, 'egress_gb', ?)`,
            [formattedDate, inst.instance_id, egressQty]
          );

          insertedCount += 3;
        }
      }

      return {
        instances_simulated: instances.length,
        hours_simulated: hours,
        records_created: insertedCount,
      };
    });

    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// ==========================================================================
// PERFORMANCE LAB
// Every number returned here comes from a real EXPLAIN ANALYZE run on this
// database. The "without index" variant uses IGNORE INDEX (or a non-sargable
// form of the predicate), so no index is ever dropped or hidden: it is safe
// to run while other users are on the system.
// ==========================================================================
const RUNS = 3; // timed runs per variant, after 1 warm-up run

const BENCHMARKS = {
  Q1: {
    name: 'Q1: Usage of one instance in a date range',
    description: 'Sums usage_records for one instance over a year. Tests the covering index (instance_id, recorded_at, metric, quantity).',
    indexName: 'idx_usage_cover',
    table: 'usage_records',
    withIndex: (c) => `SELECT metric, SUM(quantity) FROM usage_records WHERE instance_id = ${c.instanceId} AND recorded_at >= '2026-01-01' AND recorded_at < '2027-01-01' GROUP BY metric`,
    withoutIndex: (c) => `SELECT metric, SUM(quantity) FROM usage_records IGNORE INDEX (idx_usage_cover) WHERE instance_id = ${c.instanceId} AND recorded_at >= '2026-01-01' AND recorded_at < '2027-01-01' GROUP BY metric`,
  },
  Q2: {
    name: 'Q2: Running instances of an organization',
    description: 'Looks up one organization\'s running instances. Tests idx_inst_org_status (org_id, status).',
    indexName: 'idx_inst_org_status',
    table: 'instances',
    withIndex: (c) => `SELECT * FROM instances WHERE org_id = ${c.orgId} AND status = 'running'`,
    withoutIndex: (c) => `SELECT * FROM instances IGNORE INDEX (idx_inst_org_status) WHERE org_id = ${c.orgId} AND status = 'running'`,
  },
  Q3: {
    name: 'Q3: Unpaid invoices past their due date',
    description: 'Finds issued invoices whose due date has passed. Tests idx_inv_due (status, due_date).',
    indexName: 'idx_inv_due',
    table: 'invoices',
    withIndex: () => `SELECT * FROM invoices WHERE status = 'issued' AND due_date < CURRENT_DATE`,
    withoutIndex: () => `SELECT * FROM invoices IGNORE INDEX (idx_inv_due) WHERE status = 'issued' AND due_date < CURRENT_DATE`,
  },
  Q4: {
    name: 'Q4: Invoice with items and payments (3-table join)',
    description: 'Joins one invoice to its line items and payments. Tests idx_ii_invoice and idx_pay_invoice.',
    indexName: 'idx_ii_invoice',
    table: 'invoice_items',
    withIndex: (c) => `SELECT i.invoice_id, ii.item_id, p.payment_id FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.invoice_id LEFT JOIN payments p ON p.invoice_id = i.invoice_id WHERE i.invoice_id = ${c.invoiceId}`,
    withoutIndex: (c) => `SELECT i.invoice_id, ii.item_id, p.payment_id FROM invoices i JOIN invoice_items ii IGNORE INDEX (idx_ii_invoice) ON ii.invoice_id = i.invoice_id LEFT JOIN payments p IGNORE INDEX (idx_pay_invoice) ON p.invoice_id = i.invoice_id WHERE i.invoice_id = ${c.invoiceId}`,
  },
  Q5: {
    name: 'Q5: Search ticket messages by words',
    description: 'FULLTEXT search (ft_tm_body) compared with a LIKE scan for the same two words.',
    indexName: 'ft_tm_body',
    table: 'ticket_messages',
    withIndex: () => `SELECT * FROM ticket_messages WHERE MATCH(body) AGAINST('+database +performance' IN BOOLEAN MODE)`,
    withoutIndex: () => `SELECT * FROM ticket_messages WHERE body LIKE '%database%' AND body LIKE '%performance%'`,
  },
  Q6: {
    name: 'Q6: One month of usage across all orgs (partition pruning)',
    description: 'A plain date range lets MySQL read only one RANGE partition. Wrapping the column in DATE_FORMAT() blocks pruning, so every partition is scanned.',
    indexName: 'PARTITION BY RANGE (recorded_at)',
    table: 'usage_records',
    withIndex: (c) => `SELECT i.org_id, SUM(u.quantity) FROM usage_records u JOIN instances i ON i.instance_id = u.instance_id WHERE u.recorded_at >= '${c.monthStart}' AND u.recorded_at < '${c.monthEnd}' GROUP BY i.org_id`,
    withoutIndex: (c) => `SELECT i.org_id, SUM(u.quantity) FROM usage_records u JOIN instances i ON i.instance_id = u.instance_id WHERE DATE_FORMAT(u.recorded_at, '%Y-%m') = '${c.monthStart.slice(0, 7)}' GROUP BY i.org_id`,
  },
  Q7: {
    name: 'Q7: Instances with auto backup enabled',
    description: 'Filters on the auto_backup column. Tests idx_inst_auto_backup.',
    indexName: 'idx_inst_auto_backup',
    table: 'instances',
    withIndex: () => `SELECT instance_id, name, auto_backup FROM instances WHERE auto_backup = 1`,
    withoutIndex: () => `SELECT instance_id, name, auto_backup FROM instances IGNORE INDEX (idx_inst_auto_backup) WHERE auto_backup = 1`,
  },
  Q8: {
    name: 'Q8: Audit history of one record',
    description: 'Reads the change history of one instance, newest first. Tests idx_audit_record (table_name, record_id, changed_at).',
    indexName: 'idx_audit_record',
    table: 'audit_log',
    withIndex: (c) => `SELECT * FROM audit_log WHERE table_name = 'instances' AND record_id = ${c.instanceId} ORDER BY changed_at DESC`,
    withoutIndex: (c) => `SELECT * FROM audit_log IGNORE INDEX (idx_audit_record) WHERE table_name = 'instances' AND record_id = ${c.instanceId} ORDER BY changed_at DESC`,
  },
  Q9: {
    name: 'Q9: Top 10 spenders this quarter (plan only)',
    description: 'Aggregation with GROUP BY and ORDER BY. Shown as a single plan, with no index comparison.',
    indexName: '-',
    table: 'invoices',
    withIndex: () => `SELECT org_id, SUM(subtotal + ROUND(subtotal * tax_rate_pct / 100, 2) - credit_applied) AS spend FROM invoices WHERE period_start >= '2026-07-01' GROUP BY org_id ORDER BY spend DESC LIMIT 10`,
    withoutIndex: null,
  },
  Q10: {
    name: 'Q10: Hosts that can fit a given instance size',
    description: 'Capacity search in one region. Tests idx_host_region_status (region_id, status).',
    indexName: 'idx_host_region_status',
    table: 'hosts',
    withIndex: (c) => `SELECT h.host_id, h.hostname FROM hosts h WHERE h.region_id = ${c.regionId} AND h.status = 'active' AND (h.total_vcpu - h.used_vcpu >= 4) AND (h.total_ram_gb - h.used_ram_gb >= 16)`,
    withoutIndex: (c) => `SELECT h.host_id, h.hostname FROM hosts h IGNORE INDEX (idx_host_region_status) WHERE h.region_id = ${c.regionId} AND h.status = 'active' AND (h.total_vcpu - h.used_vcpu >= 4) AND (h.total_ram_gb - h.used_ram_gb >= 16)`,
  },
};

const toInt = (v, fallback) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
const toDate = (v, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : fallback);

// Pick real ids from the data so the queries hit rows that exist.
async function loadContext(conn) {
  const ctx = { instanceId: 1, orgId: 1, invoiceId: 1, regionId: 1, monthStart: '2026-10-01', monthEnd: '2026-11-01' };

  const [usage] = await conn.query('SELECT u.instance_id, i.org_id FROM usage_records u JOIN instances i ON i.instance_id = u.instance_id LIMIT 1');
  if (usage[0]) {
    ctx.instanceId = toInt(usage[0].instance_id, 1);
    ctx.orgId = toInt(usage[0].org_id, 1);
  } else {
    const [inst] = await conn.query('SELECT instance_id, org_id FROM instances LIMIT 1');
    if (inst[0]) {
      ctx.instanceId = toInt(inst[0].instance_id, 1);
      ctx.orgId = toInt(inst[0].org_id, 1);
    }
  }

  const [inv] = await conn.query('SELECT invoice_id FROM invoices LIMIT 1');
  if (inv[0]) ctx.invoiceId = toInt(inv[0].invoice_id, 1);

  const [reg] = await conn.query('SELECT region_id FROM regions LIMIT 1');
  if (reg[0]) ctx.regionId = toInt(reg[0].region_id, 1);

  const [mon] = await conn.query(
    "SELECT DATE_FORMAT(MAX(recorded_at), '%Y-%m-01') AS s, DATE_FORMAT(DATE_ADD(MAX(recorded_at), INTERVAL 1 MONTH), '%Y-%m-01') AS e FROM usage_records"
  );
  if (mon[0]?.s) {
    ctx.monthStart = toDate(mon[0].s, ctx.monthStart);
    ctx.monthEnd = toDate(mon[0].e, ctx.monthEnd);
  }
  return ctx;
}

function parsePlan(text) {
  const lines = String(text).split('\n');
  const top = /actual time=([\d.]+)\.\.([\d.]+) rows=(\d+)/.exec(lines[0] || '') || /actual time=([\d.]+)\.\.([\d.]+) rows=(\d+)/.exec(text);
  let rowsRead = 0;
  for (const line of lines) {
    if (/(scan|lookup|search)/i.test(line)) {
      const m = /actual time=[\d.]+\.\.[\d.]+ rows=(\d+) loops=(\d+)/.exec(line);
      if (m) rowsRead += Number(m[1]) * Number(m[2]);
    }
  }
  return { ms: top ? Number(top[2]) : null, rowsRead };
}

const median = (arr) => {
  const a = arr.filter((x) => x !== null && !Number.isNaN(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

async function runVariant(conn, sql) {
  const runsMs = [];
  let plan = '';
  let rowsRead = 0;
  for (let i = 0; i <= RUNS; i += 1) {
    const [rows] = await conn.query(`EXPLAIN ANALYZE ${sql}`);
    plan = rows[0]?.EXPLAIN ?? Object.values(rows[0] ?? {})[0] ?? '';
    const parsed = parsePlan(plan);
    rowsRead = parsed.rowsRead;
    if (i > 0) runsMs.push(parsed.ms); // run 0 is a warm-up
  }
  return { sql, plan, runsMs, medianMs: median(runsMs), rowsRead };
}

// GET /admin/perf/benchmarks - list of available benchmarks
router.get('/perf/benchmarks', (req, res) => {
  res.json(
    Object.entries(BENCHMARKS).map(([id, b]) => ({
      id,
      name: b.name,
      description: b.description,
      indexName: b.indexName,
      table: b.table,
      hasComparison: Boolean(b.withoutIndex),
    }))
  );
});

// POST /admin/perf/run - run one benchmark with and without its index
router.post('/perf/run', validate({ body: perfRunSchema }), async (req, res, next) => {
  try {
    const { queryId } = req.body;
    const bench = BENCHMARKS[queryId];
    if (!bench) {
      return res.status(400).json({ code: 'INVALID_QUERY', msg: 'Unknown benchmark query ID' });
    }

    const result = await withDb(req, async (conn) => {
      await conn.query('SET SESSION max_execution_time = 20000');
      try {
        const ctx = await loadContext(conn);

        const [est] = await conn.query(
          'SELECT TABLE_ROWS AS r FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
          [bench.table]
        );

        const withIndex = await runVariant(conn, bench.withIndex(ctx));
        const withoutIndex = bench.withoutIndex ? await runVariant(conn, bench.withoutIndex(ctx)) : null;

        let speedup = null;
        if (withoutIndex && withIndex.medianMs > 0 && withoutIndex.medianMs !== null) {
          speedup = Number((withoutIndex.medianMs / withIndex.medianMs).toFixed(1));
        }

        return {
          queryId,
          name: bench.name,
          description: bench.description,
          indexName: bench.indexName,
          table: bench.table,
          tableRowsEstimate: Number(est[0]?.r ?? 0),
          runsPerVariant: RUNS,
          withIndex,
          withoutIndex,
          speedup,
        };
      } finally {
        await conn.query('SET SESSION max_execution_time = 0');
      }
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
