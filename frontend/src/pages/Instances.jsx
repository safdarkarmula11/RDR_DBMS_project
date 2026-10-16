import { useState } from 'react';
import { api, session } from '../api.js';
import { Badge, Field, Modal, Table, money, useLoad, useToast } from '../components/ui.jsx';

const statusKind = { running: 'ok', stopped: 'muted', suspended: 'warn', terminated: 'bad' };
const NAME_RULE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export default function Instances() {
  const user = session.user;
  const isCustomer = user.role === 'customer';
  const isAdmin = user.role === 'super_admin';
  const [rows, reload] = useLoad(() => api('/instances'));
  const [quota, reloadQuota] = useLoad(() => api('/instances/quota'));
  const [launch, setLaunch] = useState(false);
  const [history, setHistory] = useState(null);
  const [toast, toastNode] = useToast();

  async function setStatus(i, status, confirmText) {
    if (confirmText && !confirm(confirmText)) return;
    try {
      await api(`/instances/${i.instance_id}/status`, { method: 'POST', body: { status } });
      reload(); reloadQuota(); toast(`${i.name} is now ${status}`);
    } catch (err) { toast(err.message, true); }
  }

  const cols = [
    { label: 'Name', render: (i) => <><strong>{i.name}</strong><div className="sub">{i.org_name || ''}</div></> },
    { label: 'Status', render: (i) => <Badge kind={statusKind[i.status]}>{i.status}</Badge> },
    { label: 'Type', render: (i) => <>{i.type_name}<div className="sub">{i.vcpu} vCPU · {i.ram_gb} GB · {i.disk_gb} GB</div></> },
    { label: 'Image', key: 'image' },
    { label: 'Region', render: (i) => <>{i.region_code}{!isCustomer && <div className="sub mono">{i.hostname}</div>}</> },
    { label: 'IP', render: (i) => <span className="mono">{i.ip_address || '—'}</span> },
    { label: 'Per hour', render: (i) => money(i.price_per_hour) },
    { label: '', render: (i) => (
      <span className="actions">
        {isCustomer && i.status === 'running' && <button className="ghost-d" onClick={() => setStatus(i, 'stopped')}>Stop</button>}
        {isCustomer && i.status === 'stopped' && <button className="ghost-d" onClick={() => setStatus(i, 'running')}>Start</button>}
        {isCustomer && i.status !== 'terminated' && (
          <button className="ghost-d danger" onClick={() => setStatus(i, 'terminated', `Terminate ${i.name}? This cannot be undone.`)}>Terminate</button>)}
        {isAdmin && ['running', 'stopped'].includes(i.status) && <button className="ghost-d" onClick={() => setStatus(i, 'suspended', `Suspend ${i.name}?`)}>Suspend</button>}
        {isAdmin && i.status === 'suspended' && <button className="ghost-d" onClick={() => setStatus(i, 'running')}>Reactivate</button>}
        <button className="ghost-d" onClick={() => setHistory(i)}>History</button>
      </span>) },
  ];

  const q = isCustomer ? quota : null;

  return (
    <>
      <div className="head">
        <h1>{isCustomer ? 'Instances' : 'All instances'}</h1>
        {isCustomer && <button className="primary" onClick={() => setLaunch(true)} disabled={q && q.quota_left <= 0}>Launch instance</button>}
      </div>

      {q && (
        <div className="quota">
          <div className="quota-bar"><div style={{ width: `${Math.min(100, (100 * q.active_instances) / q.max_instances)}%` }} /></div>
          <span>{q.active_instances} of {q.max_instances} instances used on the <strong>{q.tier}</strong> plan</span>
        </div>
      )}

      <Table cols={cols} rows={rows || []} empty="No instances yet." />

      {launch && <LaunchWizard onClose={() => setLaunch(false)} onDone={() => { setLaunch(false); reload(); reloadQuota(); toast('Instance launched'); }} />}
      {history && <HistoryModal instance={history} onClose={() => setHistory(null)} />}
      {toastNode}
    </>
  );
}

