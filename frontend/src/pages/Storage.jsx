import { useState } from 'react';
import { api, session } from '../api.js';
import { Badge, Field, Modal, Table, Tabs, useLoad, useToast } from '../components/ui.jsx';

const NAME_RULE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const statusKind = { available: 'info', attached: 'ok' };

export default function Storage() {
  const isCustomer = session.user.role === 'customer';
  const [tab, setTab] = useState('volumes');
  const [volumes, reloadVolumes] = useLoad(() => api('/storage/volumes'));
  const [snaps, reloadSnaps] = useLoad(() => api('/storage/snapshots'));
  const [quota, reloadQuota] = useLoad(() => api('/storage/quota'));
  const [regions] = useLoad(() => api('/catalog/regions'));
  const [instances] = useLoad(() => (isCustomer ? api('/instances') : Promise.resolve([])));
  const [modal, setModal] = useState(null);   // { kind, volume/snapshot }
  const [toast, toastNode] = useToast();

  const refresh = () => { reloadVolumes(); reloadSnaps(); reloadQuota(); };

  async function run(promise, okText) {
    try { await promise; refresh(); setModal(null); toast(okText); }
    catch (err) { toast(err.message, true); }
  }
  const post = (path, body) => api(path, { method: 'POST', body });

  const q = isCustomer ? quota : null;

  const volumeCols = [
    { label: 'Volume', render: (v) => <><strong>{v.name}</strong><div className="sub">{v.org_name}</div></> },
    { label: 'Size', render: (v) => `${v.size_gb} GB ${v.vol_type.toUpperCase()}` },
    { label: 'Status', render: (v) => <Badge kind={statusKind[v.status]}>{v.status}</Badge> },
    { label: 'Region', key: 'region_code' },
    { label: 'Attached to', render: (v) => v.instance_name || '—' },
    { label: 'Snapshots', key: 'snapshot_count' },
    isCustomer && { label: '', render: (v) => (
      <span className="actions">
        {v.status === 'available' && <button className="ghost-d" onClick={() => setModal({ kind: 'attach', v })}>Attach</button>}
        {v.status === 'attached' && <button className="ghost-d" onClick={() => run(post(`/storage/volumes/${v.volume_id}/detach`), 'Detached')}>Detach</button>}
        <button className="ghost-d" onClick={() => setModal({ kind: 'snapshot', v })}>Snapshot</button>
        <button className="ghost-d" onClick={() => setModal({ kind: 'resize', v })}>Resize</button>
        {v.status === 'available' && (
          <button className="ghost-d danger" onClick={() => confirm(`Delete volume ${v.name}?`) && run(api(`/storage/volumes/${v.volume_id}`, { method: 'DELETE' }), 'Volume deleted')}>Delete</button>)}
      </span>) },
  ].filter(Boolean);

  const snapCols = [
    { label: 'Snapshot', render: (s) => <><strong>{s.name}</strong><div className="sub">{s.org_name}</div></> },
    { label: 'Volume', key: 'volume_name' },
    { label: 'Size', render: (s) => `${s.size_gb} GB` },
    { label: 'Created', render: (s) => String(s.created_at).slice(0, 16).replace('T', ' ') },
    isCustomer && { label: '', render: (s) => (
      <span className="actions">
        <button className="ghost-d" onClick={() => setModal({ kind: 'restore', s })}>Restore</button>
        <button className="ghost-d danger" onClick={() => confirm(`Delete snapshot ${s.name}?`) && run(api(`/storage/snapshots/${s.snapshot_id}`, { method: 'DELETE' }), 'Snapshot deleted')}>Delete</button>
      </span>) },
  ].filter(Boolean);

  return (
    <>
      <div className="head">
        <h1>Storage</h1>
        {isCustomer && tab === 'volumes' && <button className="primary" onClick={() => setModal({ kind: 'create' })}>Create volume</button>}
      </div>

      {q && (
        <div className="quota">
          <div className="quota-bar"><div style={{ width: `${Math.min(100, (100 * q.used_gb) / q.max_storage_gb)}%` }} /></div>
          <span>{q.used_gb} of {q.max_storage_gb} GB used on the <strong>{q.tier}</strong> plan</span>
        </div>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[['volumes', 'Volumes'], ['snapshots', 'Snapshots']]} />
      {tab === 'volumes' && <Table cols={volumeCols} rows={volumes || []} empty="No volumes yet." />}
      {tab === 'snapshots' && <Table cols={snapCols} rows={snaps || []} empty="No snapshots yet." />}

      {modal?.kind === 'create' && (
        <CreateVolume regions={regions || []} onClose={() => setModal(null)}
          onSubmit={(f) => run(post('/storage/volumes', f), 'Volume created')} />)}
      {modal?.kind === 'attach' && (
        <AttachVolume v={modal.v} instances={instances || []} onClose={() => setModal(null)}
          onSubmit={(id) => run(post(`/storage/volumes/${modal.v.volume_id}/attach`, { instance_id: id }), 'Volume attached')} />)}
      {modal?.kind === 'snapshot' && (
        <NameDialog title={`Snapshot of ${modal.v.name}`} label="Snapshot name" button="Take snapshot" onClose={() => setModal(null)}
          onSubmit={(name) => run(post(`/storage/volumes/${modal.v.volume_id}/snapshots`, { name }), 'Snapshot taken')} />)}
      {modal?.kind === 'restore' && (
        <NameDialog title={`Restore ${modal.s.name}`} label="Name of the new volume" button="Restore" onClose={() => setModal(null)}
          onSubmit={(name) => run(post(`/storage/snapshots/${modal.s.snapshot_id}/restore`, { name }), 'New volume created from snapshot')} />)}
      {modal?.kind === 'resize' && (
        <ResizeVolume v={modal.v} onClose={() => setModal(null)}
          onSubmit={(size) => run(post(`/storage/volumes/${modal.v.volume_id}/resize`, { size_gb: size }), 'Volume resized')} />)}
      {toastNode}
    </>
  );
}

function CreateVolume({ regions, onClose, onSubmit }) {
  const [f, setF] = useState({ name: '', size_gb: 50, vol_type: 'ssd', region_id: '' });
  const ok = NAME_RULE.test(f.name) && f.region_id && f.size_gb >= 1;
  return (
    <Modal title="Create volume" onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...f, region_id: Number(f.region_id), size_gb: Number(f.size_gb) }); }}>
        <Field label="Name (lowercase letters, digits, dashes)"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase() })} placeholder="data-1" /></Field>
        <Field label="Region">
          <select value={f.region_id} onChange={(e) => setF({ ...f, region_id: e.target.value })}>
            <option value="">Choose…</option>
            {regions.map((r) => <option key={r.region_id} value={r.region_id}>{r.name} ({r.code})</option>)}
          </select>
        </Field>
        <Field label="Size (GB)"><input type="number" min="1" max="16000" value={f.size_gb} onChange={(e) => setF({ ...f, size_gb: e.target.value })} /></Field>
        <Field label="Type">
          <select value={f.vol_type} onChange={(e) => setF({ ...f, vol_type: e.target.value })}><option value="ssd">SSD</option><option value="hdd">HDD</option></select>
        </Field>
        <div className="row-end"><button type="button" className="ghost-d" onClick={onClose}>Cancel</button><button className="primary" disabled={!ok}>Create</button></div>
      </form>
    </Modal>
  );
}

