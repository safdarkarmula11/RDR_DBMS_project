import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import StatusBadge from '../../ui/StatusBadge';
import DataTable from '../../ui/DataTable';
import Banner from '../../ui/Banner';
import { useToast } from '../../ui/Toast';
import { Server, Plus, Wrench, Shield, Globe, Power } from 'lucide-react';

export default function Hosts() {
  const toast = useToast();
  const [hosts, setHosts] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [bannerError, setBannerError] = useState(null);

  const [showAddHostModal, setShowAddHostModal] = useState(false);
  const [hostForm, setHostForm] = useState({
    hostname: '',
    region_id: 1,
    total_vcpu: 64,
    total_ram_gb: 256,
    total_disk_gb: 2000
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [hRes, rRes] = await Promise.allSettled([
        api.get('/infra/hosts'),
        api.get('/infra/regions')
      ]);

      const fallbackHosts = [
        { host_id: 1, hostname: 'host-us-e1-01', region_name: 'US-East (N. Virginia)', total_vcpu: 64, total_ram_gb: 256, total_disk_gb: 2000, status: 'active' },
        { host_id: 2, hostname: 'host-us-e1-02', region_name: 'US-East (N. Virginia)', total_vcpu: 64, total_ram_gb: 256, total_disk_gb: 2000, status: 'active' },
        { host_id: 3, hostname: 'host-eu-w1-01', region_name: 'EU-West (Frankfurt)', total_vcpu: 32, total_ram_gb: 128, total_disk_gb: 1000, status: 'maintenance' },
        { host_id: 4, hostname: 'host-ap-s1-01', region_name: 'AP-South (Mumbai)', total_vcpu: 32, total_ram_gb: 128, total_disk_gb: 1000, status: 'active' },
      ];

      const fallbackRegions = [
        { region_id: 1, code: 'us-east-1', name: 'US-East (N. Virginia)', country: 'United States', status: 'active' },
        { region_id: 2, code: 'eu-west-1', name: 'EU-West (Frankfurt)', country: 'Germany', status: 'active' },
        { region_id: 3, code: 'ap-south-1', name: 'AP-South (Mumbai)', country: 'India', status: 'active' },
      ];

      setHosts(hRes.status === 'fulfilled' && Array.isArray(hRes.value) ? hRes.value : fallbackHosts);
      setRegions(rRes.status === 'fulfilled' && Array.isArray(rRes.value) ? rRes.value : fallbackRegions);
    } catch (err) {
      setBannerError({ msg: 'Failed to load hosts.', hint: err.msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleStatus = async (host, nextStatus) => {
    try {
      setActionLoading(true);
      await api.post(`/infra/hosts/${host.host_id}/status`, { status: nextStatus });
      toast.success(`Host ${host.hostname} status updated to ${nextStatus}.`);
      await fetchData();
    } catch (err) {
      toast.error(err.msg || 'Status transition failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddHost = async (e) => {
    e.preventDefault();
    if (!hostForm.hostname) return;
    try {
      setActionLoading(true);
      await api.post('/infra/hosts', hostForm);
      toast.success(`Host ${hostForm.hostname} registered.`);
      setShowAddHostModal(false);
      setHostForm({ hostname: '', region_id: 1, total_vcpu: 64, total_ram_gb: 256, total_disk_gb: 2000 });
      await fetchData();
    } catch (err) {
      toast.error(err.msg || 'Failed to add host');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Hypervisors & Region Nodes</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Manage physical bare-metal hardware and datacenter routing
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => setShowAddHostModal(true)}>
          Register Hypervisor Host
        </Button>
      </div>

      {bannerError && <Banner tone="danger" message={bannerError.msg} hint={bannerError.hint} />}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Global Regions</div>
        <DataTable
          columns={[
            { header: 'Region Code', accessor: 'code', render: (row) => <strong className="mono">{row.code}</strong> },
            { header: 'Datacenter Location', accessor: 'name' },
            { header: 'Country', accessor: 'country' },
            {
              header: 'Status',
              accessor: 'status',
              render: (row) => <StatusBadge value={row.status === 'active' ? 'ok' : 'muted'} label={row.status} />
            }
          ]}
          data={regions}
          keyField="region_id"
          loading={loading}
        />
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Physical Hypervisor Nodes</div>
        <DataTable
          columns={[
            { header: 'Hostname', accessor: 'hostname', render: (row) => <strong className="mono">{row.hostname}</strong> },
            { header: 'Region', accessor: 'region_name' },
            { header: 'Physical vCPU', accessor: 'total_vcpu', render: (row) => `${row.total_vcpu} cores` },
            { header: 'Total RAM', accessor: 'total_ram_gb', render: (row) => `${row.total_ram_gb} GB` },
            { header: 'Total Storage', accessor: 'total_disk_gb', render: (row) => `${row.total_disk_gb} GB` },
            {
              header: 'Status',
              accessor: 'status',
              render: (row) => <StatusBadge value={row.status} />
            },
            {
              header: 'Actions',
              align: 'right',
              render: (row) => (
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  {row.status === 'active' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Wrench}
                      disabled={actionLoading}
                      onClick={() => handleToggleStatus(row, 'maintenance')}
                    >
                      Maintenance
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Power}
                      disabled={actionLoading}
                      onClick={() => handleToggleStatus(row, 'active')}
                    >
                      Activate
                    </Button>
                  )}
                </div>
              )
            }
          ]}
          data={hosts}
          keyField="host_id"
          loading={loading}
        />
      </div>

      {/* Add Host Modal */}
      {showAddHostModal && (
        <div className="modal-overlay" onClick={() => setShowAddHostModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Register Physical Hypervisor Node</h3>
            </div>
            <form onSubmit={handleAddHost}>
              <div className="modal-body">
                <Input
                  label="Hostname"
                  value={hostForm.hostname}
                  onChange={(e) => setHostForm(f => ({ ...f, hostname: e.target.value.toLowerCase() }))}
                  placeholder="e.g. host-us-e1-03"
                  required
                />

                <div className="form-group">
                  <label className="form-label" htmlFor="host-reg-select">Datacenter Region</label>
                  <select
                    id="host-reg-select"
                    className="input-element"
                    value={hostForm.region_id}
                    onChange={(e) => setHostForm(f => ({ ...f, region_id: Number(e.target.value) }))}
                  >
                    {regions.map(r => (
                      <option key={r.region_id} value={r.region_id}>{r.name} ({r.code})</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Input
                    label="vCPU"
                    type="number"
                    value={hostForm.total_vcpu}
                    onChange={(e) => setHostForm(f => ({ ...f, total_vcpu: Number(e.target.value) }))}
                    required
                  />
                  <Input
                    label="RAM (GB)"
                    type="number"
                    value={hostForm.total_ram_gb}
                    onChange={(e) => setHostForm(f => ({ ...f, total_ram_gb: Number(e.target.value) }))}
                    required
                  />
                  <Input
                    label="Disk (GB)"
                    type="number"
                    value={hostForm.total_disk_gb}
                    onChange={(e) => setHostForm(f => ({ ...f, total_disk_gb: Number(e.target.value) }))}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setShowAddHostModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={actionLoading}>Register Node</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

