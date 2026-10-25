import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import DataTable from '../../ui/DataTable';
import StatusBadge from '../../ui/StatusBadge';
import CountUp from '../../ui/CountUp';
import { Clock, AlertTriangle, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Aging() {
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState([
    { bucket: 'Current (0-30d)', overdue_count: 14, total_amount: 3840.00 },
    { bucket: 'Late (31-60d)', overdue_count: 5, total_amount: 1250.00 },
    { bucket: 'Delinquent (61-90d)', overdue_count: 2, total_amount: 720.00 },
    { bucket: 'Severe (90+d)', overdue_count: 1, total_amount: 340.00 },
  ]);

  const [overdueInvoices, setOverdueInvoices] = useState([
    { invoice_id: 1040, org_name: 'Wayne Logistics', total: 704.00, due_date: '2026-10-15', days_overdue: 2, bucket: 'Current (0-30d)', status: 'overdue' },
    { invoice_id: 994, org_name: 'Oscorp Industries', total: 520.00, due_date: '2026-09-15', days_overdue: 32, bucket: 'Late (31-60d)', status: 'overdue' },
    { invoice_id: 981, org_name: 'Initech Corp', total: 340.00, due_date: '2026-07-15', days_overdue: 94, bucket: 'Severe (90+d)', status: 'overdue' },
  ]);

  useEffect(() => {
    let mounted = true;
    async function fetchAging() {
      try {
        setLoading(true);
        const data = await api.get('/billing/aging');
        if (mounted && data) {
          if (data.buckets) setBuckets(data.buckets);
          if (data.invoices) setOverdueInvoices(data.invoices);
        }
      } catch {
        // demo state kept
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchAging();
    return () => { mounted = false; };
  }, []);

  const totalArrears = buckets.reduce((acc, b) => acc + Number(b.total_amount), 0);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1>Accounts Receivable Aging Analysis</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
          Aging report with DATEDIFF grouping (Report R10) for collection prioritization
        </p>
      </div>

      {/* Aggregate Cards */}
      <div className="grid-12" style={{ marginBottom: 24 }}>
        <div className="card card-interactive col-4">
          <div className="card-header" style={{ marginBottom: 6 }}>
            <span className="card-subtitle">Total Overdue Arrears</span>
            <AlertTriangle size={18} color="var(--danger)" />
          </div>
          <div className="money" style={{ fontSize: 28, fontWeight: 700, color: 'var(--danger)', textAlign: 'left' }}>
            <CountUp value={totalArrears} prefix="$" decimals={2} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Unpaid receivables past due date</div>
        </div>

        <div className="card col-8">
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Aging Arrears by Window ($USD)</div>
          <div style={{ height: 160, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="bucket" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Arrears']} />
                <Bar dataKey="total_amount" fill="var(--danger)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Overdue Invoices Table */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>Delinquent Accounts & Invoices</div>
        <DataTable
          columns={[
            { header: 'Invoice #', accessor: 'invoice_id', render: (row) => <strong className="mono">INV-{String(row.invoice_id).padStart(5, '0')}</strong> },
            { header: 'Customer Organization', accessor: 'org_name', render: (row) => <strong>{row.org_name}</strong> },
            { header: 'Payment Due Date', accessor: 'due_date' },
            {
              header: 'Days Overdue',
              accessor: 'days_overdue',
              align: 'right',
              className: 'mono',
              render: (row) => <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{row.days_overdue} days</span>
            },
            { header: 'Aging Bucket', accessor: 'bucket' },
            { header: 'Balance in Arrears', accessor: 'total', align: 'right', className: 'money', render: (row) => `$${Number(row.total).toFixed(2)}` },
            { header: 'Status', accessor: 'status', render: (row) => <StatusBadge value="overdue" /> }
          ]}
          data={overdueInvoices}
          keyField="invoice_id"
          loading={loading}
        />
      </div>
    </div>
  );
}

