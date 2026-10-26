import React, { useState } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Banner from '../../ui/Banner';
import { FilePlus, Calculator, CheckCircle2, ArrowRight } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import { useNavigate } from 'react-router-dom';

export default function GenerateInvoice() {
  const toast = useToast();
  const navigate = useNavigate();

  const [targetScope, setTargetScope] = useState('all'); // 'all' | 'single'
  const [targetOrgId, setTargetOrgId] = useState('');
  const [periodStart, setPeriodStart] = useState('2026-10-01');
  const [periodEnd, setPeriodEnd] = useState('2026-10-31');
  const [running, setRunning] = useState(false);
  const [generatedResult, setGeneratedResult] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (targetScope === 'single' && !targetOrgId) {
      toast.error('Please specify an organization ID for single invoice generation.');
      return;
    }
    if (!periodStart || !periodEnd) {
      toast.error('Both billing cycle start and end dates are required.');
      return;
    }
    try {
      setRunning(true);
      const payload = {
        scope: targetScope,
        org_id: targetScope === 'single' ? Number(targetOrgId) : null,
        period_start: periodStart,
        period_end: periodEnd
      };

      const res = await api.post('/billing/generate', payload);
      setGeneratedResult(res);
      toast.success('Invoice generation completed.');
    } catch (err) {
      setGeneratedResult(null);
      toast.error(err.msg || 'Invoice generation failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ marginBottom: 20 }}>
        <h1>Generate Billing Invoices</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
          Aggregate metered telemetry logs and execute monthly invoice settlement
        </p>
      </div>

      {generatedResult && (
        <Banner
          tone="ok"
          message={`Successfully generated ${generatedResult.invoices_generated} invoices for period ${generatedResult.cycle}.`}
          hint={`Total sum billed: $${Number(generatedResult.total_billed).toFixed(2)}. Credits applied: $${Number(generatedResult.credits_applied).toFixed(2)}.`}
        >
          <div style={{ marginTop: 12 }}>
            <Button variant="primary" size="sm" onClick={() => navigate('/billing/invoices')}>
              View Generated Invoices
            </Button>
          </div>
        </Banner>
      )}

      <div className="card">
        <form onSubmit={handleGenerate}>
          <div className="form-group">
            <label className="form-label" htmlFor="scope-select">Tenant Target Scope</label>
            <select
              id="scope-select"
              className="input-element"
              value={targetScope}
              onChange={(e) => setTargetScope(e.target.value)}
            >
              <option value="all">All Active Customer Organizations</option>
              <option value="single">Single Specific Organization</option>
            </select>
          </div>

          {targetScope === 'single' && (
            <Input
              label="Organization ID"
              type="number"
              value={targetOrgId}
              onChange={(e) => setTargetOrgId(e.target.value)}
              placeholder="e.g. 1"
              required
            />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Input
              label="Billing Period Start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              required
            />
            <Input
              label="Billing Period End"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
            />
          </div>

          <div
            style={{
              background: 'var(--bg)',
              padding: 14,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line)',
              fontSize: 13,
              color: 'var(--muted)',
              margin: '16px 0'
            }}
          >
            <strong>Procedure Action:</strong> Reads partitioned rows from <code className="mono">usage_records</code>, groups line items by instance, adds persistent storage & bandwidth, deducts available prepaid credit balance, and writes to <code className="mono">invoices</code>.
          </div>

          <Button
            type="submit"
            variant="primary"
            icon={Calculator}
            loading={running}
            style={{ width: '100%' }}
          >
            Run Invoice Generation Procedure
          </Button>
        </form>
      </div>
    </div>
  );
}