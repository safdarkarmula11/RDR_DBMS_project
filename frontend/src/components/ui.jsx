import { useEffect, useState } from 'react';

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Table({ cols, rows, empty = 'Nothing here yet.' }) {
  if (!rows.length) return <p className="muted pad">{empty}</p>;
  return (
    <div className="tablewrap">
      <table>
        <thead><tr>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r._total ? 'total' : ''}>
              {cols.map((c) => <td key={c.label}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Field = ({ label, children }) => <label className="field"><span>{label}</span>{children}</label>;
export const Badge = ({ kind, children }) => <span className={`badge ${kind}`}>{children}</span>;

// Utilization bar: green below 70, amber to 85, red above
export function Meter({ pct }) {
  const v = Number(pct) || 0;
  const kind = v >= 85 ? 'hot' : v >= 70 ? 'warm' : 'cool';
  return (
    <div className="meter" title={`${v}%`}>
      <div className={`fill ${kind}`} style={{ width: `${Math.min(v, 100)}%` }} />
      <span>{v}%</span>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => fn().then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, deps);
  return [data, load, error];
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (text, bad = false) => { setMsg({ text, bad }); setTimeout(() => setMsg(null), 3500); };
  const node = msg ? <div className={`toast ${msg.bad ? 'bad' : ''}`} role="status">{msg.text}</div> : null;
  return [show, node];
}

export const money = (n, d = 4) => (n === null || n === undefined ? '—' : `₹${Number(n).toFixed(d)}`);
