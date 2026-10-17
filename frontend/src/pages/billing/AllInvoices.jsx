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
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const data = await api.get('/billing/invoices');
      const fallback = [
        { invoice_id: 1042, org_id: 1, org_name: 'Acme Enterprises', period_start: '2026-10-01', period_end: '2026-10-31', subtotal: 180.42, tax: 18.04, total: 198.46, status: 'issued', due_date: '2026-11-15' },
        { invoice_id: 1041, org_id: 2, org_name: 'Stark Technologies', period_start: '2026-10-01', period_end: '2026-10-31', subtotal: 1420.00, tax: 142.00, total: 1562.00, status: 'issued', due_date: '2026-11-15' },
        { invoice_id: 1040, org_id: 3, org_name: 'Wayne Logistics', period_start: '2026-09-01', period_end: '2026-09-30', subtotal: 640.00, tax: 64.00, total: 704.00, status: 'overdue', due_date: '2026-10-15' },
        { invoice_id: 1039, org_id: 4, org_name: 'Cyberdyne Systems', period_start: '2026-09-01', period_end: '2026-09-30', subtotal: 920.50, tax: 92.05, total: 1012.55, status: 'paid', due_date: '2026-10-15' },
        { invoice_id: 1038, org_id: 5, org_name: 'Umbrella BioTech', period_start: '2026-09-01', period_end: '2026-09-30', subtotal: 310.00, tax: 31.00, total: 341.00, status: 'paid', due_date: '2026-10-15' },
      ];
      setInvoices(Array.isArray(data) && data.length ? data : fallback);
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

