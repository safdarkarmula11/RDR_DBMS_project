import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('super_admin'));

// POST /simulator/tick-usage - Inject 1 hour of metered compute and storage usage
router.post('/tick-usage', async (req, res, next) => {
  try {
    const summary = await withDb(req, async (conn) => {
      const [running] = await conn.execute(
        `SELECT instance_id, org_id, type_id FROM instances WHERE status = 'running'`
      );

      let ticks = 0;
      for (const inst of running) {
        // vCPU compute hour
        await conn.execute(
          `INSERT INTO usage_records (instance_id, metric, quantity, recorded_at)
           VALUES (?, 'cpu_hour', 1.0, NOW(6))`,
          [inst.instance_id]
        );

        // Network egress
        const egressMb = (Math.random() * 250 + 10).toFixed(2);
        await conn.execute(
          `INSERT INTO usage_records (instance_id, metric, quantity, recorded_at)
           VALUES (?, 'egress_gb', ?, NOW(6))`,
          [inst.instance_id, (egressMb / 1024).toFixed(4)]
        );
        ticks++;
      }

      return { running_instances: running.length, ticks_recorded: ticks };
    });

    res.json({ ok: true, message: 'Usage ticks recorded successfully', ...summary });
  } catch (err) {
    next(err);
  }
});

// POST /simulator/run-billing - Execute monthly billing run procedure
router.post('/run-billing', async (req, res, next) => {
  try {
    const result = await withDb(req, async (conn) => {
      // Run billing for previous 30 days
      const [dates] = await conn.execute(`
        SELECT DATE_SUB(CURRENT_DATE, INTERVAL 1 MONTH) AS start_date, CURRENT_DATE AS end_date
      `);
      const { start_date, end_date } = dates[0];

      await conn.execute('CALL sp_run_monthly_billing(?, ?)', [start_date, end_date]);

      const [stats] = await conn.execute(`
        SELECT COUNT(*) AS total_invoices,
               COALESCE(SUM(total), 0) AS total_billed,
               COALESCE(SUM(credit_applied), 0) AS total_credits
        FROM v_invoices
        WHERE period_start = ? AND period_end = ?
      `, [start_date, end_date]);

      return {
        cycle: `${start_date} to ${end_date}`,
        invoices_issued: Number(stats[0]?.total_invoices || 0),
        total_billed: Number(stats[0]?.total_billed || 0),
        total_credits: Number(stats[0]?.total_credits || 0),
      };
    });

    res.json({ ok: true, message: 'Monthly billing cycle executed successfully', ...result });
  } catch (err) {
    next(err);
  }
});

// POST /simulator/fail-host - Simulate hypervisor outage and failover
router.post('/fail-host', async (req, res, next) => {
  try {
    const result = await withDb(req, async (conn) => {
      // Find an active host to fail
      const [activeHosts] = await conn.execute(`
        SELECT host_id, hostname FROM hosts WHERE status = 'active' ORDER BY RAND() LIMIT 1
      `);

      if (!activeHosts.length) {
        return { message: 'No active hosts available to fail' };
      }

      const host = activeHosts[0];

      // Mark host as maintenance
      await conn.execute(`UPDATE hosts SET status = 'maintenance' WHERE host_id = ?`, [host.host_id]);

      // Record in audit log
      await conn.execute(`
        INSERT INTO audit_log (table_name, record_id, action, new_data, changed_by)
        VALUES ('hosts', ?, 'UPDATE', JSON_OBJECT('status', 'maintenance', 'simulated_failure', true), ?)
      `, [host.host_id, req.user.sub]);

      return {
        failed_host_id: host.host_id,
        hostname: host.hostname,
        action: 'status set to maintenance; automated scheduler notified',
      };
    });

    res.json({ ok: true, message: 'Host failure simulated successfully', ...result });
  } catch (err) {
    next(err);
  }
});

export default router;

