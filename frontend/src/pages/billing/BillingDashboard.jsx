import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import StatusBadge from '../../ui/StatusBadge';
import DataTable from '../../ui/DataTable';
import Skeleton from '../../ui/Skeleton';
import { DollarSign, Clock, AlertTriangle, CreditCard, ArrowRight, FilePlus } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import Banner from '../../ui/Banner';

export default function BillingDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [kpis, setKpis] = useState({
    monthlyBilled: 0,
    outstandingReceivables: 0,
    overdueArrears: 0,
    creditPool: 0
  });
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [revenueTrend, setRevenueTrend] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function loadBillingOverview() {
      try {
        setLoading(true);
        const data = await api.get('/billing/overview');
        if (mounted && data) {
          if (data.kpis) setKpis(data.kpis);
          if (data.recentInvoices) setRecentInvoices(data.recentInvoices);
          if (data.revenueTrend) setRevenueTrend(data.revenueTrend);
          setLoadError(null);
        }
      } catch (err) {
        setLoadError({ msg: 'Could not load the billing overview.', hint: err.msg });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadBillingOverview();
    return () => { mounted = false; };
  }, []);


  return (
    <div>
      {loadError && <Banner tone="danger" message={loadError.msg} hint={loadError.hint} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Billing & Accounts Receivable</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Financial monitoring, customer credit balances, and invoicing pipeline
          </p>
        </div>

        <Button variant="primary" icon={FilePlus} onClick={() => navigate('/billing/generate')}>
          Run Invoicing Cycle
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid-12" style={{ marginBottom: 24 }}>
        <div className="card col-3">
          <div className="card-header" style={{ marginBottom: 6 }}>
            <span className="card-subtitle">Billed This Month</span>
            <DollarSign size={18} color="var(--ok)" />
          </div>
          <div className="money" style={{ fontSize: 26, fontWeight: 700, textAlign: 'left' }}>
            ${kpis.monthlyBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ok)', marginTop: 4 }}>+4.5% vs previous cycle</div>
        </div>

        <div className="card col-3">
          <div className="card-header" style={{ marginBottom: 6 }}>
            <span className="card-subtitle">Outstanding Receivables</span>
            <Clock size={18} color="var(--brand)" />
          </div>
          <div className="money" style={{ fontSize: 26, fontWeight: 700, textAlign: 'left' }}>
            ${kpis.outstandingReceivables.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Issued & awaiting settlement</div>
        </div>

        <div className="card col-3">
          <div className="card-header" style={{ marginBottom: 6 }}>
            <span className="card-subtitle">Overdue Arrears</span>
            <AlertTriangle size={18} color="var(--danger)" />
          </div>
          <div className="money" style={{ fontSize: 26, fontWeight: 700, color: 'var(--danger)', textAlign: 'left' }}>
            ${kpis.overdueArrears.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>Past payment due date</div>
        </div>

        <div className="card col-3">
          <div className="card-header" style={{ marginBottom: 6 }}>
            <span className="card-subtitle">Active Credit Pool</span>
            <CreditCard size={18} color="var(--accent)" />
          </div>
          <div className="money" style={{ fontSize: 26, fontWeight: 700, textAlign: 'left' }}>
            ${kpis.creditPool.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Customer balances held</div>
        </div>
      </div>

      {/* Revenue Trend Chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Recurring Cloud Revenue (Trailing 6 Months)</div>
            <div className="card-subtitle">Net settled accounts volume</div>
          </div>
          <Link to="/billing/revenue" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Revenue Breakdown</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div style={{ height: 240, width: '100%', marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} tickFormatter={(val) => `$${val}`} />
              <Tooltip formatter={(val) => [`$${Number(val).toLocaleString()}`, 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="var(--brand)" fill="var(--brand)" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Invoices Across Tenants */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Recent Invoices Across Tenants</div>
          <Link to="/billing/invoices" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>View All Invoices</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <DataTable
          columns={[
            { header: 'Invoice #', accessor: 'invoice_id', render: (row) => <strong className="mono">INV-{String(row.invoice_id).padStart(5, '0')}</strong> },
            { header: 'Customer Organization', accessor: 'org_name', render: (row) => <strong>{row.org_name}</strong> },
            { header: 'Cycle End', accessor: 'period_end' },
            { header: 'Total Amount', accessor: 'total', align: 'right', className: 'money', render: (row) => `$${Number(row.total).toFixed(2)}` },
            { header: 'Status', accessor: 'status', render: (row) => <StatusBadge value={row.status} /> },
            { header: 'Due Date', accessor: 'due_date' },
            {
              header: 'Action',
              align: 'right',
              render: (row) => (
                <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/${row.invoice_id}`)}>
                  Details
                </Button>
              )
            }
          ]}
          data={recentInvoices}
          keyField="invoice_id"
          loading={loading}
        />
      </div>
    </div>
  );
}