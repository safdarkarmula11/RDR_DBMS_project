import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import Banner from '../../ui/Banner';
import { Play } from 'lucide-react';
import { useToast } from '../../ui/Toast';

const fmtMs = (v) => (v === null || v === undefined ? 'n/a' : `${Number(v).toFixed(3)} ms`);
const fmtNum = (v) => (v === null || v === undefined ? 'n/a' : Number(v).toLocaleString());

function VariantCard({ title, tone, badge, data, hint, emptyText }) {
  const color = tone === 'ok' ? 'var(--ok)' : 'var(--danger)';
  return (
    <div className="card col-6" style={{ borderLeft: `4px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        <span className={`badge badge--${tone}`}>{badge}</span>
      </div>
      {data ? (
        <>
          <div style={{ display: 'flex', gap: 24, margin: '12px 0' }}>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>Median execution time</div>
              <div style={{ fontSize: 22, fontWeight: 700, color }} className="mono">
                {fmtMs(data.medianMs)}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>Rows read (scan/lookup nodes)</div>
              <div style={{ fontSize: 22, fontWeight: 700 }} className="mono">
                {fmtNum(data.rowsRead)}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{hint}</div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--muted)', margin: '16px 0' }}>{emptyText}</div>
      )}
    </div>
  );
}

function PlanCard({ title, color, data, emptyText }) {
  return (
    <div className="card col-6">
      <div className="card-title" style={{ marginBottom: 12 }}>
        {title}
      </div>
      <pre
        className="mono"
        style={{
          background: '#0B1224',
          color,
          padding: 16,
          borderRadius: 'var(--radius-sm)',
          fontSize: 12,
          lineHeight: 1.6,
          overflowX: 'auto',
          minHeight: 120,
          whiteSpace: 'pre',
        }}
      >
        {data ? data.plan : emptyText}
      </pre>
      {data && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
            SQL executed ({data.runsMs.length} timed runs: {data.runsMs.map((x) => fmtMs(x)).join(', ')})
          </summary>
          <pre
            className="mono"
            style={{
              background: 'var(--bg)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              border: '1px solid var(--line)',
              whiteSpace: 'pre-wrap',
              marginTop: 8,
            }}
          >
            {data.sql}
          </pre>
        </details>
      )}
    </div>
  );
}

export default function PerfLab() {
  const toast = useToast();
  const [benchmarks, setBenchmarks] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.get('/admin/perf/benchmarks');
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setBenchmarks(arr);
        if (arr.length) setSelectedId(arr[0].id);
      } catch (err) {
        if (!cancelled) setError({ msg: 'Could not load the benchmark list.', hint: err.msg || err.message });
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = benchmarks.find((b) => b.id === selectedId) || null;

  const handleRun = async () => {
    if (!selected) return;
    setRunning(true);
    setError(null);
    try {
      const res = await api.post('/admin/perf/run', { queryId: selected.id });
      setResult(res);
      toast.success(`EXPLAIN ANALYZE finished for ${selected.id}.`);
    } catch (err) {
      setResult(null);
      setError({ msg: `Benchmark ${selected.id} failed.`, hint: err.msg || err.message });
    } finally {
      setRunning(false);
    }
  };

  const showing = result && result.queryId === selectedId ? result : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>MySQL Query Performance Lab</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Real <code className="mono">EXPLAIN ANALYZE</code> runs on this database: each query is executed with its index and again with the index ignored.
          </p>
        </div>
        <Button variant="primary" icon={Play} loading={running} onClick={handleRun} disabled={!selected}>
          Run Benchmark
        </Button>
      </div>

      {error && <Banner tone="danger" message={error.msg} hint={error.hint} />}

      <div className="card" style={{ marginBottom: 24 }}>
        <label className="form-label" htmlFor="benchmark-select" style={{ marginBottom: 6 }}>
          Select benchmark query
        </label>
        <select
          id="benchmark-select"
          className="input-element"
          value={selectedId}
          disabled={loadingList || !benchmarks.length}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {benchmarks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        {selected && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{selected.description}</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>
              Index / feature under test: <code className="mono">{selected.indexName}</code> on table{' '}
              <code className="mono">{selected.table}</code>
            </div>
          </div>
        )}
      </div>

      {showing && showing.tableRowsEstimate < 10000 && (
        <Banner
          tone="info"
          message={`The ${showing.table} table has only about ${fmtNum(showing.tableRowsEstimate)} rows.`}
          hint="On tiny tables MySQL often scans the whole table either way, so timings look alike. Load more data to see the index make a difference."
        />
      )}

      {showing && showing.speedup !== null && (
        <div className="card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Measured speed-up (median without index / median with index)</div>
          <div style={{ fontSize: 24, fontWeight: 700 }} className="mono">
            {showing.speedup}x
          </div>
        </div>
      )}

      <div className="grid-12" style={{ marginBottom: 24 }}>
        <VariantCard
          title="With index (optimizer's normal choice)"
          tone="ok"
          badge="Indexed"
          data={showing ? showing.withIndex : null}
          hint={selected ? `Plan chosen by MySQL using ${selected.indexName}.` : ''}
          emptyText="Press Run Benchmark to measure this query."
        />
        <VariantCard
          title="Without index (index ignored)"
          tone="danger"
          badge="Unindexed"
          data={showing ? showing.withoutIndex : null}
          hint="Same query with the index ignored, or with a form of the predicate that cannot use it."
          emptyText={
            selected && !selected.hasComparison
              ? 'This benchmark has no index comparison; only one plan is shown.'
              : 'Press Run Benchmark to measure this query.'
          }
        />
      </div>

      <div className="grid-12">
        <PlanCard
          title="EXPLAIN ANALYZE: Indexed Plan"
          color="#38EF7D"
          data={showing ? showing.withIndex : null}
          emptyText="No result yet. Press Run Benchmark."
        />
        <PlanCard
          title="EXPLAIN ANALYZE: Unindexed Plan"
          color="#FF6B6B"
          data={showing ? showing.withoutIndex : null}
          emptyText={
            selected && !selected.hasComparison
              ? 'No unindexed variant for this benchmark.'
              : 'No result yet. Press Run Benchmark.'
          }
        />
      </div>
    </div>
  );
}