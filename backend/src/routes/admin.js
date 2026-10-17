import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import { simulateUsageSchema, perfRunSchema } from '../validation/schemas.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('super_admin'));

// GET /admin/consistency-check - Run full integrity consistency check
router.get('/consistency-check', async (req, res, next) => {
  try {
    const results = await withDb(req, async (conn) => {
      const [out] = await conn.execute('CALL sp_check_consistency()');
      return out[0] || [];
    });

    res.json({
      timestamp: new Date().toISOString(),
      violation_count: results.length,
      violations: results,
    });
  } catch (err) {
    next(err);
  }
});

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
            `INSERT INTO usage_records(recorded_at, instance_id, org_id, type_id, metric, quantity)
             VALUES (?, ?, ?, ?, 'cpu_hour', 1.000)`,
            [formattedDate, inst.instance_id, inst.org_id, inst.type_id]
          );

          // 2. Storage GB usage (random between 10 and 50)
          const storageQty = (10 + Math.random() * 40).toFixed(3);
          await conn.execute(
            `INSERT INTO usage_records(recorded_at, instance_id, org_id, type_id, metric, quantity)
             VALUES (?, ?, ?, ?, 'storage_gb', ?)`,
            [formattedDate, inst.instance_id, inst.org_id, inst.type_id, storageQty]
          );

          // 3. Egress GB usage (random between 0.1 and 5.0)
          const egressQty = (0.1 + Math.random() * 4.9).toFixed(3);
          await conn.execute(
            `INSERT INTO usage_records(recorded_at, instance_id, org_id, type_id, metric, quantity)
             VALUES (?, ?, ?, ?, 'egress_gb', ?)`,
            [formattedDate, inst.instance_id, inst.org_id, inst.type_id, egressQty]
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

// Benchmark query registry for Section 8 Performance Lab
const BENCHMARK_QUERIES = {
  Q1: {
    name: 'Usage of one instance in a date range',
    sql: `SELECT metric, SUM(quantity) FROM usage_records WHERE instance_id = 1 AND recorded_at >= '2026-01-01' AND recorded_at < '2027-01-01' GROUP BY metric`,
  },
  Q2: {
    name: 'Running instances of an organization',
    sql: `SELECT * FROM instances WHERE org_id = 2 AND status = 'running'`,
  },
  Q3: {
    name: 'Overdue invoices list',
    sql: `SELECT * FROM invoices WHERE status = 'overdue' AND due_date < CURRENT_DATE`,
  },
  Q4: {
    name: 'Invoice with items and payments (3-table join)',
    sql: `SELECT i.invoice_id, ii.item_id, p.payment_id FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.invoice_id LEFT JOIN payments p ON p.invoice_id = i.invoice_id WHERE i.invoice_id = 1`,
  },
  Q5: {
    name: 'Search tickets by words',
    sql: `SELECT * FROM ticket_messages WHERE MATCH(body) AGAINST('database performance' IN BOOLEAN MODE)`,
  },
  Q6: {
    name: 'Usage for one month across all orgs (RANGE partition pruning)',
    sql: `SELECT org_id, SUM(quantity) FROM usage_records WHERE recorded_at >= '2026-10-01' AND recorded_at < '2026-11-01' GROUP BY org_id`,
  },
  Q7: {
    name: 'Instances with auto backup enabled',
    sql: `SELECT instance_id, name, auto_backup FROM instances WHERE auto_backup = 1`,
  },
  Q8: {
    name: 'Audit history of one record',
    sql: `SELECT * FROM audit_log WHERE table_name = 'instances' AND record_id = 1 ORDER BY changed_at DESC`,
  },
  Q9: {
    name: 'Top 10 spenders this quarter',
    sql: `SELECT org_id, SUM(total) AS spend FROM invoices WHERE period_start >= '2026-07-01' GROUP BY org_id ORDER BY spend DESC LIMIT 10`,
  },
  Q10: {
    name: 'Hosts that can fit a given type',
    sql: `SELECT h.host_id, h.hostname FROM hosts h WHERE h.region_id = 1 AND h.status = 'active' AND (h.total_vcpu - h.used_vcpu >= 4) AND (h.total_ram_gb - h.used_ram_gb >= 16)`,
  },
};

// POST /admin/perf/run - Run whitelisted benchmark query with EXPLAIN ANALYZE
router.post('/perf/run', validate({ body: perfRunSchema }), async (req, res, next) => {
  try {
    const { queryId } = req.body;
    const benchmark = BENCHMARK_QUERIES[queryId];

    if (!benchmark) {
      return res.status(400).json({ code: 'INVALID_QUERY', msg: 'Unknown benchmark query ID' });
    }

    const start = performance.now();
    const result = await withDb(req, async (conn) => {
      // Run EXPLAIN ANALYZE
      const [explainRows] = await conn.execute(`EXPLAIN ANALYZE ${benchmark.sql}`);
      const durationMs = (performance.now() - start).toFixed(2);

      // Extract EXPLAIN ANALYZE text from output
      const rawExplain = explainRows[0]?.['EXPLAIN'] || JSON.stringify(explainRows);

      return {
        queryId,
        queryName: benchmark.name,
        sql: benchmark.sql,
        durationMs: Number(durationMs),
        explainAnalyze: rawExplain,
      };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
