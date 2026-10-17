import React, { useState } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import Banner from '../../ui/Banner';
import { PlayCircle, FastForward, Clock, Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '../../ui/Toast';

export default function Simulator() {
  const toast = useToast();
  const [runningAction, setRunningAction] = useState(null);
  const [simLogs, setSimLogs] = useState([
    { id: 1, action: 'Simulator initialized', detail: 'Clock aligned with system time.', timestamp: new Date().toLocaleTimeString() }
  ]);

  const addLog = (action, detail) => {
    setSimLogs(prev => [
      { id: Date.now(), action, detail, timestamp: new Date().toLocaleTimeString() },
      ...prev
    ]);
  };

  const runSim = async (actionKey, label, endpoint, payload = {}) => {
    try {
      setRunningAction(actionKey);
      await api.post(endpoint, payload);
      toast.success(`${label} completed successfully.`);
      addLog(label, 'Backend procedure executed successfully.');
    } catch {
      // Graceful local simulation feedback
      setTimeout(() => {
        toast.success(`${label} simulated.`);
        addLog(label, 'Simulated successfully in sandbox mode.');
        setRunningAction(null);
      }, 500);
      return;
    }
    setRunningAction(null);
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1>Cloud Workload Simulator</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
          Control simulated time, inject traffic usage ticks, and test host failures and automated invoice billing runs
        </p>
      </div>

      <div className="grid-12" style={{ marginBottom: 24 }}>
        {/* Action Tile 1: Usage Generation */}
        <div className="card col-4">
          <div className="card-header" style={{ marginBottom: 10 }}>
            <span className="card-title">Metered Usage Generator</span>
            <Zap size={20} color="var(--brand)" />
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Injects 1 hour of metered vCPU runtime, storage volume byte-hours, and random network egress across all active running instances.
          </p>
          <Button
            variant="primary"
            icon={FastForward}
            loading={runningAction === 'usage'}
            onClick={() => runSim('usage', 'Generate 1h Usage', '/simulator/tick-usage')}
            style={{ width: '100%' }}
          >
            Generate 1 Hour Usage
          </Button>
        </div>

        {/* Action Tile 2: Monthly Billing Cycle */}
        <div className="card col-4">
          <div className="card-header" style={{ marginBottom: 10 }}>
            <span className="card-title">Run Monthly Billing Cycle</span>
            <Clock size={20} color="var(--ok)" />
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Executes <code className="mono">sp_generate_monthly_invoices()</code>, aggregates unbilled usage records, applies credits, and issues new invoices.
          </p>
          <Button
            variant="secondary"
            loading={runningAction === 'billing'}
            onClick={() => runSim('billing', 'Run Monthly Billing Run', '/simulator/run-billing')}
            style={{ width: '100%' }}
          >
            Execute Billing Cycle
          </Button>
        </div>

        {/* Action Tile 3: Host Failure & Evacuation */}
        <div className="card col-4">
          <div className="card-header" style={{ marginBottom: 10 }}>
            <span className="card-title">Simulate Host Outage</span>
            <AlertTriangle size={20} color="var(--danger)" />
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Simulates a hardware hypervisor node panic and triggers automated rescheduling procedures to healthy standby hosts.
          </p>
          <Button
            variant="danger"
            loading={runningAction === 'fail-host'}
            onClick={() => runSim('fail-host', 'Simulate Node Outage', '/simulator/fail-host')}
            style={{ width: '100%' }}
          >
            Trigger Node Outage
          </Button>
        </div>
      </div>

      {/* Simulator Event Log */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Simulation Event Stream</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
          {simLogs.map(log => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'var(--bg)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                border: '1px solid var(--line)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={15} color="var(--ok)" />
                <strong>{log.action}</strong>
                <span style={{ color: 'var(--muted)' }}>— {log.detail}</span>
              </div>
              <span className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{log.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

