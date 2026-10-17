import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validation.js';
import { paymentLimiter } from '../middleware/rateLimiter.js';
import {
  idParamSchema,
  generateInvoiceSchema,
  payInvoiceSchema,
  addCreditSchema,
} from '../validation/schemas.js';
import { generateInvoice, applyPayment, addCredit } from '../services/billing.service.js';

const router = Router();

router.use(authenticate);

// Helper to check invoice ownership
async function verifyInvoiceAccess(conn, user, invoiceId) {
  const [rows] = await conn.execute(
    'SELECT invoice_id, org_id, status FROM invoices WHERE invoice_id = ?',
    [invoiceId]
  );
  const inv = rows[0];
  if (!inv || (user.role === 'customer' && inv.org_id !== user.org_id)) {
    const err = new Error('Invoice not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  return inv;
}

// GET /billing/invoices - List invoices
router.get('/invoices', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';
    const params = isCustomer ? [u.org_id || 0] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT i.*, o.name AS org_name,
                          fn_invoice_balance(i.invoice_id) AS balance
                   FROM invoices i
                   JOIN organizations o ON o.org_id = i.org_id
                   ${isCustomer ? 'WHERE i.org_id = ?' : ''}
                   ORDER BY i.period_start DESC, i.invoice_id DESC`;
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /billing/invoices/:id - Invoice detail with items and payments
router.get('/invoices/:id', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.id);
    const u = req.user;

    const data = await withDb(req, async (conn) => {
      await verifyInvoiceAccess(conn, u, invoiceId);

      const [invoiceRows] = await conn.execute(
        `SELECT i.*, o.name AS org_name, fn_invoice_balance(i.invoice_id) AS balance
         FROM invoices i
         JOIN organizations o ON o.org_id = i.org_id
         WHERE i.invoice_id = ?`,
        [invoiceId]
      );

      const [items] = await conn.execute(
        `SELECT item_id, invoice_id, instance_id, description, quantity, unit_price, amount
         FROM invoice_items
         WHERE invoice_id = ?
         ORDER BY item_id ASC`,
        [invoiceId]
      );

      const [payments] = await conn.execute(
        `SELECT payment_id, invoice_id, amount, method, txn_ref, paid_at
         FROM payments
         WHERE invoice_id = ?
         ORDER BY paid_at DESC`,
        [invoiceId]
      );

      return {
        ...invoiceRows[0],
        items,
        payments,
      };
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /billing/invoices/generate - Generate invoice (admin/billing only)
router.post(
  '/invoices/generate',
  requireRole('super_admin', 'billing'),
  validate({ body: generateInvoiceSchema }),
  async (req, res, next) => {
    try {
      const { org_id, period_start, period_end } = req.body;
      const targetOrg = org_id || req.user.org_id;

      if (!targetOrg) {
        return res.status(400).json({ code: 'INVALID', msg: 'Organization ID is required' });
      }

      const result = await withDb(req, async (conn) => {
        return generateInvoice(conn, {
          orgId: targetOrg,
          periodStart: period_start,
          periodEnd: period_end,
        });
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /billing/invoices/:id/pay - Pay invoice (with idempotency support)
router.post(
  '/invoices/:id/pay',
  paymentLimiter,
  validate({ params: idParamSchema, body: payInvoiceSchema }),
  async (req, res, next) => {
    try {
      const invoiceId = Number(req.params.id);
      const idempotencyKey = req.headers['idempotency-key'] || null;
      const { amount, method, txn_ref } = req.body;
      const u = req.user;

      const result = await withDb(req, async (conn) => {
        await verifyInvoiceAccess(conn, u, invoiceId);
        return applyPayment(conn, {
          invoiceId,
          amount,
          method,
          txnRef: txn_ref,
          idempotencyKey,
        });
      });

      res.status(result.idempotent ? 200 : 201).json(result.payment);
    } catch (err) {
      next(err);
    }
  }
);

// GET /billing/aging - Accounts receivable aging analysis
router.get('/aging', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const data = await withDb(req, async (conn) => {
      const [rawBuckets] = await conn.execute(`
        SELECT 
          CASE 
            WHEN DATEDIFF(CURRENT_DATE, due_date) <= 30 THEN 'Current (0-30d)'
            WHEN DATEDIFF(CURRENT_DATE, due_date) <= 60 THEN 'Late (31-60d)'
            WHEN DATEDIFF(CURRENT_DATE, due_date) <= 90 THEN 'Delinquent (61-90d)'
            ELSE 'Severe (90+d)'
          END AS bucket,
          COUNT(*) AS overdue_count,
          COALESCE(SUM(total), 0) AS total_amount
        FROM invoices
        WHERE status = 'overdue'
        GROUP BY bucket
      `);

      const [invoices] = await conn.execute(`
        SELECT i.invoice_id, o.name AS org_name, i.total, i.due_date,
               DATEDIFF(CURRENT_DATE, i.due_date) AS days_overdue,
               CASE 
                 WHEN DATEDIFF(CURRENT_DATE, i.due_date) <= 30 THEN 'Current (0-30d)'
                 WHEN DATEDIFF(CURRENT_DATE, i.due_date) <= 60 THEN 'Late (31-60d)'
                 WHEN DATEDIFF(CURRENT_DATE, i.due_date) <= 90 THEN 'Delinquent (61-90d)'
                 ELSE 'Severe (90+d)'
               END AS bucket,
               i.status
        FROM invoices i
        JOIN organizations o ON o.org_id = i.org_id
        WHERE i.status = 'overdue'
        ORDER BY i.due_date ASC
      `);

      // Ensure standard 4 buckets exist in response
      const defaultBuckets = [
        { bucket: 'Current (0-30d)', overdue_count: 0, total_amount: 0 },
        { bucket: 'Late (31-60d)', overdue_count: 0, total_amount: 0 },
        { bucket: 'Delinquent (61-90d)', overdue_count: 0, total_amount: 0 },
        { bucket: 'Severe (90+d)', overdue_count: 0, total_amount: 0 },
      ];

      const buckets = defaultBuckets.map(b => {
        const found = rawBuckets.find(rb => rb.bucket === b.bucket);
        return found ? { bucket: b.bucket, overdue_count: Number(found.overdue_count), total_amount: Number(found.total_amount) } : b;
      });

      return { buckets, invoices };
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /billing/overview - Executive billing summary KPIs
router.get('/overview', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const data = await withDb(req, async (conn) => {
      const [invKpis] = await conn.execute(`
        SELECT 
          COALESCE(SUM(CASE WHEN period_start >= DATE_SUB(CURRENT_DATE, INTERVAL 30 DAY) THEN total ELSE 0 END), 0) AS monthlyBilled,
          COALESCE(SUM(CASE WHEN status IN ('issued', 'overdue') THEN total ELSE 0 END), 0) AS outstandingReceivables,
          COALESCE(SUM(CASE WHEN status = 'overdue' THEN total ELSE 0 END), 0) AS overdueArrears
        FROM invoices
      `);

      const [orgKpi] = await conn.execute(`SELECT COALESCE(SUM(credit_balance), 0) AS creditPool FROM organizations`);

      const [recentInvoices] = await conn.execute(`
        SELECT i.invoice_id, o.name AS org_name, i.period_end, i.total, i.status, i.due_date
        FROM invoices i
        JOIN organizations o ON o.org_id = i.org_id
        ORDER BY i.invoice_id DESC
        LIMIT 10
      `);

      return {
        kpis: {
          monthlyBilled: Number(invKpis[0]?.monthlyBilled || 0),
          outstandingReceivables: Number(invKpis[0]?.outstandingReceivables || 0),
          overdueArrears: Number(invKpis[0]?.overdueArrears || 0),
          creditPool: Number(orgKpi[0]?.creditPool || 0),
        },
        recentInvoices,
      };
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /billing/organizations - Customer directory with tiers and credit balances
router.get('/organizations', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const orgs = await withDb(req, async (conn) => {
      const [rows] = await conn.execute(`
        SELECT o.org_id, o.name, o.credit_balance, o.status, t.name AS tier_name
        FROM organizations o
        LEFT JOIN tiers t ON t.tier_id = o.tier_id
        ORDER BY o.name ASC
      `);
      return rows;
    });

    res.json(orgs);
  } catch (err) {
    next(err);
  }
});

// GET /billing/credits/transactions - Credit grant audit history
router.get('/credits/transactions', requireRole('super_admin', 'billing'), async (req, res, next) => {
  try {
    const txs = await withDb(req, async (conn) => {
      const [rows] = await conn.execute(`
        SELECT a.audit_id AS tx_id, o.name AS org_name,
               'credit_grant' AS type,
               JSON_UNQUOTE(JSON_EXTRACT(a.new_data, '$.credit_added')) AS amount,
               COALESCE(JSON_UNQUOTE(JSON_EXTRACT(a.new_data, '$.note')), 'Credit adjustment') AS reason,
               a.changed_at AS created_at
        FROM audit_log a
        JOIN organizations o ON o.org_id = a.record_id
        WHERE a.table_name = 'organizations' 
          AND JSON_EXTRACT(a.new_data, '$.credit_added') IS NOT NULL
        ORDER BY a.audit_id DESC
        LIMIT 50
      `);
      return rows;
    });

    res.json(txs);
  } catch (err) {
    next(err);
  }
});

// POST /billing/generate (or /billing/invoices/generate) - Generate invoices
const handleInvoiceGeneration = async (req, res, next) => {
  try {
    const { scope = 'single', org_id, period_start, period_end } = req.body;

    const result = await withDb(req, async (conn) => {
      if (scope === 'all') {
        await conn.execute('CALL sp_run_monthly_billing(?, ?)', [period_start, period_end]);

        const [summary] = await conn.execute(`
          SELECT COUNT(*) AS invoices_generated,
                 COALESCE(SUM(total), 0) AS total_billed,
                 COALESCE(SUM(credit_applied), 0) AS credits_applied
          FROM invoices
          WHERE period_start = ? AND period_end = ?
        `, [period_start, period_end]);

        return {
          invoices_generated: Number(summary[0]?.invoices_generated || 0),
          total_billed: Number(summary[0]?.total_billed || 0),
          credits_applied: Number(summary[0]?.credits_applied || 0),
          cycle: `${period_start} to ${period_end}`,
        };
      } else {
        const targetOrg = org_id || req.user.org_id;
        if (!targetOrg) {
          const err = new Error('Organization ID is required');
          err.statusCode = 400;
          err.code = 'INVALID';
          throw err;
        }

        const inv = await generateInvoice(conn, {
          orgId: targetOrg,
          periodStart: period_start,
          periodEnd: period_end,
        });

        return {
          invoices_generated: 1,
          total_billed: Number(inv.total || 0),
          credits_applied: Number(inv.credit_applied || 0),
          cycle: `${period_start} to ${period_end}`,
          invoice: inv,
        };
      }
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

router.post('/generate', requireRole('super_admin', 'billing'), validate({ body: generateInvoiceSchema }), handleInvoiceGeneration);
router.post('/invoices/generate', requireRole('super_admin', 'billing'), validate({ body: generateInvoiceSchema }), handleInvoiceGeneration);

// POST /billing/credits - Add credit to organization (admin/billing only)
router.post(
  '/credits',
  requireRole('super_admin', 'billing'),
  validate({ body: addCreditSchema }),
  async (req, res, next) => {
    try {
      const { org_id, amount, note, reason } = req.body;

      const result = await withDb(req, async (conn) => {
        return addCredit(conn, {
          orgId: org_id,
          amount,
          note: note || reason || null,
          changedBy: req.user.sub,
        });
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /billing/usage - View usage records (tenant scoped)
router.get('/usage', async (req, res, next) => {
  try {
    const u = req.user;
    const isCustomer = u.role === 'customer';
    const params = isCustomer ? [u.org_id || 0] : [];

    const rows = await withDb(req, async (conn) => {
      const sql = `SELECT u.*, i.name AS instance_name
                   FROM usage_records u
                   JOIN instances i ON i.instance_id = u.instance_id
                   ${isCustomer ? 'WHERE u.org_id = ?' : ''}
                   ORDER BY u.recorded_at DESC
                   LIMIT 200`;
      const [result] = await conn.execute(sql, params);
      return result;
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
