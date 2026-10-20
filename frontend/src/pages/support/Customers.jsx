import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import StatusBadge from '../../ui/StatusBadge';
import DataTable from '../../ui/DataTable';
import Drawer from '../../ui/Drawer';
import { Building2, Search, ExternalLink, ShieldAlert } from 'lucide-react';
import Banner from '../../ui/Banner';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCust, setSelectedCust] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function fetchCustomers() {
      try {
        setLoading(true);
        const data = await api.get('/support/customers');
        if (mounted) { setCustomers(Array.isArray(data) ? data : []); setLoadError(null); }
      } catch (err) {
        if (mounted) setLoadError({ msg: 'Could not load customers.', hint: err.msg });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchCustomers();
    return () => { mounted = false; };
  }, []);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.tier_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      {loadError && <Banner tone="danger" message={loadError.msg} hint={loadError.hint} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Customer Directory</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Multi-tenant organization accounts, subscription tiers, and resource utilization
          </p>
        </div>

        <div style={{ position: 'relative', width: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="search"
            placeholder="Search by company name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-element"
            style={{ paddingLeft: 30, height: 32, fontSize: 13 }}
          />
        </div>
      </div>

      <div className="card">
        <DataTable
          columns={[
            { header: 'Tenant ID', accessor: 'org_id', render: (row) => <strong className="mono">#{row.org_id}</strong> },
            { header: 'Company Name', accessor: 'name', render: (row) => <strong>{row.name}</strong> },
            { header: 'Plan Tier', accessor: 'tier_name', render: (row) => <span className="badge badge--brand">{row.tier_name}</span> },
            { header: 'Account Status', accessor: 'status', render: (row) => <StatusBadge value={row.status} /> },
            { header: 'Active VMs', accessor: 'active_instances', align: 'right' },
            { header: 'Storage GB', accessor: 'storage_gb', align: 'right', render: (row) => `${row.storage_gb} GB` },
            { header: 'Open Tickets', accessor: 'open_tickets', align: 'right', render: (row) => row.open_tickets > 0 ? <strong style={{ color: 'var(--warn)' }}>{row.open_tickets}</strong> : '0' },
            { header: 'Credits', accessor: 'credit_balance', align: 'right', className: 'money', render: (row) => `$${Number(row.credit_balance).toFixed(2)}` },
            {
              header: 'Inspect',
              align: 'right',
              render: (row) => (
                <Button variant="ghost" size="sm" onClick={() => setSelectedCust(row)}>
                  Profile
                </Button>
              )
            }
          ]}
          data={filtered}
          keyField="org_id"
          loading={loading}
          onRowClick={(row) => setSelectedCust(row)}
        />
      </div>

      {/* Customer Profile Drawer */}
      <Drawer
        isOpen={!!selectedCust}
        title={selectedCust?.name || 'Customer Organization'}
        subtitle={`Tenant ID: #${selectedCust?.org_id} · Registered ${selectedCust?.created_at}`}
        onClose={() => setSelectedCust(null)}
      >
        {selectedCust && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)' }}>Account Status:</span>
              <StatusBadge value={selectedCust.status} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Subscribed Plan:</span>
              <strong>{selectedCust.tier_name} Tier</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Active Compute Nodes:</span>
              <span>{selectedCust.active_instances} instances</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Storage Allocated:</span>
              <span>{selectedCust.storage_gb} GB</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Prepaid Balance:</span>
              <span className="money" style={{ fontWeight: 700, color: 'var(--brand)' }}>
                ${Number(selectedCust.credit_balance).toFixed(2)}
              </span>
            </div>

            {selectedCust.status === 'suspended' && (
              <div style={{ background: 'rgba(240, 68, 97, 0.08)', padding: 12, borderRadius: 6, border: '1px solid rgba(240, 68, 97, 0.2)' }}>
                <strong style={{ color: 'var(--danger)', fontSize: 13 }}>Account Suspended:</strong>
                <p style={{ fontSize: 12, color: 'var(--ink)', marginTop: 4 }}>
                  This organization has been temporarily locked due to an overdue balance or terms violation.
                </p>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