function AttachVolume({ v, instances, onClose, onSubmit }) {
  const [id, setId] = useState('');
  // only instances in the same region that are running or stopped can take a volume
  const usable = instances.filter((i) => i.region_code === v.region_code && ['running', 'stopped'].includes(i.status));
  return (
    <Modal title={`Attach ${v.name}`} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit(Number(id)); }}>
        <Field label={`Instance in ${v.region_code}`}>
          <select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Choose…</option>
            {usable.map((i) => <option key={i.instance_id} value={i.instance_id}>{i.name} ({i.status})</option>)}
          </select>
        </Field>
        {!usable.length && <p className="muted">No running or stopped instance in this region.</p>}
        <div className="row-end"><button type="button" className="ghost-d" onClick={onClose}>Cancel</button><button className="primary" disabled={!id}>Attach</button></div>
      </form>
    </Modal>
  );
}

function NameDialog({ title, label, button, onClose, onSubmit }) {
  const [name, setName] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit(name); }}>
        <Field label={label}><input autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase())} /></Field>
        <div className="row-end"><button type="button" className="ghost-d" onClick={onClose}>Cancel</button><button className="primary" disabled={!NAME_RULE.test(name)}>{button}</button></div>
      </form>
    </Modal>
  );
}

function ResizeVolume({ v, onClose, onSubmit }) {
  const [size, setSize] = useState(v.size_gb + 10);
  return (
    <Modal title={`Resize ${v.name}`} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit(Number(size)); }}>
        <p className="muted">Volumes can only grow. Current size: {v.size_gb} GB.</p>
        <Field label="New size (GB)"><input type="number" min={v.size_gb + 1} value={size} onChange={(e) => setSize(e.target.value)} /></Field>
        <div className="row-end"><button type="button" className="ghost-d" onClick={onClose}>Cancel</button><button className="primary" disabled={Number(size) <= v.size_gb}>Resize</button></div>
      </form>
    </Modal>
  );
}