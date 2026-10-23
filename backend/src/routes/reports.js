import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';

const router = Router();

router.use(authenticate);

// R1: Monthly revenue by region and instance type with ROLLUP (JOIN 5 tables, GROUP BY WITH ROLLUP)
router.get('/R1', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT IF(GROUPING(r.name), 'All Regions', r.name) AS region_name,
                IF(GROUPING(t.name), 'All Types', t.name) AS type_name,
                COUNT(DISTINCT ii.item_id) AS item_count,
                ROUND(COALESCE(SUM(ii.amount), 0), 2) AS total_revenue
         FROM regions r
         JOIN hosts h ON h.region_id = r.region_id
         JOIN instances i ON i.host_id = h.host_id
         JOIN instance_types t ON t.type_id = i.type_id
         JOIN v_invoice_items ii ON ii.instance_id = i.instance_id
         JOIN v_invoices inv ON inv.invoice_id = ii.invoice_id AND inv.status <> 'void'
         GROUP BY r.name, t.name WITH ROLLUP`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R2: Top 10 customers by spend with rank and share of total (Window RANK(), SUM() OVER ())
router.get('/R2', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `WITH customer_spend AS (
           SELECT o.org_id, o.name AS org_name,
                  ROUND(COALESCE(SUM(inv.total), 0), 2) AS total_spend
           FROM organizations o
           LEFT JOIN v_invoices inv ON inv.org_id = o.org_id AND inv.status <> 'void'
           GROUP BY o.org_id, o.name
         )
         SELECT org_id, org_name, total_spend,
                RANK() OVER (ORDER BY total_spend DESC) AS spend_rank,
                ROUND(100 * total_spend / NULLIF(SUM(total_spend) OVER (), 0), 2) AS share_pct
         FROM customer_spend
         ORDER BY spend_rank ASC
         LIMIT 10`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R3: Month-over-month revenue growth percent (Window LAG())
router.get('/R3', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `WITH monthly_rev AS (
           SELECT DATE_FORMAT(period_start, '%Y-%m') AS month,
                  ROUND(SUM(total), 2) AS revenue
           FROM v_invoices
           WHERE status IN ('issued', 'paid', 'overdue')
           GROUP BY DATE_FORMAT(period_start, '%Y-%m')
         )
         SELECT month, revenue,
                LAG(revenue, 1) OVER (ORDER BY month) AS prev_month_revenue,
                ROUND(100 * (revenue - LAG(revenue, 1) OVER (ORDER BY month)) / NULLIF(LAG(revenue, 1) OVER (ORDER BY month), 0), 2) AS growth_pct
         FROM monthly_rev
         ORDER BY month ASC`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R4: Running cost within the month per organization (Window SUM() OVER (ORDER BY ...))
router.get('/R4', async (req, res, next) => {
  try {
    const isCustomer = req.user.role === 'customer';
    const params = isCustomer ? [req.user.org_id || 0] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `
        SELECT org_id, usage_date, daily_cost,
               ROUND(SUM(daily_cost) OVER (PARTITION BY org_id, DATE_FORMAT(usage_date, '%Y-%m') ORDER BY usage_date), 2) AS running_month_cost
        FROM (
          SELECT u.org_id, DATE(u.recorded_at) AS usage_date,
                 ROUND(SUM(CASE WHEN u.metric = 'cpu_hour' THEN u.quantity * fn_hourly_price(u.type_id, DATE(u.recorded_at)) ELSE u.quantity * 0.05 END), 2) AS daily_cost
          FROM v_usage_records u
          ${isCustomer ? 'WHERE u.org_id = ?' : ''}
          GROUP BY u.org_id, DATE(u.recorded_at)
        ) daily
        ORDER BY org_id, usage_date`;
      const [result] = await conn.execute(sql, params);
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R5: Customer segmentation into quartiles by spend (NTILE(4))
router.get('/R5', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `WITH org_spend AS (
           SELECT o.org_id, o.name AS org_name,
                  COALESCE(SUM(inv.total), 0.00) AS total_spend
           FROM organizations o
           LEFT JOIN v_invoices inv ON inv.org_id = o.org_id AND inv.status <> 'void'
           GROUP BY o.org_id, o.name
         )
         SELECT org_id, org_name, total_spend,
                NTILE(4) OVER (ORDER BY total_spend DESC) AS spend_quartile
         FROM org_spend
         ORDER BY spend_quartile ASC, total_spend DESC`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R6: Total cost of an organization including all child organizations (Recursive CTE)
router.get('/R6', async (req, res, next) => {
  try {
    const isCustomer = req.user.role === 'customer';
    const targetOrg = isCustomer ? req.user.org_id : (Number(req.query.org_id) || req.user.org_id || 1);

    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `WITH RECURSIVE org_tree AS (
           SELECT org_id, name, parent_org_id, 0 AS level
           FROM organizations
           WHERE org_id = ?
           UNION ALL
           SELECT o.org_id, o.name, o.parent_org_id, ot.level + 1
           FROM organizations o
           JOIN org_tree ot ON o.parent_org_id = ot.org_id
         )
         SELECT ot.org_id, ot.name, ot.parent_org_id, ot.level,
                COALESCE(SUM(inv.total), 0.00) AS total_cost
         FROM org_tree ot
         LEFT JOIN v_invoices inv ON inv.org_id = ot.org_id AND inv.status <> 'void'
         GROUP BY ot.org_id, ot.name, ot.parent_org_id, ot.level
         ORDER BY ot.level, ot.name`,
        [targetOrg]
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R7: Resource dependency tree: instance, volumes, snapshots, IP (Multi-table JOIN, UNION ALL)
router.get('/R7', async (req, res, next) => {
  try {
    const isCustomer = req.user.role === 'customer';
    const params = isCustomer ? [req.user.org_id, req.user.org_id, req.user.org_id, req.user.org_id] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `
        SELECT 'instance' AS resource_type, i.instance_id AS resource_id, i.name AS resource_name,
               NULL AS parent_type, NULL AS parent_id, i.status
        FROM instances i ${isCustomer ? 'WHERE i.org_id = ?' : ''}
        UNION ALL
        SELECT 'ip_address' AS resource_type, ip.ip_id AS resource_id, ip.ip_address AS resource_name,
               'instance' AS parent_type, ip.instance_id AS parent_id, 'allocated' AS status
        FROM ip_addresses ip
        JOIN instances i ON i.instance_id = ip.instance_id ${isCustomer ? 'WHERE i.org_id = ?' : ''}
        UNION ALL
        SELECT 'volume' AS resource_type, v.volume_id AS resource_id, v.name AS resource_name,
               IF(v.instance_id IS NOT NULL, 'instance', NULL) AS parent_type, v.instance_id AS parent_id, v.status
        FROM volumes v ${isCustomer ? 'WHERE v.org_id = ?' : ''}
        UNION ALL
        SELECT 'snapshot' AS resource_type, s.snapshot_id AS resource_id, s.name AS resource_name,
               'volume' AS parent_type, s.volume_id AS parent_id, 'ready' AS status
        FROM snapshots s
        JOIN volumes v ON v.volume_id = s.volume_id ${isCustomer ? 'WHERE v.org_id = ?' : ''}`;
      const [result] = await conn.execute(sql, params);
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R8: Hosts above 85 percent utilization, by region (Aggregate, HAVING)
router.get('/R8', requireRole('super_admin', 'support'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT h.host_id, h.hostname, r.name AS region_name,
                h.total_vcpu, h.used_vcpu,
                h.total_ram_gb, h.used_ram_gb,
                h.total_disk_gb, h.used_disk_gb,
                ROUND(100 * (h.used_vcpu / h.total_vcpu + h.used_ram_gb / h.total_ram_gb + h.used_disk_gb / h.total_disk_gb) / 3, 2) AS utilization_pct
         FROM hosts h
         JOIN regions r ON r.region_id = h.region_id
         WHERE h.status = 'active'
         HAVING utilization_pct > 85.0
         ORDER BY utilization_pct DESC`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R9: Customers who never raised a ticket but spend above average (Subquery, NOT EXISTS)
router.get('/R9', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `WITH avg_spend AS (
           SELECT AVG(org_total) AS threshold FROM (
             SELECT SUM(total) AS org_total FROM v_invoices WHERE status <> 'void' GROUP BY org_id
           ) x
         )
         SELECT o.org_id, o.name AS org_name, ROUND(SUM(inv.total), 2) AS total_spend
         FROM organizations o
         JOIN v_invoices inv ON inv.org_id = o.org_id AND inv.status <> 'void'
         WHERE NOT EXISTS (
           SELECT 1 FROM tickets t WHERE t.org_id = o.org_id
         )
         GROUP BY o.org_id, o.name
         HAVING total_spend > (SELECT COALESCE(threshold, 0) FROM avg_spend)
         ORDER BY total_spend DESC`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R10: Overdue aging buckets (0-30, 31-60, 61-90, 90+) (CASE, GROUP BY, DATEDIFF)
router.get('/R10', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT CASE
                  WHEN DATEDIFF(CURRENT_DATE, due_date) <= 30 THEN '0-30 days'
                  WHEN DATEDIFF(CURRENT_DATE, due_date) <= 60 THEN '31-60 days'
                  WHEN DATEDIFF(CURRENT_DATE, due_date) <= 90 THEN '61-90 days'
                  ELSE '90+ days'
                END AS aging_bucket,
                COUNT(*) AS invoice_count,
                ROUND(SUM(total), 2) AS total_overdue_amount,
                ROUND(SUM(fn_invoice_balance(invoice_id)), 2) AS outstanding_balance
         FROM v_invoices
         WHERE status = 'overdue' OR (status = 'issued' AND due_date < CURRENT_DATE)
         GROUP BY aging_bucket
         ORDER BY MIN(DATEDIFF(CURRENT_DATE, due_date)) ASC`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R11: Instances launched per hour of day (peak load) (GROUP BY HOUR(), aggregate)
router.get('/R11', requireRole('super_admin', 'support'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT HOUR(created_at) AS launch_hour,
                COUNT(*) AS instances_launched,
                COUNT(DISTINCT org_id) AS distinct_orgs
         FROM instances
         GROUP BY HOUR(created_at)
         ORDER BY launch_hour ASC`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R12: Instances by image OS and tags stored in JSON config (JSON_TABLE, JSON_EXTRACT)
router.get('/R12', async (req, res, next) => {
  try {
    const isCustomer = req.user.role === 'customer';
    const params = isCustomer ? [req.user.org_id || 0] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `
        SELECT i.instance_id, i.name AS instance_name, im.os_family, im.name AS os_name,
               JSON_UNQUOTE(JSON_EXTRACT(i.config, '$.tags.env')) AS env_tag,
               JSON_UNQUOTE(JSON_EXTRACT(i.config, '$.tags.role')) AS role_tag,
               i.auto_backup, i.status
        FROM instances i
        JOIN v_images im ON im.image_id = i.image_id
        ${isCustomer ? 'WHERE i.org_id = ?' : ''}
        ORDER BY im.os_family, i.instance_id`;
      const [result] = await conn.execute(sql, params);
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R13: Price paid under old versus new pricing for the same usage (temporal join on valid_from/valid_to)
router.get('/R13', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT t.name AS type_name,
                u.metric,
                ROUND(SUM(u.quantity), 2) AS total_qty,
                p_current.price_per_hour AS current_price,
                ROUND(SUM(u.quantity) * p_current.price_per_hour, 2) AS cost_at_current_price,
                p_old.price_per_hour AS historical_price,
                ROUND(SUM(u.quantity) * p_old.price_per_hour, 2) AS cost_at_historical_price,
                ROUND(SUM(u.quantity) * (p_current.price_per_hour - p_old.price_per_hour), 2) AS price_delta
         FROM v_usage_records u
         JOIN instance_types t ON t.type_id = u.type_id
         JOIN pricing p_current ON p_current.type_id = t.type_id AND p_current.valid_to IS NULL
         JOIN pricing p_old ON p_old.type_id = t.type_id AND p_old.valid_to IS NOT NULL
         WHERE u.metric = 'cpu_hour'
         GROUP BY t.type_id, t.name, u.metric, p_current.price_per_hour, p_old.price_per_hour`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R14: Ticket full-text search with relevance score (MATCH ... AGAINST)
router.get('/R14', async (req, res, next) => {
  try {
    const query = String(req.query.q || 'error').trim();
    const isCustomer = req.user.role === 'customer';
    const params = isCustomer ? [query, query, req.user.org_id || 0] : [query, query];

    const rows = await withDb(req, async (conn) => {
      const sql = `
        SELECT t.ticket_id, t.subject, t.status, t.priority,
               tm.body,
               MATCH(tm.body) AGAINST(? IN BOOLEAN MODE) AS relevance_score
        FROM ticket_messages tm
        JOIN tickets t ON t.ticket_id = tm.ticket_id
        WHERE MATCH(tm.body) AGAINST(? IN BOOLEAN MODE)
        ${isCustomer ? 'AND t.org_id = ?' : ''}
        ORDER BY relevance_score DESC`;
      const [result] = await conn.execute(sql, params);
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R15: Average ticket resolution time per agent (JOIN, AVG, TIMESTAMPDIFF)
router.get('/R15', requireRole('super_admin', 'support'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT u.user_id AS agent_id, u.full_name AS agent_name,
                COUNT(t.ticket_id) AS resolved_count,
                ROUND(AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.updated_at)) / 60, 2) AS avg_resolution_hours
         FROM users u
         JOIN tickets t ON t.assigned_to = u.user_id
         WHERE t.status IN ('resolved', 'closed')
         GROUP BY u.user_id, u.full_name
         ORDER BY avg_resolution_hours ASC`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R16: Host capacity forecast: days until region full at current growth (CTE, window functions, arithmetic)
router.get('/R16', requireRole('super_admin'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `WITH daily_growth AS (
           SELECT r.region_id, r.name AS region_name,
                  SUM(h.total_vcpu - h.used_vcpu) AS free_vcpu,
                  COALESCE(COUNT(i.instance_id) / GREATEST(DATEDIFF(CURRENT_DATE, MIN(DATE(i.created_at))), 1), 1) AS vcpu_growth_rate_per_day
           FROM regions r
           JOIN hosts h ON h.region_id = r.region_id
           LEFT JOIN instances i ON i.host_id = h.host_id AND i.created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY)
           GROUP BY r.region_id, r.name
         )
         SELECT region_name, free_vcpu,
                ROUND(vcpu_growth_rate_per_day, 2) AS growth_rate_per_day,
                ROUND(free_vcpu / NULLIF(vcpu_growth_rate_per_day, 0), 0) AS estimated_days_until_full
         FROM daily_growth
         ORDER BY estimated_days_until_full ASC`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R17: Pivot of monthly cost per resource type (Conditional aggregation)
router.get('/R17', async (req, res, next) => {
  try {
    const isCustomer = req.user.role === 'customer';
    const params = isCustomer ? [req.user.org_id || 0] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `
        SELECT DATE_FORMAT(recorded_at, '%Y-%m') AS month,
               o.name AS org_name,
               ROUND(SUM(CASE WHEN metric = 'cpu_hour' THEN quantity * fn_hourly_price(type_id, DATE(recorded_at)) ELSE 0 END), 2) AS compute_cost,
               ROUND(SUM(CASE WHEN metric = 'storage_gb' THEN quantity * 0.05 ELSE 0 END), 2) AS storage_cost,
               ROUND(SUM(CASE WHEN metric = 'egress_gb' THEN quantity * 0.05 ELSE 0 END), 2) AS network_cost,
               ROUND(SUM(CASE WHEN metric = 'cpu_hour' THEN quantity * fn_hourly_price(type_id, DATE(recorded_at)) ELSE quantity * 0.05 END), 2) AS total_cost
        FROM v_usage_records u
        JOIN organizations o ON o.org_id = u.org_id
        ${isCustomer ? 'WHERE u.org_id = ?' : ''}
        GROUP BY DATE_FORMAT(recorded_at, '%Y-%m'), o.name
        ORDER BY month DESC, total_cost DESC`;
      const [result] = await conn.execute(sql, params);
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R18: Organizations with usage but no invoice (billing gap detection) (LEFT JOIN ... IS NULL)
router.get('/R18', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT DISTINCT o.org_id, o.name AS org_name,
                DATE_FORMAT(u.recorded_at, '%Y-%m') AS usage_month,
                COUNT(u.instance_id) AS usage_records_count
         FROM organizations o
         JOIN v_usage_records u ON u.org_id = o.org_id
         LEFT JOIN v_invoices inv ON inv.org_id = o.org_id
                               AND DATE_FORMAT(inv.period_start, '%Y-%m') = DATE_FORMAT(u.recorded_at, '%Y-%m')
         WHERE inv.invoice_id IS NULL
         GROUP BY o.org_id, o.name, DATE_FORMAT(u.recorded_at, '%Y-%m')`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R19: Cumulative distribution of invoice size (PERCENT_RANK / CUME_DIST)
router.get('/R19', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const rows = await withDb(req, async (conn) => {
      const [result] = await conn.execute(
        `SELECT invoice_id, org_id, total,
                ROUND(PERCENT_RANK() OVER (ORDER BY total), 3) AS \`percent_rank\`,
                ROUND(CUME_DIST() OVER (ORDER BY total), 3) AS \`cume_dist\`
         FROM v_invoices
         WHERE status <> 'void'
         ORDER BY total DESC`
      );
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// R20: Audit trail of one invoice with who changed what (JSON_EXTRACT, JOIN users)
router.get('/R20', async (req, res, next) => {
  try {
    const invoiceId = req.query.invoice_id ? Number(req.query.invoice_id) : null;
    const isCustomer = req.user.role === 'customer';

    const rows = await withDb(req, async (conn) => {
      if (invoiceId && isCustomer) {
        const [inv] = await conn.execute(
          'SELECT org_id FROM v_invoices WHERE invoice_id = ?',
          [invoiceId]
        );
        if (!inv[0] || inv[0].org_id !== req.user.org_id) {
          const err = new Error('Invoice not found');
          err.statusCode = 404;
          err.code = 'NOT_FOUND';
          throw err;
        }
      }

      const sql = `
        SELECT a.audit_id, a.record_id AS invoice_id, a.action,
               a.old_data, a.new_data, a.changed_at,
               COALESCE(u.full_name, 'system') AS changed_by_user,
               u.email AS user_email
        FROM audit_log a
        LEFT JOIN users u ON u.user_id = a.changed_by
        WHERE a.table_name = 'invoices'
        ${invoiceId ? 'AND a.record_id = ?' : ''}
        ORDER BY a.changed_at DESC
        LIMIT 100`;

      const params = invoiceId ? [invoiceId] : [];
      const [result] = await conn.execute(sql, params);
      return result;
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
