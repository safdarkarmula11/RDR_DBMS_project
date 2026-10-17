import Decimal from 'decimal.js';

/**
 * Generates an invoice for an organization across a period.
 * Uses stored procedure sp_generate_invoice or prepares invoice items atomically.
 */
export async function generateInvoice(conn, { orgId, periodStart, periodEnd }) {
  const [result] = await conn.execute(
    'CALL sp_generate_invoice(?, ?, ?)',
    [orgId, periodStart, periodEnd]
  );

  const invoiceSummary = result[0]?.[0];
  return invoiceSummary;
}

/**
 * Applies a payment to an invoice with idempotency protection.
 */
export async function applyPayment(conn, { invoiceId, amount, method, txnRef, idempotencyKey = null }) {
  // Check if payment with idempotency key already exists
  if (idempotencyKey) {
    const [existing] = await conn.execute(
      'SELECT payment_id, invoice_id, amount, method, txn_ref, paid_at FROM payments WHERE idempotency_key = ?',
      [idempotencyKey]
    );
    if (existing.length > 0) {
      return {
        payment: existing[0],
        idempotent: true,
      };
    }
  }

  // Format amount as 2-decimal string using decimal.js
  const decimalAmount = new Decimal(amount).toFixed(2);

  const [result] = await conn.execute(
    'CALL sp_apply_payment(?, ?, ?, ?, ?)',
    [invoiceId, decimalAmount, method, txnRef, idempotencyKey]
  );

  const paymentOutcome = result[0]?.[0];
  return {
    payment: paymentOutcome,
    idempotent: false,
  };
}

/**
 * Adds credit to an organization balance.
 */
export async function addCredit(conn, { orgId, amount, note = null, changedBy = 0 }) {
  const decimalCredit = new Decimal(amount).toFixed(2);

  await conn.execute(
    'UPDATE organizations SET credit_balance = credit_balance + ? WHERE org_id = ?',
    [decimalCredit, orgId]
  );

  await conn.execute(
    `INSERT INTO audit_log(table_name, record_id, action, new_data, changed_by)
     VALUES ('organizations', ?, 'UPDATE', JSON_OBJECT('credit_added', ?, 'note', ?), ?)`,
    [orgId, decimalCredit, note, changedBy]
  );

  const [rows] = await conn.execute(
    'SELECT org_id, name, credit_balance FROM organizations WHERE org_id = ?',
    [orgId]
  );

  return rows[0];
}

export default {
  generateInvoice,
  applyPayment,
  addCredit,
};
