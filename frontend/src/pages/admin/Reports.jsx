import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import DataTable from '../../ui/DataTable';
import Banner from '../../ui/Banner';
import { BarChart3, Play, Download, Search, Sparkles } from 'lucide-react';
import { useToast } from '../../ui/Toast';

const REPORTS_CATALOG = [
  { id: 'R1', title: 'Monthly Revenue by Region and Type with Rollup', concept: 'JOIN (5 tables), GROUP BY WITH ROLLUP', description: 'Comprehensive revenue breakdown showing subtotal rows per datacenter and grand total.' },
  { id: 'R2', title: 'Top 10 Customers by Spend with Share of Total', concept: 'Window RANK(), SUM() OVER ()', description: 'Ranks customers by annual spend and computes percentage contribution to total revenue.' },
  { id: 'R3', title: 'Month-over-Month Revenue Growth Percentage', concept: 'Window LAG()', description: 'Calculates delta against previous calendar month to identify expansion or contraction trends.' },
  { id: 'R4', title: 'Running Cost within Month per Organization', concept: 'Window SUM() OVER (ORDER BY ...)', description: 'Cumulative day-by-day expenditure running sum throughout the current billing cycle.' },
  { id: 'R5', title: 'Customer Spend Quartile Segmentation', concept: 'NTILE(4) Window Function', description: 'Divides customer organizations into 4 equal segments based on lifetime cloud spend.' },
  { id: 'R6', title: 'Hierarchical Cost Rollup via Recursive CTE', concept: 'Recursive CTE on parent_org_id', description: 'Traverses parent/child multi-tenant corporate hierarchy to sum cost across subsidiaries.' },
  { id: 'R7', title: 'Resource Dependency Tree', concept: 'Multi-table JOIN, UNION ALL', description: 'Lists compute nodes, attached block volumes, persistent snapshots, and public IPv4 bindings.' },
  { id: 'R8', title: 'Hypervisors Above 85% Utilization Threshold', concept: 'Aggregate, HAVING, View', description: 'Highlights saturated physical hardware hosts requiring capacity expansion.' },
  { id: 'R9', title: 'High-Spend Customers with Zero Support Inquiries', concept: 'Subquery, NOT EXISTS', description: 'Identifies enterprise accounts spending above median who never submitted a ticket.' },
  { id: 'R10', title: 'Overdue Invoice Aging Buckets', concept: 'CASE, GROUP BY, DATEDIFF', description: 'Categorizes outstanding unpaid receivables into 0-30, 31-60, 61-90, and 90+ day buckets.' },
  { id: 'R11', title: 'Peak Provisioning Hours Distribution', concept: 'GROUP BY HOUR(), Aggregate', description: 'Identifies time-of-day peak server launch demand to schedule host maintenance windows.' },
  { id: 'R12', title: 'JSON Config & OS Tag Breakdown', concept: 'JSON_TABLE, JSON_EXTRACT', description: 'Extracts nested JSON machine configuration tags into a structured queryable projection.' },
  { id: 'R13', title: 'Temporal Price Point Comparison', concept: 'Temporal JOIN on valid_from / valid_to', description: 'Compares historical compute spend against newly introduced temporal pricing schedules.' },
  { id: 'R14', title: 'Ticket Full-Text Relevance Scoring', concept: 'MATCH ... AGAINST() FULLTEXT', description: 'Ranks technical support tickets by natural language BM25 text match relevance.' },
  { id: 'R15', title: 'Support Agent Average Resolution Latency', concept: 'JOIN, AVG, TIMESTAMPDIFF', description: 'Calculates mean hours from ticket submission to resolution per support agent.' },
  { id: 'R16', title: 'Host Capacity Runout Forecast', concept: 'CTE, Window Functions, Arithmetic', description: 'Forecasts days until region saturation based on trailing 30-day allocation slope.' },
  { id: 'R17', title: 'Cross-Tab Resource Cost Pivot', concept: 'Conditional Aggregation', description: 'Pivots monthly costs with individual columns for Compute, Storage, and Egress.' },
  { id: 'R18', title: 'Unbilled Usage Gap Detection', concept: 'LEFT JOIN ... IS NULL', description: 'Audits metered telemetry logs to find organizations with active usage but no generated invoice.' },
  { id: 'R19', title: 'Cumulative Distribution of Invoice Amounts', concept: 'PERCENT_RANK() / CUME_DIST()', description: 'Computes statistical percentile distribution of invoice totals across all tenants.' },
  { id: 'R20', title: 'Invoice Audit Trail with Actor Attribution', concept: 'JSON_EXTRACT, JOIN users', description: 'Inspects invoice modification history joined with system user credentials.' },
];

