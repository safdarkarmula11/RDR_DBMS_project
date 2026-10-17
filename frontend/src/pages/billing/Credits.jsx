import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import DataTable from '../../ui/DataTable';
import Banner from '../../ui/Banner';
import { CreditCard, Plus, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useToast } from '../../ui/Toast';

export default function Credits() {
  const toast = useToast();
  const [orgs, setOrgs] = useState([]);
  const [creditTransactions, setCreditTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Modal
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditForm, setCreditForm] = useState({
    org_id: '',
    amount: '',
    reason: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [orgsRes, txRes] = await Promise.allSettled([
        api.get('/billing/organizations'),
        api.get('/billing/credits/transactions')
      ]);

      const fallbackOrgs = [
        { org_id: 1, name: 'Acme Enterprises', credit_balance: 150.00, tier_name: 'Developer' },
        { org_id: 2, name: 'Stark Technologies', credit_balance: 1200.00, tier_name: 'Enterprise' },
        { org_id: 3, name: 'Wayne Logistics', credit_balance: 0.00, tier_name: 'Startup' },
        { org_id: 4, name: 'Cyberdyne Systems', credit_balance: 450.00, tier_name: 'Startup' },
      ];

      const fallbackTx = [
        { tx_id: 201, org_name: 'Acme Enterprises', type: 'credit_grant', amount: 150.00, reason: 'Promotional onboarding credit', created_at: '2026-10-01' },
        { tx_id: 200, org_name: 'Stark Technologies', type: 'credit_grant', amount: 1200.00, reason: 'Enterprise annual commitment bonus', created_at: '2026-09-15' },
        { tx_id: 198, org_name: 'Acme Enterprises', type: 'invoice_deduction', amount: 20.00, reason: 'Deducted on INV-01002 settlement', created_at: '2026-10-05' },
      ];

      setOrgs(orgsRes.status === 'fulfilled' && Array.isArray(orgsRes.value) ? orgsRes.value : fallbackOrgs);
      setCreditTransactions(txRes.status === 'fulfilled' && Array.isArray(txRes.value) ? txRes.value : fallbackTx);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGrantCredit = async (e) => {
    e.preventDefault();
    if (!creditForm.org_id || !creditForm.amount || Number(creditForm.amount) <= 0) {
      toast.error('Organization and a positive credit amount are required.');
      return;
    }
    try {
      setActionLoading(true);
      await api.post('/billing/credits', {
        org_id: Number(creditForm.org_id),
        amount: Number(creditForm.amount),
        reason: creditForm.reason
      });
      toast.success('Credit granted to customer balance.');
      setShowCreditModal(false);
      setCreditForm({ org_id: '', amount: '', reason: '' });
      await fetchData();
    } catch (err) {
      toast.error(err.msg || 'Credit grant failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Customer Credits & Adjustments</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Manage prepaid credit reserves, service SLA adjustments, and refunds
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => setShowCreditModal(true)}>
          Issue Customer Credit
        </Button>
      </div>

      {/* Organizations Credit Pool Table */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Active Tenant Balances</div>
        <DataTable
          columns={[
            { header: 'Organization ID', accessor: 'org_id', render: (row) => <span className="mono">#{row.org_id}</span> },
            { header: 'Organization Name', accessor: 'name', render: (row) => <strong>{row.name}</strong> },
            { header: 'Plan Tier', accessor: 'tier_name' },
            {
              header: 'Available Credit Pool',
              accessor: 'credit_balance',
              align: 'right',
              className: 'money',
              render: (row) => (
                <strong style={{ color: 'var(--brand)' }}>
                  ${Number(row.credit_balance).toFixed(2)}
                </strong>
              )
            }
          ]}
          data={orgs}
          keyField="org_id"
          loading={loading}
        />
      </div>

      {/* Credit Ledger Table */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Credit Activity Ledger</div>
        <DataTable
          columns={[
            { header: 'Transaction #', accessor: 'tx_id', render: (row) => <span className="mono">#{row.tx_id}</span> },
            { header: 'Customer', accessor: 'org_name', render: (row) => <strong>{row.org_name}</strong> },
            {
              header: 'Operation',
              accessor: 'type',
              render: (row) => (
                <span className={`badge ${row.type.includes('grant') ? 'badge--ok' : 'badge--brand'}`}>
                  {row.type.replace('_', ' ')}
                </span>
              )
            },
            {
              header: 'Amount',
              accessor: 'amount',
              align: 'right',
              className: 'money',
              render: (row) => (
                <span style={{ color: row.type.includes('grant') ? 'var(--ok)' : 'var(--ink)' }}>
                  {row.type.includes('grant') ? '+' : '-'}${Number(row.amount).toFixed(2)}
                </span>
              )
            },
            { header: 'Memo & Justification', accessor: 'reason' },
            { header: 'Timestamp', accessor: 'created_at' }
          ]}
          data={creditTransactions}
          keyField="tx_id"
          loading={loading}
        />
      </div>

      {/* Issue Credit Modal */}
      {showCreditModal && (
        <div className="modal-overlay" onClick={() => setShowCreditModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Issue Customer Credit Adjustment</h3>
            </div>
            <form onSubmit={handleGrantCredit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="credit-org">Recipient Organization</label>
                  <select
                    id="credit-org"
                    className="input-element"
                    value={creditForm.org_id}
                    onChange={(e) => setCreditForm(f => ({ ...f, org_id: e.target.value }))}
                    required
                  >
                    <option value="">-- Choose Tenant --</option>
                    {orgs.map(o => (
                      <option key={o.org_id} value={o.org_id}>{o.name} (Current: ${Number(o.credit_balance).toFixed(2)})</option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Credit Amount ($USD)"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={creditForm.amount}
                  onChange={(e) => setCreditForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="50.00"
                  required
                />

                <Input
                  label="Audit Justification Memo"
                  value={creditForm.reason}
                  onChange={(e) => setCreditForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. SLA compensation for host reboot incident"
                  required
                />
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setShowCreditModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={actionLoading}>Grant Credit</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

