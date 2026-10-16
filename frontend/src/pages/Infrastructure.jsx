import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, session } from '../api.js';
import { Badge, Field, Meter, Modal, Table, Tabs, useLoad, useToast } from '../components/ui.jsx';

const statusKind = { active: 'ok', maintenance: 'warn', retired: 'bad', inactive: 'bad' };
const blankHost = { region_id: '', hostname: '', total_vcpu: 64, total_ram_gb: 256, total_disk_gb: 4000, status: 'active' };
const blankRegion = { code: '', name: '', country: '', status: 'active' };

export default function Infrastructure() {
  const isAdmin = session.user.role === 'super_admin';
  const [tab, setTab] = useState('capacity');
  const [cap, reloadCap] = useLoad(() => api('/infra/capacity'));
  const [regions, reloadRegions] = useLoad(() => api('/infra/regions'));
  const [host, setHost] = useState(null);
  const [region, setRegion] = useState(null);
  const [toast, toastNode] = useToast();

  async function saveHost(e) {
    e.preventDefault();
    try {
      await api(host.host_id ? `/infra/hosts/${host.host_id}` : '/infra/hosts', { method: host.host_id ? 'PUT' : 'POST', body: host });
      setHost(null); reloadCap(); reloadRegions(); toast('Host saved');
    } catch (err) { toast(err.message, true); }
  }
  async function saveRegion(e) {
    e.preventDefault();
    try {
      await api(region.region_id ? `/infra/regions/${region.region_id}` : '/infra/regions', { method: region.region_id ? 'PUT' : 'POST', body: region });
      setRegion(null); reloadRegions(); reloadCap(); toast('Region saved');
    } catch (err) { toast(err.message, true); }
  }

  const rollup = (cap?.regions || []).map((r) => ({ ...r, _total: !!r.is_total }));
  const chart = (cap?.regions || []).filter((r) => !r.is_total);

  return (
    <>
      <div className="head">
        <h1>Infrastructure</h1>
        {isAdmin && tab === 'capacity' && <button className="primary" onClick={() => setHost(blankHost)}>Add host</button>}
        {isAdmin && tab === 'regions' && <button className="primary" onClick={() => setRegion(blankRegion)}>Add region</button>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['capacity', 'Capacity and hosts'], ['regions', 'Regions']]} />

      {tab === 'capacity' && (
        <>
          <section className="panel">
            <h3>Utilization by region (active hosts)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="region" /><YAxis unit="%" domain={[0, 100]} /><Tooltip /><Legend />
                <Bar dataKey="cpu_pct" name="CPU" fill="#2459d6" />
                <Bar dataKey="ram_pct" name="RAM" fill="#5bb0a0" />
              </BarChart>
            </ResponsiveContainer>
          </section>

          <h2 className="sec">Region totals</h2>
          <Table rows={rollup} cols={[
            { label: 'Region', render: (r) => <strong>{r.region}</strong> },
            { label: 'Hosts', key: 'hosts' },
            { label: 'vCPU used / total', render: (r) => `${r.used_vcpu} / ${r.total_vcpu}` },
            { label: 'RAM used / total (GB)', render: (r) => `${r.used_ram_gb} / ${r.total_ram_gb}` },
            { label: 'Disk used / total (GB)', render: (r) => `${r.used_disk_gb} / ${r.total_disk_gb}` },
            { label: 'CPU', render: (r) => <Meter pct={r.cpu_pct} /> },
          ]} />

          <h2 className="sec">Hosts</h2>
          <Table rows={cap?.hosts || []} cols={[
            { label: 'Host', render: (h) => <><strong className="mono">{h.hostname}</strong><div className="sub">{h.region_name}</div></> },
            { label: 'Status', render: (h) => <Badge kind={statusKind[h.status]}>{h.status}</Badge> },
            { label: 'vCPU', render: (h) => <><Meter pct={h.cpu_pct} /><div className="sub">{h.used_vcpu} of {h.total_vcpu}</div></> },
            { label: 'RAM', render: (h) => <><Meter pct={h.ram_pct} /><div className="sub">{h.used_ram_gb} of {h.total_ram_gb} GB</div></> },
            { label: 'Disk', render: (h) => <><Meter pct={h.disk_pct} /><div className="sub">{h.used_disk_gb} of {h.total_disk_gb} GB</div></> },
            isAdmin && { label: '', render: (h) => <button className="ghost-d" onClick={() => setHost(h)}>Edit</button> },
          ].filter(Boolean)} />
        </>
      )}

      {tab === 'regions' && (
        <Table rows={regions || []} cols={[
          { label: 'Code', render: (r) => <span className="mono">{r.code}</span> },
          { label: 'Location', render: (r) => `${r.name}, ${r.country}` },
          { label: 'Status', render: (r) => <Badge kind={statusKind[r.status]}>{r.status}</Badge> },
          { label: 'Hosts', key: 'hosts' },
          isAdmin && { label: '', render: (r) => <button className="ghost-d" onClick={() => setRegion(r)}>Edit</button> },
        ].filter(Boolean)} />
      )}

      {host && (
        <Modal title={host.host_id ? `Edit ${host.hostname}` : 'Add host'} onClose={() => setHost(null)}>
          <form onSubmit={saveHost} className="form">
            {!host.host_id && (
              <>
                <Field label="Region">
                  <select required value={host.region_id} onChange={(e) => setHost({ ...host, region_id: e.target.value })}>
                    <option value="">Choose…</option>
                    {(regions || []).filter((r) => r.status === 'active').map((r) => <option key={r.region_id} value={r.region_id}>{r.name} ({r.code})</option>)}
                  </select>
                </Field>
                <Field label="Hostname"><input required value={host.hostname} onChange={(e) => setHost({ ...host, hostname: e.target.value })} /></Field>
              </>
            )}
            <Field label="Total vCPU"><input type="number" min="1" required value={host.total_vcpu} onChange={(e) => setHost({ ...host, total_vcpu: e.target.value })} /></Field>
            <Field label="Total RAM (GB)"><input type="number" min="1" required value={host.total_ram_gb} onChange={(e) => setHost({ ...host, total_ram_gb: e.target.value })} /></Field>
            <Field label="Total disk (GB)"><input type="number" min="1" required value={host.total_disk_gb} onChange={(e) => setHost({ ...host, total_disk_gb: e.target.value })} /></Field>
            <Field label="Status">
              <select value={host.status} onChange={(e) => setHost({ ...host, status: e.target.value })}>
                <option value="active">Active</option><option value="maintenance">Maintenance</option><option value="retired">Retired (final)</option>
              </select>
            </Field>
            <div className="row-end">
              <button type="button" className="ghost-d" onClick={() => setHost(null)}>Cancel</button>
              <button className="primary">Save host</button>
            </div>
          </form>
        </Modal>
      )}

      {region && (
        <Modal title={region.region_id ? `Edit ${region.code}` : 'Add region'} onClose={() => setRegion(null)}>
          <form onSubmit={saveRegion} className="form">
            {!region.region_id && <Field label="Code (for example ap-south-1)"><input required value={region.code} onChange={(e) => setRegion({ ...region, code: e.target.value })} /></Field>}
            <Field label="City"><input required value={region.name} onChange={(e) => setRegion({ ...region, name: e.target.value })} /></Field>
            <Field label="Country"><input required value={region.country} onChange={(e) => setRegion({ ...region, country: e.target.value })} /></Field>
            <Field label="Status">
              <select value={region.status} onChange={(e) => setRegion({ ...region, status: e.target.value })}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </Field>
            <div className="row-end">
              <button type="button" className="ghost-d" onClick={() => setRegion(null)}>Cancel</button>
              <button className="primary">Save region</button>
            </div>
          </form>
        </Modal>
      )}
      {toastNode}
    </>
  );
}
