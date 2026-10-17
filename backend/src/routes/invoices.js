import { Router } from 'express';
import { withDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { paymentLimiter } from '../middleware/rateLimiter.js';
import { idParamSchema, payInvoiceSchema } from '../validation/schemas.js';
import { applyPayment } from '../services/billing.service.js';

const router = Router();

router.use(authenticate);

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

// GET /invoices - List invoices
router.get('/', async (req, res, next) => {
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

// GET /invoices/:id - Invoice detail
router.get('/:id', validate({ params: idParamSchema }), async (req, res, next) => {
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

// POST /invoices/:id/pay - Pay invoice
router.post(
  '/:id/pay',
  paymentLimiter,
  validate({ params: idParamSchema, body: payInvoiceSchema }),
  async (req, res, next) => {
    try {
      const invoiceId = Number(req.params.id);
      const idempotencyKey = req.headers['idempotency-key'] || null;
      const { amount, method, payment_method, txn_ref } = req.body;
      const u = req.user;

      const result = await withDb(req, async (conn) => {
        await verifyInvoiceAccess(conn, u, invoiceId);
        return applyPayment(conn, {
          invoiceId,
          amount,
          method: method || payment_method || 'card',
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

export default router;

