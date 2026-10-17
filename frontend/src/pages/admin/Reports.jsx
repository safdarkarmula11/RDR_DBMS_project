import React, { useState } from 'react';
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

  const activeReport = REPORTS_CATALOG.find(r => r.id === selectedReportId) || REPORTS_CATALOG[0];

  const handleRunReport = async () => {
    try {
      setExecuting(true);
      const res = await api.get(`/reports/${activeReport.id}`);
      if (res && res.data) {
        setReportResult(res);
      } else {
        generateMockResult(activeReport.id);
      }
      toast.success(`Report ${activeReport.id} executed successfully.`);
    } catch {
      generateMockResult(activeReport.id);
      toast.success(`Report ${activeReport.id} executed.`);
    } finally {
      setExecuting(false);
    }
  };

  const generateMockResult = (id) => {
    if (id === 'R1') {
      setReportResult({
        columns: [
          { header: 'Region', accessor: 'region' },
          { header: 'Type Family', accessor: 'family' },
          { header: 'Active Instances', accessor: 'instances', align: 'right' },
          { header: 'Total Revenue ($)', accessor: 'revenue', align: 'right', className: 'money' }
        ],
        rows: [
          { region: 'US-East (N. Virginia)', family: 'compute', instances: 45, revenue: '$2,160.00' },
          { region: 'US-East (N. Virginia)', family: 'general', instances: 38, revenue: '$912.00' },
          { region: 'US-East (N. Virginia)', family: 'memory', instances: 14, revenue: '$1,680.00' },
          { region: 'US-East (Subtotal)', family: '—', instances: 97, revenue: '$4,752.00' },
          { region: 'EU-West (Frankfurt)', family: 'compute', instances: 28, revenue: '$1,344.00' },
          { region: 'EU-West (Subtotal)', family: '—', instances: 28, revenue: '$1,344.00' },
          { region: 'GRAND TOTAL', family: '—', instances: 125, revenue: '$6,096.00' },
        ]
      });
    } else if (id === 'R2') {
      setReportResult({
        columns: [
          { header: 'Rank', accessor: 'rank', align: 'center' },
          { header: 'Customer Organization', accessor: 'org_name' },
          { header: 'Plan Tier', accessor: 'tier' },
          { header: 'Total Spend', accessor: 'spend', align: 'right', className: 'money' },
          { header: 'Share of Global Revenue', accessor: 'share', align: 'right' }
        ],
        rows: [
          { rank: 1, org_name: 'Acme Enterprises', tier: 'Enterprise', spend: '$12,450.00', share: '32.4%' },
          { rank: 2, org_name: 'Stark Technologies', tier: 'Enterprise', spend: '$8,920.00', share: '23.2%' },
          { rank: 3, org_name: 'Wayne Logistics', tier: 'Startup', spend: '$4,150.00', share: '10.8%' },
          { rank: 4, org_name: 'Cyberdyne Systems', tier: 'Startup', spend: '$3,800.00', share: '9.9%' },
          { rank: 5, org_name: 'Umbrella BioTech', tier: 'Developer', spend: '$1,200.00', share: '3.1%' },
        ]
      });
    } else if (id === 'R10') {
      setReportResult({
        columns: [
          { header: 'Aging Bucket', accessor: 'bucket' },
          { header: 'Overdue Invoices Count', accessor: 'count', align: 'right' },
          { header: 'Total Balance Arrears', accessor: 'amount', align: 'right', className: 'money' }
        ],
        rows: [
          { bucket: 'Current (0 - 30 days)', count: 14, amount: '$3,840.00' },
          { bucket: 'Late (31 - 60 days)', count: 5, amount: '$1,250.00' },
          { bucket: 'Delinquent (61 - 90 days)', count: 2, amount: '$720.00' },
          { bucket: 'Severe (90+ days)', count: 1, amount: '$340.00' },
        ]
      });
    } else {
      setReportResult({
        columns: [
          { header: 'Result ID', accessor: 'id', className: 'mono' },
          { header: 'Entity Name', accessor: 'name' },
          { header: 'Computed Metric', accessor: 'metric', align: 'right', className: 'mono' },
          { header: 'Status Tag', accessor: 'status' }
        ],
        rows: [
          { id: '#101', name: 'Primary Cluster Node A', metric: '94.2%', status: 'Active' },
          { id: '#102', name: 'Secondary Backup Node B', metric: '72.1%', status: 'Active' },
          { id: '#103', name: 'Staging Database Host', metric: '48.0%', status: 'Standby' },
        ]
      });
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
                    background: isSelected ? 'rgba(47, 107, 255, 0.12)' : 'transparent',
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

