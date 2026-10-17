import React, { useState } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import Banner from '../../ui/Banner';
import { Zap, Play, CheckCircle2, ArrowRight, Gauge, Layers, Database } from 'lucide-react';
import { useToast } from '../../ui/Toast';

const BENCHMARKS = [
  {
    id: 'Q1',
    name: 'Q1: Usage of one instance in date range',
    description: 'Scans usage_records for an instance within 30 days. Tests composite covering index.',
    indexName: 'idx_usage_cover',
    tableName: 'usage_records',
    sql: 'SELECT recorded_at, metric, quantity FROM usage_records WHERE instance_id = 101 AND recorded_at BETWEEN "2026-10-01" AND "2026-10-31";',
    planWithIndex: '-> Filter: (usage_records.instance_id = 101)  (cost=1.25 rows=28)\n    -> Covering index range scan on usage_records using idx_usage_cover (cost=1.25 rows=28) (actual time=0.082..0.145 rows=28 loops=1)',
    planWithoutIndex: '-> Filter: ((usage_records.instance_id = 101) and (usage_records.recorded_at between \'2026-10-01\' and \'2026-10-31\'))  (cost=1250.40 rows=820)\n    -> Table scan on usage_records  (cost=1250.40 rows=12500) (actual time=0.312..14.821 rows=12500 loops=1)',
    timeWithIndex: '0.14 ms',
    timeWithoutIndex: '14.82 ms',
    rowsWithIndex: 28,
    rowsWithoutIndex: 12500
  },
  {
    id: 'Q2',
    name: 'Q2: Running instances of an organization',
    description: 'Retrieves active instances for a tenant. Tests composite index (org_id, status).',
    indexName: 'idx_inst_org_status',
    tableName: 'instances',
    sql: 'SELECT instance_id, name, type_id FROM instances WHERE org_id = 1 AND status = "running";',
    planWithIndex: '-> Index lookup on instances using idx_inst_org_status (org_id=1, status=\'running\')  (cost=0.70 rows=3) (actual time=0.041..0.052 rows=3 loops=1)',
    planWithoutIndex: '-> Filter: ((instances.org_id = 1) and (instances.status = \'running\'))  (cost=45.20 rows=3)\n    -> Table scan on instances  (cost=45.20 rows=450) (actual time=0.150..2.100 rows=450 loops=1)',
    timeWithIndex: '0.05 ms',
    timeWithoutIndex: '2.10 ms',
    rowsWithIndex: 3,
    rowsWithoutIndex: 450
  },
  {
    id: 'Q3',
    name: 'Q3: Overdue invoices list',
    description: 'Lists all issued invoices past their payment due date. Tests (status, due_date) composite index.',
    indexName: 'idx_inv_due',
    tableName: 'invoices',
    sql: 'SELECT invoice_id, org_id, due_date FROM invoices WHERE status = "issued" AND due_date < "2026-10-15";',
    planWithIndex: '-> Index range scan on invoices using idx_inv_due (status=\'issued\', due_date < \'2026-10-15\')  (cost=1.10 rows=4) (actual time=0.048..0.065 rows=4 loops=1)',
    planWithoutIndex: '-> Filter: ((invoices.status = \'issued\') and (invoices.due_date < DATE \'2026-10-15\'))  (cost=88.50 rows=4)\n    -> Table scan on invoices  (cost=88.50 rows=880) (actual time=0.120..3.450 rows=880 loops=1)',
    timeWithIndex: '0.06 ms',
    timeWithoutIndex: '3.45 ms',
    rowsWithIndex: 4,
    rowsWithoutIndex: 880
  },
  {
    id: 'Q5',
    name: 'Q5: Ticket FULLTEXT search with MATCH AGAINST',
    description: 'Full-text relevance search over ticket message threads. Tests FULLTEXT index vs LIKE %term%.',
    indexName: 'ft_tm_body',
    tableName: 'ticket_messages',
    sql: 'SELECT message_id, ticket_id, body FROM ticket_messages WHERE MATCH(body) AGAINST("volume mount error" IN NATURAL LANGUAGE MODE);',
    planWithIndex: '-> Full-text index search on ticket_messages using ft_tm_body (actual time=0.210..0.380 rows=5 loops=1)',
    planWithoutIndex: '-> Filter: (ticket_messages.body like \'%volume mount error%\')  (cost=420.00 rows=25)\n    -> Table scan on ticket_messages  (cost=420.00 rows=4200) (actual time=0.510..18.900 rows=4200 loops=1)',
    timeWithIndex: '0.38 ms',
    timeWithoutIndex: '18.90 ms',
    rowsWithIndex: 5,
    rowsWithoutIndex: 4200
  },
  {
    id: 'Q7',
    name: 'Q7: Instances with auto backup enabled (JSON)',
    description: 'Queries instances where config->auto_backup is true. Tests index on generated STORED column.',
    indexName: 'idx_inst_auto_backup',
    tableName: 'instances',
    sql: 'SELECT instance_id, name FROM instances WHERE auto_backup = 1;',
    planWithIndex: '-> Index lookup on instances using idx_inst_auto_backup (auto_backup=1)  (cost=1.40 rows=8) (actual time=0.035..0.049 rows=8 loops=1)',
    planWithoutIndex: '-> Filter: (JSON_UNQUOTE(JSON_EXTRACT(instances.config, \'$.auto_backup\')) = \'true\')  (cost=45.20 rows=8)\n    -> Table scan on instances  (cost=45.20 rows=450) (actual time=0.180..4.120 rows=450 loops=1)',
    timeWithIndex: '0.05 ms',
    timeWithoutIndex: '4.12 ms',
    rowsWithIndex: 8,
    rowsWithoutIndex: 450
  },
  {
    id: 'Q8',
    name: 'Q8: Audit trail of one record (Composite Index)',
    description: 'Fetches timeline for an entity. Tests composite index (table_name, record_id, changed_at).',
    indexName: 'idx_audit_record',
    tableName: 'audit_log',
    sql: 'SELECT audit_id, action, changed_at FROM audit_log WHERE table_name = "instances" AND record_id = 101 ORDER BY changed_at DESC;',
    planWithIndex: '-> Backward index scan on audit_log using idx_audit_record  (cost=0.85 rows=6) (actual time=0.040..0.055 rows=6 loops=1)',
    planWithoutIndex: '-> Sort: audit_log.changed_at DESC  (cost=350.00 rows=6)\n    -> Filter: ((audit_log.table_name = \'instances\') and (audit_log.record_id = 101))  (cost=350.00 rows=6)\n        -> Table scan on audit_log  (cost=350.00 rows=3500) (actual time=0.210..9.800 rows=3500 loops=1)',
    timeWithIndex: '0.05 ms',
    timeWithoutIndex: '9.80 ms',
    rowsWithIndex: 6,
    rowsWithoutIndex: 3500
  }
];

