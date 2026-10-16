import { useState } from 'react';
import { api, session } from '../api.js';
import { Badge, Field, Modal, Table, Tabs, useLoad, useToast } from '../components/ui.jsx';

const stateKind = { active: 'ok', expiring: 'warn', expired: 'bad' };
const blankRec = { rtype: 'A', name: '@', value: '', ttl: 3600, priority: '' };

export default function Network() {
  const isCustomer = session.user.role === 'customer';
  const [tab, setTab] = useState('domains');
  const [domains, reloadDomains] = useLoad(() => api('/network/domains'));
  const [ips] = useLoad(() => api('/network/ips'));
  const [modal, setModal] = useState(null);
  const [toast, toastNode] = useToast();

  async function renew(d) {
    try { await api(`/network/domains/${d.domain_id}/renew`, { method: 'POST', body: { years: 1 } }); reloadDomains(); toast(`${d.name} renewed for 1 year`); }
    catch (err) { toast(err.message, true); }
  }

  return (
    <>
      <div className="head">
        <h1>Domains and IPs</h1>
        {isCustomer && tab === 'domains' && <button className="primary" onClick={() => setModal({ kind: 'register' })}>Register domain</button>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['domains', 'Domains'], ['ips', 'IP addresses']]} />

      {tab === 'domains' && (
        <Table rows={domains || []} empty="No domains yet." cols={[
          { label: 'Domain', render: (d) => <><strong>{d.name}</strong><div className="sub">{d.org_name}</div></> },
          { label: 'Expires', render: (d) => <>{d.expires_on}<div className="sub">{d.days_left >= 0 ? `${d.days_left} days left` : `${-d.days_left} days ago`}</div></> },
          { label: 'State', render: (d) => <Badge kind={stateKind[d.state]}>{d.state}</Badge> },
          { label: 'Records', key: 'record_count' },
          { label: '', render: (d) => (
            <span className="actions">
              <button className="ghost-d" onClick={() => setModal({ kind: 'records', d })}>DNS records</button>
              {isCustomer && <button className="ghost-d" onClick={() => renew(d)}>Renew 1 year</button>}
            </span>) },
        ]} />
      )}

      {tab === 'ips' && (
        <Table rows={ips || []} empty="No IP addresses in use." cols={[
          { label: 'IP address', render: (i) => <span className="mono">{i.ip_address}</span> },
          { label: 'Region', key: 'region_code' },
          { label: 'Instance', render: (i) => <>{i.instance_name}<div className="sub">{i.org_name}</div></> },
          { label: 'Instance status', render: (i) => <Badge kind={i.instance_status === 'running' ? 'ok' : 'muted'}>{i.instance_status}</Badge> },
        ]} />
      )}

      {modal?.kind === 'register' && <Register onClose={() => setModal(null)} onDone={() => { setModal(null); reloadDomains(); toast('Domain registered'); }} />}
      {modal?.kind === 'records' && <Records d={modal.d} canEdit={isCustomer} onClose={() => { setModal(null); reloadDomains(); }} />}
      {toastNode}
    </>
  );
}

function Register({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', years: 1 });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try { await api('/network/domains', { method: 'POST', body: { name: f.name, years: Number(f.years) } }); onDone(); }
    catch (err) { setError(err.message); }
  }
  return (
    <Modal title="Register domain" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Domain name"><input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase() })} placeholder="mycompany.example" /></Field>
        <Field label="Years"><input type="number" min="1" max="10" value={f.years} onChange={(e) => setF({ ...f, years: e.target.value })} /></Field>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row-end"><button type="button" className="ghost-d" onClick={onClose}>Cancel</button><button className="primary" disabled={!f.name.includes('.')}>Register</button></div>
      </form>
    </Modal>
  );
}

function Records({ d, canEdit, onClose }) {
  const [rows, reload] = useLoad(() => api(`/network/domains/${d.domain_id}/records`));
  const [rec, setRec] = useState(blankRec);
  const [error, setError] = useState('');
  const editing = !!rec.record_id;

  async function save(e) {
    e.preventDefault(); setError('');
    try {
      await api(editing ? `/network/records/${rec.record_id}` : `/network/domains/${d.domain_id}/records`,
        { method: editing ? 'PUT' : 'POST', body: rec });
      setRec(blankRec); reload();
    } catch (err) { setError(err.message); }
  }
  async function remove(r) {
    try { await api(`/network/records/${r.record_id}`, { method: 'DELETE' }); reload(); }
    catch (err) { setError(err.message); }
  }

  return (
    <Modal title={`DNS records: ${d.name}`} onClose={onClose} wide>
      <Table rows={rows || []} empty="No records yet." cols={[
        { label: 'Type', render: (r) => <Badge kind="info">{r.rtype}</Badge> },
        { label: 'Name', render: (r) => <span className="mono">{r.name}</span> },
        { label: 'Value', render: (r) => <span className="mono">{r.value}{r.rtype === 'MX' ? ` (priority ${r.priority})` : ''}</span> },
        { label: 'TTL', key: 'ttl' },
        canEdit && { label: '', render: (r) => (
          <span className="actions">
            <button className="ghost-d" onClick={() => setRec({ ...r, priority: r.priority ?? '' })}>Edit</button>
            <button className="ghost-d danger" onClick={() => remove(r)}>Delete</button>
          </span>) },
      ].filter(Boolean)} />

      {canEdit && (
        <form className="form inline" onSubmit={save}>
          <h4>{editing ? 'Edit record' : 'Add record'}</h4>
          <Field label="Type">
            <select value={rec.rtype} onChange={(e) => setRec({ ...rec, rtype: e.target.value })}>
              {['A', 'AAAA', 'CNAME', 'MX', 'TXT'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Name (@ = the domain itself)"><input value={rec.name} onChange={(e) => setRec({ ...rec, name: e.target.value })} /></Field>
          <Field label="Value"><input value={rec.value} onChange={(e) => setRec({ ...rec, value: e.target.value })} placeholder={rec.rtype === 'A' ? '203.0.113.10' : ''} /></Field>
          <Field label="TTL (seconds)"><input type="number" min="60" max="86400" value={rec.ttl} onChange={(e) => setRec({ ...rec, ttl: e.target.value })} /></Field>
          {rec.rtype === 'MX' && <Field label="Priority"><input type="number" min="0" value={rec.priority} onChange={(e) => setRec({ ...rec, priority: e.target.value })} /></Field>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row-end">
            {editing && <button type="button" className="ghost-d" onClick={() => { setRec(blankRec); setError(''); }}>Cancel edit</button>}
            <button className="primary" disabled={!rec.value}>{editing ? 'Save' : 'Add'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}