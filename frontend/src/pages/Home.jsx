import { useEffect, useState } from 'react';
import { api, session } from '../api.js';

const ROADMAP = [
  ['Step 1', 'Setup, login, identity tables', true],
  ['Step 2', 'Infrastructure: regions, hosts, instance types, temporal pricing', true],
  ['Step 3', 'Compute: instances, scheduler procedure, quota triggers', true],
  ['Step 4', 'Storage and network: volumes, snapshots, IPs, domains', true],
  ['Step 5', 'Metering, billing, payments, events', false],
  ['Step 6', 'Support tickets, audit triggers, consistency checks', false],
  ['Step 7', 'Data generator, indexes, partitioning, benchmarks', false],
  ['Step 8', 'Reports, dashboards, testing, documentation', false],
];

export default function Home() {
  const user = session.user;
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/health').then(setHealth).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <h1>Welcome, {user.name.split(' ')[0]}</h1>

      <section className="panel">
        <h3>System status</h3>
        {error && <p className="error">Cannot reach the API: {error}</p>}
        {!health && !error && <p className="muted">Checking…</p>}
        {health && (
          <dl className="kv">
            <div><dt>API</dt><dd><span className="pill ok">{health.api}</span></dd></div>
            <div><dt>Database</dt><dd>{health.database}</dd></div>
            <div><dt>MySQL version</dt><dd className="mono">{health.mysql_version}</dd></div>
            <div><dt>Tables</dt><dd>{health.tables}</dd></div>
            <div><dt>SQL files applied</dt><dd>{health.migrations}<div className="sub mono">{health.latest_migration}</div></dd></div>
            <div><dt>Event scheduler</dt>
              <dd><span className={`pill ${health.event_scheduler === 'ON' ? 'ok' : 'warn'}`}>{health.event_scheduler}</span></dd></div>
          </dl>
        )}
      </section>

      <section className="panel">
        <h3>Build roadmap</h3>
        <ol className="roadmap">
          {ROADMAP.map(([step, text, done]) => (
            <li key={step} className={done ? 'done' : ''}><strong>{step}</strong> {text}</li>
          ))}
        </ol>
      </section>
    </>
  );
}