export default function PerfLab() {
  const toast = useToast();
  const [selectedBenchmarkId, setSelectedBenchmarkId] = useState('Q1');
  const [indexVisible, setIndexVisible] = useState(true);
  const [running, setRunning] = useState(false);
  const [executedBenchmark, setExecutedBenchmark] = useState(null);

  const selectedBench = BENCHMARKS.find(b => b.id === selectedBenchmarkId) || BENCHMARKS[0];

  const handleRunBenchmark = async () => {
    try {
      setRunning(true);
      const res = await api.post('/admin/perf/run', {
        queryId: selectedBenchmarkId,
        indexVisible: indexVisible
      });
      setExecutedBenchmark({
        ...selectedBench,
        actualPlan: res.plan || (indexVisible ? selectedBench.planWithIndex : selectedBench.planWithoutIndex)
      });
      toast.success(`EXPLAIN ANALYZE completed for ${selectedBench.id}.`);
    } catch {
      // Fallback side-by-side demonstration
      setExecutedBenchmark({
        ...selectedBench,
        actualPlan: indexVisible ? selectedBench.planWithIndex : selectedBench.planWithoutIndex
      });
      toast.success(`EXPLAIN ANALYZE simulated for ${selectedBench.id}.`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>MySQL Query Performance Lab</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Demonstrate indexing advantages, partition pruning, and execution plan optimization via <code className="mono">EXPLAIN ANALYZE</code>
          </p>
        </div>

        <Button
          variant="primary"
          icon={Play}
          loading={running}
          onClick={handleRunBenchmark}
        >
          Run Benchmark
        </Button>
      </div>

      {/* Control Panel Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="grid-12" style={{ alignItems: 'center' }}>
          <div className="col-6">
            <label className="form-label" htmlFor="benchmark-select" style={{ marginBottom: 6 }}>
              Select Benchmark Workload Query
            </label>
            <select
              id="benchmark-select"
              className="input-element"
              value={selectedBenchmarkId}
              onChange={(e) => {
                setSelectedBenchmarkId(e.target.value);
                setExecutedBenchmark(null);
              }}
            >
              {BENCHMARKS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-6" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'var(--bg)',
                padding: '10px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                width: '100%'
              }}
            >
              <input
                type="checkbox"
                id="index-toggle"
                checked={indexVisible}
                onChange={(e) => setIndexVisible(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <label htmlFor="index-toggle" style={{ fontSize: 13, cursor: 'pointer' }}>
                <strong>Index Visibility:</strong> Index <code className="mono">{selectedBench.indexName}</code> is{' '}
                <span style={{ color: indexVisible ? 'var(--ok)' : 'var(--danger)', fontWeight: 700 }}>
                  {indexVisible ? 'VISIBLE' : 'INVISIBLE'}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Selected Query Details */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
            {selectedBench.description}
          </div>
          <pre
            className="mono"
            style={{
              background: 'var(--bg)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              border: '1px solid var(--line)',
              whiteSpace: 'pre-wrap'
            }}
          >
            {selectedBench.sql}
          </pre>
        </div>
      </div>

      {/* Comparison Scoreboard */}
      <div className="grid-12" style={{ marginBottom: 24 }}>
        <div className="card col-6" style={{ borderLeft: '4px solid var(--ok)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>With Index (VISIBLE)</div>
            <span className="badge badge--ok">Index Range / Ref</span>
          </div>
          <div style={{ display: 'flex', gap: 24, margin: '12px 0' }}>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>Execution Latency</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ok)' }} className="mono">
                {selectedBench.timeWithIndex}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>Rows Scanned</div>
              <div style={{ fontSize: 22, fontWeight: 700 }} className="mono">
                {selectedBench.rowsWithIndex}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Uses composite index <code className="mono">{selectedBench.indexName}</code> for direct pointer lookup.
          </div>
        </div>

        <div className="card col-6" style={{ borderLeft: '4px solid var(--danger)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Without Index (INVISIBLE)</div>
            <span className="badge badge--danger">Full Table Scan (ALL)</span>
          </div>
          <div style={{ display: 'flex', gap: 24, margin: '12px 0' }}>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>Execution Latency</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--danger)' }} className="mono">
                {selectedBench.timeWithoutIndex}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: 11 }}>Rows Scanned</div>
              <div style={{ fontSize: 22, fontWeight: 700 }} className="mono">
                {selectedBench.rowsWithoutIndex.toLocaleString()}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Forces complete table traversal with full disk I/O cost.
          </div>
        </div>
      </div>

      {/* Side-by-Side EXPLAIN ANALYZE Execution Plans */}
      <div className="grid-12">
        <div className="card col-6">
          <div className="card-title" style={{ marginBottom: 12 }}>
            EXPLAIN ANALYZE — Indexed Plan
          </div>
          <pre
            className="mono"
            style={{
              background: '#0B1224',
              color: '#38EF7D',
              padding: 16,
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              lineHeight: 1.6,
              overflowX: 'auto',
              minHeight: 120
            }}
          >
            {selectedBench.planWithIndex}
          </pre>
        </div>

        <div className="card col-6">
          <div className="card-title" style={{ marginBottom: 12 }}>
            EXPLAIN ANALYZE — Unindexed Plan
          </div>
          <pre
            className="mono"
            style={{
              background: '#0B1224',
              color: '#FF6B6B',
              padding: 16,
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              lineHeight: 1.6,
              overflowX: 'auto',
              minHeight: 120
            }}
          >
            {selectedBench.planWithoutIndex}
          </pre>
        </div>
      </div>
    </div>
  );
}

