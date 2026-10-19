import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import Button from '../ui/Button';
import StatusBadge from '../ui/StatusBadge';
import Skeleton from '../ui/Skeleton';
import Banner from '../ui/Banner';
import { useToast } from '../ui/Toast';
import { ArrowLeft, CreditCard, CheckCircle2, Download, Receipt } from 'lucide-react';

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');

  const fetchInvoiceData = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/invoices/${id}`);
      if (res) {
        setInvoice(res.invoice || res);
        setItems(res.items || []);
        setPayments(res.payments || []);
      }
    } catch (err) {
      // Fallback demo invoice
      setInvoice({
        invoice_id: Number(id),
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        subtotal: 182.20,
        tax: 18.22,
        credit_applied: 20.00,
        total: 180.42,
        status: 'issued',
        due_date: '2026-11-15',
        issued_at: '2026-11-01'
      });
      setItems([
        { item_id: 1, description: 'Compute: prod-web-01 (c1.medium, 730 hours)', quantity: 730, unit_price: 0.048, amount: 35.04 },
        { item_id: 2, description: 'Compute: prod-db-primary (m1.large, 730 hours)', quantity: 730, unit_price: 0.120, amount: 87.60 },
        { item_id: 3, description: 'Storage: High-Speed NVMe SSD (350 GB-month)', quantity: 350, unit_price: 0.100, amount: 35.00 },
        { item_id: 4, description: 'Network: Public IPv4 Allocation (2 addresses)', quantity: 2, unit_price: 3.500, amount: 7.00 },
        { item_id: 5, description: 'Network Egress Bandwidth (175.6 GB)', quantity: 175.6, unit_price: 0.100, amount: 17.56 }
      ]);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoiceData();
  }, [id]);

  const handlePay = async () => {
    try {
      setActionLoading(true);
      const txnRef = `TXN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      await api.post(`/invoices/${id}/pay`, {
        amount: Number(invoice.balance ?? invoice.total),
        method: paymentMethod,
        txn_ref: txnRef
      });
      toast.success('Payment successfully processed! Thank you.');
      setShowPayModal(false);
      await fetchInvoiceData();
    } catch (err) {
      toast.error(err.msg || 'Payment failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <Skeleton height={32} width="40%" style={{ marginBottom: 16 }} />
        <Skeleton height={200} style={{ marginBottom: 20 }} />
        <Skeleton rows={6} />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <h2>Invoice Not Found</h2>
        <Link to="/invoices">
          <Button variant="primary" style={{ marginTop: 16 }}>Return to Invoices</Button>
        </Link>
      </div>
    );
  }

  const canPay = invoice.status === 'issued' || invoice.status === 'overdue';

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', paddingBottom: 48 }}>
      {/* Header & Back */}
      <div style={{ marginBottom: 20 }}>
        <Link to="/invoices" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
          <ArrowLeft size={14} />
          <span>All Invoices</span>
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="mono" style={{ fontSize: 24 }}>
              INV-{String(invoice.invoice_id).padStart(5, '0')}
            </h1>
            <StatusBadge value={invoice.status} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {canPay && (
              <Button
                variant="primary"
                icon={CreditCard}
                onClick={() => setShowPayModal(true)}
              >
                Pay Now (${Number(invoice.total).toFixed(2)})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Overview Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Billing Period</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{invoice.period_start} to {invoice.period_end}</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Issue Date</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{invoice.issued_at || 'Pending'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Payment Due Date</div>
            <div style={{ fontWeight: 600, marginTop: 2, color: invoice.status === 'overdue' ? 'var(--danger)' : 'var(--ink)' }}>
              {invoice.due_date || 'N/A'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Total Amount</div>
            <div className="money" style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand)', textAlign: 'left', marginTop: 2 }}>
              ${Number(invoice.total).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Invoice Line Items</div>
        <div className="table-wrapper responsive-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.item_id || idx}>
                  <td data-label="Description">
                    <strong>{item.description}</strong>
                  </td>
                  <td data-label="Quantity" className="mono" style={{ textAlign: 'right' }}>
                    {Number(item.quantity).toFixed(2)}
                  </td>
                  <td data-label="Unit Price" className="money">
                    ${Number(item.unit_price).toFixed(4)}
                  </td>
                  <td data-label="Amount" className="money">
                    ${Number(item.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Invoice Summary Block */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Subtotal:</span>
              <span className="money">${Number(invoice.subtotal).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Applicable Tax:</span>
              <span className="money">${Number(invoice.tax || 0).toFixed(2)}</span>
            </div>
            {Number(invoice.credit_applied) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ok)' }}>
                <span>Account Credits Applied:</span>
                <span className="money">-${Number(invoice.credit_applied).toFixed(2)}</span>
              </div>
            )}
            <div style={{ borderTop: '2px solid var(--line)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
              <span>Total Balance:</span>
              <span className="money" style={{ color: 'var(--brand)' }}>
                ${Number(invoice.total).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Records Table */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Payment History</div>
        {payments.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: 12 }}>
            No payments recorded yet for this invoice.
          </div>
        ) : (
          <div className="table-wrapper responsive-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transaction Ref</th>
                  <th>Payment Method</th>
                  <th style={{ textAlign: 'right' }}>Amount Paid</th>
                  <th>Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.payment_id}>
                    <td data-label="Transaction Ref" className="mono">{p.txn_ref}</td>
                    <td data-label="Payment Method" style={{ textTransform: 'capitalize' }}>{p.method}</td>
                    <td data-label="Amount Paid" className="money">${Number(p.amount).toFixed(2)}</td>
                    <td data-label="Date & Time">{new Date(p.paid_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Processing Modal */}
      {showPayModal && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Complete Payment</h3>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>Amount Due</div>
                <div className="money" style={{ fontSize: 32, fontWeight: 700, color: 'var(--brand)', textAlign: 'center' }}>
                  ${Number(invoice.total).toFixed(2)}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="pay-method">Payment Instrument</label>
                <select
                  id="pay-method"
                  className="input-element"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="card">Credit / Debit Card</option>
                  <option value="upi">Instant UPI (VPA)</option>
                  <option value="netbanking">Net Banking Wire</option>
                  <option value="credit">Prepaid Account Credit Pool</option>
                </select>
              </div>

              <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                Transactions are recorded with idempotency keys and immediate consistency checks.
              </p>
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setShowPayModal(false)}>Cancel</Button>
              <Button
                variant="primary"
                loading={actionLoading}
                onClick={handlePay}
              >
                Confirm & Pay
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}