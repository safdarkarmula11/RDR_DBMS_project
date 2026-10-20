import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import StatusBadge from '../../ui/StatusBadge';
import DataTable from '../../ui/DataTable';
import Banner from '../../ui/Banner';
import { useNavigate } from 'react-router-dom';
import { Receipt, Search, Download, ExternalLink } from 'lucide-react';

export default function AllInvoices() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const data = await api.get('/billing/invoices');
      setInvoices(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch (err) {
      setInvoices([]);
      setLoadError({ msg: 'Could not load invoices.', hint: err.msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const filteredInvoices = invoices.filter(inv => {
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    const matchSearch = inv.org_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(inv.invoice_id).includes(searchQuery);
    return matchStatus && matchSearch;
  });

  return (
    <div>
      {loadError && <Banner tone="danger" message={loadError.msg} hint={loadError.hint} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Global Invoices Directory</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Master accounts receivable ledger across all multi-tenant organizations
          </p>
        </div>

        <Button variant="secondary" icon={Download}>
          Export Billing Report
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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

          <div style={{ position: 'relative', width: 280 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="search"
              placeholder="Filter by org name or invoice #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-element"
              style={{ paddingLeft: 30, height: 32, fontSize: 13 }}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <DataTable
          columns={[
            { header: 'Invoice #', accessor: 'invoice_id', render: (row) => <strong className="mono">INV-{String(row.invoice_id).padStart(5, '0')}</strong> },
            { header: 'Organization', accessor: 'org_name', render: (row) => <strong>{row.org_name}</strong> },
            { header: 'Billing Period', render: (row) => `${row.period_start} to ${row.period_end}` },
            { header: 'Subtotal', accessor: 'subtotal', align: 'right', className: 'money', render: (row) => `$${Number(row.subtotal).toFixed(2)}` },
            { header: 'Total', accessor: 'total', align: 'right', className: 'money', render: (row) => `$${Number(row.total).toFixed(2)}` },
            { header: 'Status', accessor: 'status', render: (row) => <StatusBadge value={row.status} /> },
            { header: 'Due Date', accessor: 'due_date' },
            {
              header: 'Action',
              align: 'right',
              render: (row) => (
                <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => navigate(`/invoices/${row.invoice_id}`)}>
                  View
                </Button>
              )
            }
          ]}
          data={filteredInvoices}
          keyField="invoice_id"
          loading={loading}
          onRowClick={(row) => navigate(`/invoices/${row.invoice_id}`)}
          emptyTitle="No invoices found matching criteria"
        />
      </div>
    </div>
  );
}

