import { useState } from 'react';
import { api, session } from '../api.js';
import { Badge, Field, Modal, Table, money, useLoad, useToast } from '../components/ui.jsx';

const blankType = { name: '', family: 'general', vcpu: 1, ram_gb: 1, disk_gb: 10, active: true };
const today = () => new Date().toISOString().slice(0, 10);

export default function Pricing() {
  const isAdmin = session.user.role === 'super_admin';
  const [types, reload] = useLoad(() => api('/infra/instance-types'));
  const [edit, setEdit] = useState(null);       // instance type form
  const [hist, setHist] = useState(null);       // { type } for the price history modal
  const [history, reloadHistory] = useLoad(() => (hist ? api(`/pricing/${hist.type_id}`) : Promise.resolve([])), [hist?.type_id]);
  const [price, setPrice] = useState({ price_per_hour: '', effective_from: today() });
  const [toast, toastNode] = useToast();

  async function saveType(e) {
    e.preventDefault();
    try {
      await api(edit.type_id ? `/infra/instance-types/${edit.type_id}` : '/infra/instance-types', { method: edit.type_id ? 'PUT' : 'POST', body: edit });
      setEdit(null); reload(); toast('Instance type saved');
    } catch (err) { toast(err.message, true); }
  }
  async function savePrice(e) {
    e.preventDefault();
    try {
      await api('/pricing', { method: 'POST', body: { type_id: hist.type_id, ...price } });
      setPrice({ price_per_hour: '', effective_from: today() });
      reloadHistory(); reload(); toast('New price scheduled');
    } catch (err) { toast(err.message, true); }
  }

  const kind = { current: 'ok', scheduled: 'info', expired: 'muted' };

  return (
    <>
      <div className="head">
        <h1>Instance types and pricing</h1>
        {isAdmin && <button className="primary" onClick={() => setEdit(blankType)}>Add type</button>}
      </div>
      <Table rows={types || []} cols={[
        { label: 'Type', render: (t) => <strong>{t.name}</strong> },
        { label: 'Family', key: 'family' },
        { label: 'Spec', render: (t) => `${t.vcpu} vCPU · ${t.ram_gb} GB RAM · ${t.disk_gb} GB disk` },
        { label: 'Price per hour', render: (t) => money(t.price_per_hour) },
        { label: 'Per month', render: (t) => money(t.price_per_month, 2) },
        { label: 'Status', render: (t) => <Badge kind={t.active ? 'ok' : 'muted'}>{t.active ? 'active' : 'hidden'}</Badge> },
        { label: '', render: (t) => (
          <span className="actions">
            <button className="ghost-d" onClick={() => setHist(t)}>Prices</button>
            {isAdmin && <button className="ghost-d" onClick={() => setEdit(t)}>Edit</button>}
          </span>) },
      ]} />

      {edit && (
        <Modal title={edit.type_id ? `Edit ${edit.name}` : 'Add instance type'} onClose={() => setEdit(null)}>
          <form onSubmit={saveType} className="form">
            <Field label="Name"><input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Family">
              <select value={edit.family} onChange={(e) => setEdit({ ...edit, family: e.target.value })}>
                <option value="general">General</option><option value="compute">Compute</option><option value="memory">Memory</option>
              </select>
            </Field>
            <Field label="vCPU"><input type="number" min="1" required value={edit.vcpu} onChange={(e) => setEdit({ ...edit, vcpu: e.target.value })} /></Field>
            <Field label="RAM (GB)"><input type="number" min="1" required value={edit.ram_gb} onChange={(e) => setEdit({ ...edit, ram_gb: e.target.value })} /></Field>
            <Field label="Disk (GB)"><input type="number" min="1" required value={edit.disk_gb} onChange={(e) => setEdit({ ...edit, disk_gb: e.target.value })} /></Field>
            {edit.type_id && (
              <Field label="Visible to customers">
                <select value={edit.active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, active: e.target.value === '1' })}>
                  <option value="1">Yes</option><option value="0">No (hidden)</option>
                </select>
              </Field>
            )}
            {!edit.type_id && <p className="muted">After saving, open Prices to set the first price.</p>}
            <div className="row-end">
              <button type="button" className="ghost-d" onClick={() => setEdit(null)}>Cancel</button>
              <button className="primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {hist && (
        <Modal title={`Price history: ${hist.name}`} onClose={() => setHist(null)} wide>
          <Table rows={history || []} empty="No price set yet." cols={[
            { label: 'Per hour', render: (p) => money(p.price_per_hour) },
            { label: 'From', key: 'valid_from' },
            { label: 'To', render: (p) => p.valid_to || 'open' },
            { label: 'Status', render: (p) => <Badge kind={kind[p.period_status]}>{p.period_status}</Badge> },
          ]} />
          {isAdmin && (
            <form onSubmit={savePrice} className="form inline">
              <h4>Set a new price</h4>
              <Field label="Price per hour"><input type="number" step="0.0001" min="0.0001" required value={price.price_per_hour} onChange={(e) => setPrice({ ...price, price_per_hour: e.target.value })} /></Field>
              <Field label="Effective from"><input type="date" required value={price.effective_from} onChange={(e) => setPrice({ ...price, effective_from: e.target.value })} /></Field>
              <button className="primary">Apply</button>
              <p className="muted">The current period is closed the day before the new one starts. Old periods are kept for billing.</p>
            </form>
          )}
        </Modal>
      )}
      {toastNode}
    </>
  );
}