export default function Reports() {
  const toast = useToast();
  const [selectedReportId, setSelectedReportId] = useState('R1');
  const [searchFilter, setSearchFilter] = useState('');
  const [executing, setExecuting] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [reportError, setReportError] = useState(null);

  useEffect(() => {
    setReportResult(null);
    setReportError(null);
  }, [selectedReportId]);

  const activeReport = REPORTS_CATALOG.find(r => r.id === selectedReportId) || REPORTS_CATALOG[0];

  const prettify = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  const cell = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

  const handleRunReport = async () => {
    setExecuting(true);
    setReportError(null);
    try {
      const data = await api.get(`/reports/${activeReport.id}`);
      const list = Array.isArray(data) ? data : [];
      const keys = list.length ? Object.keys(list[0]) : [];
      setReportResult({
        columns: keys.map((k) => ({ header: prettify(k), accessor: k, align: typeof list[0][k] === 'number' ? 'right' : 'left' })),
        rows: list.map((row) => Object.fromEntries(keys.map((k) => [k, cell(row[k])]))),
      });
      toast.success(`Report ${activeReport.id} returned ${list.length} rows.`);
    } catch (err) {
      setReportResult(null);
      setReportError({ msg: `Report ${activeReport.id} failed.`, hint: err.msg || 'Unexpected error.' });
    } finally {
      setExecuting(false);
    }
  };

  const filteredCatalog = REPORTS_CATALOG.filter(r =>
    r.id.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.concept.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Advanced Analytical Reports (R1 – R20)</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Catalogue of 20 advanced SQL reports implementing Window functions, ROLLUP, Recursive CTEs, and JSON_TABLE
          </p>
        </div>

        <Button
          variant="primary"
          icon={Play}
          loading={executing}
          onClick={handleRunReport}
        >
          Execute Selected Report ({activeReport.id})
        </Button>
      </div>

      <div className="grid-12" style={{ marginBottom: 24 }}>
        {/* Report Selector Sidebar */}
        <div className="card col-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="search"
              placeholder="Filter R1-R20..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="input-element"
              style={{ paddingLeft: 28, height: 32, fontSize: 12 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredCatalog.map((r) => {
              const isSelected = selectedReportId === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedReportId(r.id);
                    setReportResult(null);
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: isSelected ? 'var(--brand-light)' : 'transparent',
                    border: isSelected ? '1px solid var(--brand)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="mono" style={{ color: isSelected ? 'var(--brand)' : 'var(--ink)', fontSize: 13 }}>
                      {r.id}
                    </strong>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', marginTop: 2 }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {r.concept}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Report Viewer */}
        <div className="card col-8">
          <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge--brand">{activeReport.id}</span>
              <h2 style={{ fontSize: 18 }}>{activeReport.title}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, color: 'var(--brand)' }}>
              <Sparkles size={14} />
              <strong>DBMS Technique:</strong> {activeReport.concept}
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
              {activeReport.description}
            </p>
          </div>

          {reportError && <Banner tone="danger" message={reportError.msg} hint={reportError.hint} />}

          {/* Results Table */}
          {reportResult ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Returned {reportResult.rows.length} rows from database view
                </span>
                <Button variant="ghost" size="sm" icon={Download}>
                  Export CSV
                </Button>
              </div>

              <div className="table-wrapper responsive-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      {reportResult.columns.map((c, i) => (
                        <th key={i} style={{ textAlign: c.align || 'left' }}>{c.header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportResult.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {reportResult.columns.map((c, cIdx) => (
                          <td key={cIdx} data-label={c.header} style={{ textAlign: c.align || 'left' }} className={c.className || ''}>
                            {row[c.accessor]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
              <BarChart3 size={40} strokeWidth={1.5} style={{ marginBottom: 12 }} />
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>Ready to Query</div>
              <div style={{ fontSize: 13, marginTop: 4, maxWidth: 360, margin: '4px auto 16px' }}>
                Click "Execute Selected Report" to run the SQL engine query with advanced database analytical semantics.
              </div>
              <Button variant="primary" icon={Play} onClick={handleRunReport}>
                Execute {activeReport.id} Now
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}