function LaunchWizard({ onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [regions] = useLoad(() => api('/catalog/regions'));
  const [types] = useLoad(() => api('/catalog/instance-types'));
  const [images] = useLoad(() => api('/catalog/images'));
  const [f, setF] = useState({ region_id: null, type_id: null, image_id: '', name: '', auto_backup: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const type = (types || []).find((t) => t.type_id === f.type_id);
  const image = (images || []).find((i) => String(i.image_id) === String(f.image_id));
  const diskTooSmall = type && image && type.disk_gb < image.min_disk_gb;
  const nameOk = NAME_RULE.test(f.name);

  async function submit() {
    setBusy(true); setError('');
    try {
      await api('/instances', { method: 'POST', body: {
        region_id: f.region_id, type_id: f.type_id, image_id: Number(f.image_id), name: f.name,
        config: f.auto_backup ? { auto_backup: true } : {},
      } });
      onDone();
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <Modal title="Launch instance" onClose={onClose} wide>
      <ol className="steps">
        {['Region', 'Size', 'Image and name'].map((l, i) => (
          <li key={l} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>{i + 1}. {l}</li>))}
      </ol>

      {step === 1 && (
        <div className="choices">
          {(regions || []).map((r) => (
            <button key={r.region_id} type="button" className={`choice ${f.region_id === r.region_id ? 'on' : ''}`}
                    onClick={() => setF({ ...f, region_id: r.region_id })}>
              <strong>{r.name}</strong><span>{r.country}</span><span className="mono">{r.code}</span>
            </button>))}
        </div>
      )}

      {step === 2 && (
        <div className="choices">
          {(types || []).map((t) => (
            <button key={t.type_id} type="button" className={`choice ${f.type_id === t.type_id ? 'on' : ''}`}
                    onClick={() => setF({ ...f, type_id: t.type_id })}>
              <strong>{t.name}</strong>
              <span>{t.vcpu} vCPU · {t.ram_gb} GB RAM</span>
              <span>{t.disk_gb} GB disk</span>
              <span className="price">{money(t.price_per_hour)}/h · {money(t.price_per_month, 0)}/mo</span>
            </button>))}
        </div>
      )}

      {step === 3 && (
        <div className="form">
          <Field label="Image">
            <select value={f.image_id} onChange={(e) => setF({ ...f, image_id: e.target.value })}>
              <option value="">Choose…</option>
              {(images || []).map((i) => <option key={i.image_id} value={i.image_id}>{i.name} {i.version} (needs {i.min_disk_gb} GB disk)</option>)}
            </select>
          </Field>
          {diskTooSmall && <p className="error">{type.name} has {type.disk_gb} GB of disk, but {image.name} {image.version} needs {image.min_disk_gb} GB. Go back and pick a bigger size.</p>}
          <Field label="Name (lowercase letters, digits and dashes, 3 to 40 characters)">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase() })} placeholder="web-1" />
          </Field>
          {f.name && !nameOk && <p className="error">Use 3 to 40 characters: a to z, 0 to 9 and dashes, not starting or ending with a dash.</p>}
          <label className="check"><input type="checkbox" checked={f.auto_backup} onChange={(e) => setF({ ...f, auto_backup: e.target.checked })} /> Enable automatic backups</label>
          {type && (
            <p className="summary">
              {type.name} ({type.vcpu} vCPU, {type.ram_gb} GB) in {(regions || []).find((r) => r.region_id === f.region_id)?.name} at about <strong>{money(type.price_per_month, 2)}</strong> per month.
            </p>)}
        </div>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      <div className="row-end">
        {step > 1 && <button type="button" className="ghost-d" onClick={() => setStep(step - 1)}>Back</button>}
        {step < 3 && <button type="button" className="primary" disabled={(step === 1 && !f.region_id) || (step === 2 && !f.type_id)} onClick={() => setStep(step + 1)}>Next</button>}
        {step === 3 && <button type="button" className="primary" disabled={!f.image_id || !nameOk || diskTooSmall || busy} onClick={submit}>{busy ? 'Launching…' : 'Launch'}</button>}
      </div>
    </Modal>
  );
}

function HistoryModal({ instance, onClose }) {
  const [rows] = useLoad(() => api(`/instances/${instance.instance_id}/history`));
  return (
    <Modal title={`History: ${instance.name}`} onClose={onClose} wide>
      <Table rows={rows || []} empty="No history." cols={[
        { label: 'When', render: (h) => String(h.changed_at).replace('T', ' ').slice(0, 19) },
        { label: 'Action', key: 'action' },
        { label: 'Change', render: (h) => (h.action === 'INSERT' ? 'Launched' : `${h.old_data?.status} → ${h.new_data?.status}`) },
        { label: 'By', key: 'changed_by_name' },
      ]} />
    </Modal>
  );
}
