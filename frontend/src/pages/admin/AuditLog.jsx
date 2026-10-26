import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import DataTable from '../../ui/DataTable';
import Drawer from '../../ui/Drawer';
import Banner from '../../ui/Banner';
import { FileText, Eye, Filter, ArrowRight } from 'lucide-react';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tableFilter, setTableFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const data = await api.get('/infra/audit');

      setLogs(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch (err) {
      setLogs([]);
      setLoadError({ msg: 'Could not load the audit log.', hint: err.msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchTable = tableFilter === 'all' || log.table_name === tableFilter;
    const matchAction = actionFilter === 'all' || log.action === actionFilter;
    return matchTable && matchAction;
  });

  return (
    <div>
      {loadError && <Banner tone="danger" message={loadError.msg} hint={loadError.hint} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>System Audit Trail</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Immutable trigger-recorded operational change logs with JSON before/after snapshots
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Table:</span>
            <select
              className="input-element"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              style={{ height: 32, padding: '4px 10px', fontSize: 13, width: 140 }}
            >
              <option value="all">All Tables</option>
              <option value="instances">instances</option>
              <option value="volumes">volumes</option>
              <option value="pricing">pricing</option>
              <option value="invoices">invoices</option>
              <option value="users">users</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Action:</span>
            <select
              className="input-element"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={{ height: 32, padding: '4px 10px', fontSize: 13, width: 140 }}
            >
              <option value="all">All Actions</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <DataTable
          columns={[
            { header: 'Audit ID', accessor: 'audit_id', render: (row) => <strong className="mono">#{row.audit_id}</strong> },
            { header: 'Table', accessor: 'table_name', render: (row) => <span className="mono">{row.table_name}</span> },
            { header: 'Record ID', accessor: 'record_id', render: (row) => <span className="mono">#{row.record_id}</span> },
            {
              header: 'Action',
              accessor: 'action',
              render: (row) => (
                <span className={`badge ${row.action === 'INSERT' ? 'badge--ok' : row.action === 'UPDATE' ? 'badge--brand' : 'badge--danger'}`}>
                  {row.action}
                </span>
              )
            },
            { header: 'Modified By', accessor: 'changed_by_name' },
            { header: 'Timestamp', accessor: 'changed_at' },
            {
              header: 'Inspection',
              align: 'right',
              render: (row) => (
                <Button variant="ghost" size="sm" icon={Eye} onClick={() => setSelectedLog(row)}>
                  Inspect Diff
                </Button>
              )
            }
          ]}
          data={filteredLogs}
          keyField="audit_id"
          loading={loading}
          onRowClick={(row) => setSelectedLog(row)}
        />
      </div>

      {/* Before / After Diff Drawer */}
      <Drawer
        isOpen={!!selectedLog}
        title={`Audit Record #${selectedLog?.audit_id}`}
        subtitle={`${selectedLog?.action} on table ${selectedLog?.table_name} (#${selectedLog?.record_id})`}
        onClose={() => setSelectedLog(null)}
        width={560}
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, background: 'var(--bg)', padding: 10, borderRadius: 6 }}>
              <div>Actor: <strong>{selectedLog.changed_by_name || 'System'}</strong></div>
              <div>Time: <strong>{selectedLog.changed_at}</strong></div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)', marginBottom: 6 }}>
                Before Mutation (OLD DATA)
              </div>
              <pre
                className="mono"
                style={{
                  background: 'var(--bg)',
                  padding: 12,
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  border: '1px solid var(--line)',
                  maxHeight: 180,
                  overflowY: 'auto'
                }}
              >
                {selectedLog.old_data ? JSON.stringify(selectedLog.old_data, null, 2) : '(NULL: New Record Insert)'}
              </pre>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ok)', marginBottom: 6 }}>
                After Mutation (NEW DATA)
              </div>
              <pre
                className="mono"
                style={{
                  background: 'var(--bg)',
                  padding: 12,
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  border: '1px solid var(--line)',
                  maxHeight: 180,
                  overflowY: 'auto'
                }}
              >
                {selectedLog.new_data ? JSON.stringify(selectedLog.new_data, null, 2) : '(NULL: Record Removed)'}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

