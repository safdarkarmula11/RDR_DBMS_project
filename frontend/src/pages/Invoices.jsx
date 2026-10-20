import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import StatusBadge from '../ui/StatusBadge';
import DataTable from '../ui/DataTable';
import Button from '../ui/Button';
import Banner from '../ui/Banner';
import { Receipt, ExternalLink, Calendar, CreditCard } from 'lucide-react';

export default function Invoices() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [bannerError, setBannerError] = useState(null);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const data = await api.get('/invoices');
      setInvoices(Array.isArray(data) ? data : []);
      setBannerError(null);
    } catch (err) {
      setBannerError({ msg: 'Could not load invoices from API.', hint: err.msg });
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter === 'all') return true;
    return inv.status === statusFilter;
  });

  const columns = [
    {
      header: 'Invoice #',
      accessor: 'invoice_id',
      render: (row) => <strong className="mono">INV-{String(row.invoice_id).padStart(5, '0')}</strong>,
    },
    {
      header: 'Billing Period',
      render: (row) => (
        <span style={{ fontSize: 13 }}>
          {row.period_start} to {row.period_end}
        </span>
      ),
    },
    {
      header: 'Subtotal',
      accessor: 'subtotal',
      align: 'right',
      className: 'money',
      render: (row) => `$${Number(row.subtotal).toFixed(2)}`,
    },
    {
      header: 'Tax',
      accessor: 'tax',
      align: 'right',
      className: 'money',
      render: (row) => `$${Number(row.tax || 0).toFixed(2)}`,
    },
    {
      header: 'Credits Applied',
      accessor: 'credit_applied',
      align: 'right',
      className: 'money',
      render: (row) => Number(row.credit_applied) > 0 ? `-$${Number(row.credit_applied).toFixed(2)}` : '$0.00',
    },
    {
      header: 'Total Due',
      accessor: 'total',
      align: 'right',
      className: 'money',
      render: (row) => (
        <strong style={{ color: 'var(--ink)' }}>
          ${Number(row.total).toFixed(2)}
        </strong>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      header: 'Due Date',
      accessor: 'due_date',
    },
    {
      header: 'Action',
      align: 'right',
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          icon={ExternalLink}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/invoices/${row.invoice_id}`);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1>Invoices & Billing</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Monthly statements and payment receipts
          </p>
        </div>
      </div>

      {bannerError && <Banner tone="danger" message={bannerError.msg} hint={bannerError.hint} />}

      {/* Filter Tabs */}
      <div className="card" style={{ marginBottom: 16, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'issued', 'paid', 'overdue', 'draft'].map((st) => (
            <button
              key={st}
              type="button"
              className={`btn btn--sm ${statusFilter === st ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setStatusFilter(st)}
              style={{ textTransform: 'capitalize' }}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredInvoices}
        keyField="invoice_id"
        loading={loading}
        onRowClick={(row) => navigate(`/invoices/${row.invoice_id}`)}
        emptyTitle="No invoices found"
        emptyDescription="Invoices are issued automatically at the close of every monthly billing cycle."
      />
    </div>
  );
}

