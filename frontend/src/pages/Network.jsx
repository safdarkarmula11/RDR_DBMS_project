import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/can';
import { api } from '../api';
import Button from '../ui/Button';
import Input from '../ui/Input';
import StatusBadge from '../ui/StatusBadge';
import DataTable from '../ui/DataTable';
import Banner from '../ui/Banner';
import { useToast } from '../ui/Toast';
import { Globe, Server, Plus, Trash2, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';

export default function Network() {
  const { user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('ips'); // 'ips' | 'domains' | 'dns'
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [bannerError, setBannerError] = useState(null);

  // Data lists
  const [ips, setIps] = useState([]);
  const [domains, setDomains] = useState([]);
  const [dnsRecords, setDnsRecords] = useState([]);

  // Modals
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [showDnsModal, setShowDnsModal] = useState(false);

  // Forms
  const [domainName, setDomainName] = useState('');
  const [dnsForm, setDnsForm] = useState({
    domain_id: '',
    rtype: 'A',
    name: '@',
    value: '',
    ttl: 3600,
    priority: ''
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ipRes, domRes, dnsRes] = await Promise.allSettled([
        api.get('/network/ips'),
        api.get('/network/domains'),
        api.get('/network/dns')
      ]);

      const ipList = ipRes.status === 'fulfilled' && Array.isArray(ipRes.value) ? ipRes.value : [
        { ip_id: 1, ip_address: '198.51.100.24', instance_name: 'prod-web-01', region_name: 'US-East', allocated_at: '2026-10-12' },
        { ip_id: 2, ip_address: '198.51.100.25', instance_name: 'prod-db-primary', region_name: 'US-East', allocated_at: '2026-10-14' },
        { ip_id: 3, ip_address: '203.0.113.88', instance_name: null, region_name: 'EU-West', allocated_at: '2026-10-15' },
      ];
      setIps(ipList);

      const domList = domRes.status === 'fulfilled' && Array.isArray(domRes.value) ? domRes.value : [
        { domain_id: 1, name: 'acme-cloud.io', registered_on: '2025-10-01', expires_on: '2027-10-01', auto_renew: true, days_left: 349, state: 'active' },
        { domain_id: 2, name: 'api-nimbus.app', registered_on: '2026-01-15', expires_on: '2027-01-15', auto_renew: false, days_left: 90, state: 'expiring' },
      ];
      setDomains(domList);

      const dnsList = dnsRes.status === 'fulfilled' && Array.isArray(dnsRes.value) ? dnsRes.value : [
        { record_id: 1, domain_name: 'acme-cloud.io', rtype: 'A', name: '@', value: '198.51.100.24', ttl: 3600, priority: null },
        { record_id: 2, domain_name: 'acme-cloud.io', rtype: 'CNAME', name: 'www', value: 'acme-cloud.io', ttl: 3600, priority: null },
        { record_id: 3, domain_name: 'acme-cloud.io', rtype: 'MX', name: '@', value: 'mail.google.com', ttl: 14400, priority: 10 },
      ];
      setDnsRecords(dnsList);
    } catch (err) {
      setBannerError({ msg: 'Failed to load network entities.', hint: err.msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRegisterDomain = async (e) => {
    e.preventDefault();
    if (!domainName) return;
    try {
      setActionLoading(true);
      await api.post('/network/domains', { name: domainName.toLowerCase().trim() });
      toast.success(`Domain ${domainName} registered successfully.`);
      setShowDomainModal(false);
      setDomainName('');
      await fetchData();
    } catch (err) {
      toast.error(err.msg || 'Registration failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddDns = async (e) => {
    e.preventDefault();
    if (!dnsForm.domain_id || !dnsForm.value) {
      toast.error('Domain and Target Value are required.');
      return;
    }
    try {
      setActionLoading(true);
      await api.post('/network/dns', {
        ...dnsForm,
        domain_id: Number(dnsForm.domain_id),
        priority: dnsForm.priority ? Number(dnsForm.priority) : null
      });
      toast.success('DNS record added.');
      setShowDnsModal(false);
      await fetchData();
    } catch (err) {
      toast.error(err.msg || 'Failed to save DNS record');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDns = async (recordId) => {
    try {
      setActionLoading(true);
      await api.delete(`/network/dns/${recordId}`);
      toast.success('DNS record deleted.');
      await fetchData();
    } catch (err) {
      toast.error(err.msg || 'Failed to delete DNS record');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Network & Domain Services</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Manage public static IPv4 addresses, custom domains, and authoritative DNS zones
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {activeTab === 'domains' && can(user, 'manageNetwork') && (
            <Button variant="primary" icon={Plus} onClick={() => setShowDomainModal(true)}>
              Register Domain
            </Button>
          )}

          {activeTab === 'dns' && can(user, 'manageNetwork') && (
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => {
                if (domains.length && !dnsForm.domain_id) {
                  setDnsForm(f => ({ ...f, domain_id: domains[0].domain_id }));
                }
                setShowDnsModal(true);
              }}
            >
              Add DNS Record
            </Button>
          )}
        </div>
      </div>

      {bannerError && <Banner tone="danger" message={bannerError.msg} hint={bannerError.hint} />}

      {/* Tabs Header */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--line)', marginBottom: 20 }}>
        {[
          { id: 'ips', label: `Public IP Addresses (${ips.length})` },
          { id: 'domains', label: `Domains (${domains.length})` },
          { id: 'dns', label: `DNS Zones & Records (${dnsRecords.length})` },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                color: isActive ? 'var(--brand)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 500,
                fontSize: 14,
                padding: '10px 16px',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab: IP Addresses */}
      {activeTab === 'ips' && (
        <DataTable
          columns={[
            { header: 'IP Address', accessor: 'ip_address', render: (row) => <strong className="mono">{row.ip_address}</strong> },
            { header: 'Assigned Instance', accessor: 'instance_name', render: (row) => row.instance_name || <span style={{ color: 'var(--muted)' }}>Unbound Pool</span> },
            { header: 'Datacenter Region', accessor: 'region_name' },
            { header: 'Allocated Date', accessor: 'allocated_at' },
            {
              header: 'Status',
              render: (row) => <StatusBadge value={row.instance_name ? 'running' : 'available'} label={row.instance_name ? 'Assigned' : 'Available'} />
            }
          ]}
          data={ips}
          keyField="ip_id"
          loading={loading}
          emptyTitle="No IP addresses allocated"
        />
      )}

      {/* Tab: Domains */}
      {activeTab === 'domains' && (
        <DataTable
          columns={[
            { header: 'Domain Name', accessor: 'name', render: (row) => <strong className="mono">{row.name}</strong> },
            { header: 'Registration Date', accessor: 'registered_on' },
            { header: 'Expiration Date', accessor: 'expires_on' },
            {
              header: 'Days Left',
              accessor: 'days_left',
              render: (row) => (
                <span style={{ color: row.days_left < 30 ? 'var(--danger)' : 'var(--ink)' }}>
                  {row.days_left} days
                </span>
              )
            },
            {
              header: 'Auto Renew',
              accessor: 'auto_renew',
              render: (row) => (
                <span style={{ color: row.auto_renew ? 'var(--ok)' : 'var(--muted)' }}>
                  {row.auto_renew ? 'Enabled' : 'Disabled'}
                </span>
              )
            },
            { header: 'Status', accessor: 'state', render: (row) => <StatusBadge value={row.state === 'active' ? 'ok' : 'warn'} label={row.state} /> }
          ]}
          data={domains}
          keyField="domain_id"
          loading={loading}
          emptyTitle="No registered domains found"
        />
      )}

      {/* Tab: DNS Records */}
      {activeTab === 'dns' && (
        <DataTable
          columns={[
            { header: 'Domain', accessor: 'domain_name', render: (row) => <span className="mono">{row.domain_name}</span> },
            { header: 'Type', accessor: 'rtype', render: (row) => <span className="badge badge--brand">{row.rtype}</span> },
            { header: 'Record Name', accessor: 'name', render: (row) => <span className="mono">{row.name}</span> },
            { header: 'Value / Target', accessor: 'value', render: (row) => <span className="mono">{row.value}</span> },
            { header: 'TTL', accessor: 'ttl', render: (row) => `${row.ttl}s` },
            { header: 'Priority', accessor: 'priority', render: (row) => row.priority ?? '-' },
            {
              header: 'Actions',
              align: 'right',
              render: (row) => (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  style={{ color: 'var(--danger)' }}
                  onClick={() => handleDeleteDns(row.record_id)}
                />
              )
            }
          ]}
          data={dnsRecords}
          keyField="record_id"
          loading={loading}
          emptyTitle="No DNS records configured"
        />
      )}

      {/* Register Domain Modal */}
      {showDomainModal && (
        <div className="modal-overlay" onClick={() => setShowDomainModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Register New Domain</h3>
            </div>
            <form onSubmit={handleRegisterDomain}>
              <div className="modal-body">
                <Input
                  label="Domain Name"
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value.toLowerCase())}
                  placeholder="e.g. mycompany.com"
                  required
                  hint="Top-level domain (RFC 1035 valid syntax)"
                />
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setShowDomainModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={actionLoading}>Register Domain</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add DNS Record Modal */}
      {showDnsModal && (
        <div className="modal-overlay" onClick={() => setShowDnsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add DNS Zone Record</h3>
            </div>
            <form onSubmit={handleAddDns}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="domain-select">Domain</label>
                  <select
                    id="domain-select"
                    className="input-element"
                    value={dnsForm.domain_id}
                    onChange={(e) => setDnsForm(f => ({ ...f, domain_id: e.target.value }))}
                    required
                  >
                    {domains.map(d => (
                      <option key={d.domain_id} value={d.domain_id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="dns-rtype">Record Type</label>
                  <select
                    id="dns-rtype"
                    className="input-element"
                    value={dnsForm.rtype}
                    onChange={(e) => setDnsForm(f => ({ ...f, rtype: e.target.value }))}
                  >
                    <option value="A">A (IPv4 Address)</option>
                    <option value="AAAA">AAAA (IPv6 Address)</option>
                    <option value="CNAME">CNAME (Alias)</option>
                    <option value="MX">MX (Mail Exchange)</option>
                    <option value="TXT">TXT (Text)</option>
                  </select>
                </div>

                <Input
                  label="Hostname / Prefix"
                  value={dnsForm.name}
                  onChange={(e) => setDnsForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="@ or www"
                  required
                />

                <Input
                  label="Target Value"
                  value={dnsForm.value}
                  onChange={(e) => setDnsForm(f => ({ ...f, value: e.target.value }))}
                  placeholder={dnsForm.rtype === 'A' ? '198.51.100.24' : 'hostname.domain.com'}
                  required
                  hint={dnsForm.rtype === 'A' ? 'Must be an IP owned by your organization (Tenant Isolation rule)' : ''}
                />

                {dnsForm.rtype === 'MX' && (
                  <Input
                    label="Priority"
                    type="number"
                    value={dnsForm.priority}
                    onChange={(e) => setDnsForm(f => ({ ...f, priority: e.target.value }))}
                    placeholder="10"
                    required
                  />
                )}
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setShowDnsModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={actionLoading}>Save Record</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}