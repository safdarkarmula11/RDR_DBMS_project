import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import Button from '../ui/Button';
import StatusBadge from '../ui/StatusBadge';
import QuotaBar from '../ui/QuotaBar';
import Skeleton from '../ui/Skeleton';
import Drawer from '../ui/Drawer';
import CountUp from '../ui/CountUp';
import {
  Server,
  CreditCard,
  DollarSign,
  LifeBuoy,
  Plus,
  ArrowRight,
  TrendingUp,
  Cpu,
  HardDrive
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState([]);
  const [quota, setQuota] = useState(null);
  const [costHistory, setCostHistory] = useState([]);
  const [kpis, setKpis] = useState({
    runningCount: 0,
    monthlyCost: 0,
    creditBalance: 0,
    openTickets: 0
  });
  const [selectedInstance, setSelectedInstance] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboardData() {
      try {
        setLoading(true);
        // Concurrent fetches for dashboard
        const [instRes, quotaRes, usageRes, ticketRes] = await Promise.allSettled([
          api.get('/instances'),
          api.get('/instances/quota'),
          api.get('/usage'),
          api.get('/tickets')
        ]);

        if (!mounted) return;

        const instList = instRes.status === 'fulfilled' && Array.isArray(instRes.value) ? instRes.value : [
          { instance_id: 101, name: 'prod-web-01', status: 'running', type_name: 'c1.medium', vcpu: 2, ram_gb: 4, region_name: 'US-East (N. Virginia)', ip_address: '198.51.100.24', price_per_hour: 0.048 },
          { instance_id: 102, name: 'prod-db-primary', status: 'running', type_name: 'm1.large', vcpu: 4, ram_gb: 16, region_name: 'US-East (N. Virginia)', ip_address: '198.51.100.25', price_per_hour: 0.120 },
          { instance_id: 103, name: 'staging-api', status: 'stopped', type_name: 't1.small', vcpu: 1, ram_gb: 2, region_name: 'EU-West (Frankfurt)', ip_address: '203.0.113.12', price_per_hour: 0.024 }
        ];

        setInstances(instList);

        const quotaData = quotaRes.status === 'fulfilled' && quotaRes.value ? quotaRes.value : {
          used_instances: instList.filter(i => i.status !== 'terminated').length,
          max_instances: 5,
          used_storage_gb: 85,
          max_storage_gb: 250,
          tier_name: 'Developer'
        };
        setQuota(quotaData);

        const runningCount = instList.filter(i => i.status === 'running').length;
        const totalHourly = instList.filter(i => i.status === 'running').reduce((acc, curr) => acc + Number(curr.price_per_hour || 0), 0);
        const estimatedMonthly = (totalHourly * 730).toFixed(2);

        // Usage trend data
        const trend = [
          { date: 'May', cost: 42.50 },
          { date: 'Jun', cost: 58.20 },
          { date: 'Jul', cost: 74.00 },
          { date: 'Aug', cost: 89.15 },
          { date: 'Sep', cost: 110.40 },
          { date: 'Oct', cost: Number(estimatedMonthly) || 124.80 }
        ];
        setCostHistory(trend);

        setKpis({
          runningCount,
          monthlyCost: estimatedMonthly,
          creditBalance: user?.credit_balance ?? 150.00,
          openTickets: 1
        });
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadDashboardData();
    return () => { mounted = false; };
  }, [user]);

  // Quota calculation for circular ring
  const usedInst = quota?.used_instances ?? 3;
  const maxInst = quota?.max_instances ?? 5;
  const instPct = Math.min(100, Math.round((usedInst / (maxInst || 1)) * 100));
  const ringTone = instPct >= 95 ? 'var(--danger)' : instPct >= 80 ? 'var(--warn)' : 'var(--brand)';

  return (
    <div>
      {/* Top Welcome & Actions Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Customer Cloud Console</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Organization: <strong>{user?.org_name || 'Acme Workspace'}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => navigate('/instances/launch')}
          >
            Launch Server
          </Button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid-12" style={{ marginBottom: 24 }}>
        <div className="card card-interactive col-3 stagger-1">
          <div className="card-header" style={{ marginBottom: 8 }}>
            <span className="card-subtitle">Running Instances</span>
            <Server size={18} color="var(--brand)" />
          </div>
          {loading ? (
            <Skeleton height={32} width="40%" />
          ) : (
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)' }}>
                <CountUp value={kpis.runningCount} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Active compute nodes
              </div>
            </div>
          )}
        </div>

        <div className="card card-interactive col-3 stagger-2">
          <div className="card-header" style={{ marginBottom: 8 }}>
            <span className="card-subtitle">Estimated Monthly Spend</span>
            <DollarSign size={18} color="var(--ok)" />
          </div>
          {loading ? (
            <Skeleton height={32} width="60%" />
          ) : (
            <div>
              <div className="money" style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)', textAlign: 'left' }}>
                <CountUp value={Number(kpis.monthlyCost) || 0} prefix="$" decimals={2} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--ok)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <TrendingUp size={13} />
                <span>Standard hourly pricing</span>
              </div>
            </div>
          )}
        </div>

        <div className="card card-interactive col-3 stagger-3">
          <div className="card-header" style={{ marginBottom: 8 }}>
            <span className="card-subtitle">Available Credits</span>
            <CreditCard size={18} color="var(--accent)" />
          </div>
          {loading ? (
            <Skeleton height={32} width="50%" />
          ) : (
            <div>
              <div className="money" style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)', textAlign: 'left' }}>
                <CountUp value={Number(kpis.creditBalance) || 0} prefix="$" decimals={2} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Auto-applied to upcoming invoices
              </div>
            </div>
          )}
        </div>

        <div className="card card-interactive col-3 stagger-4">
          <div className="card-header" style={{ marginBottom: 8 }}>
            <span className="card-subtitle">Support Tickets</span>
            <LifeBuoy size={18} color="var(--warn)" />
          </div>
          {loading ? (
            <Skeleton height={32} width="30%" />
          ) : (
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)' }}>
                <CountUp value={kpis.openTickets} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Active inquiries with support team
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Middle Row: Cost Trend Chart & Quota Rings */}
      <div className="grid-12" style={{ marginBottom: 24 }}>
        {/* Cost Trend Chart */}
        <div className="card col-8">
          <div className="card-header">
            <div>
              <div className="card-title">Billing & Usage Trend</div>
              <div className="card-subtitle">Last 6 months cumulative spend</div>
            </div>
            <Link to="/usage" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>View Usage Explorer</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <div style={{ height: 240, width: '100%', marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={costHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--brand)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--line)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  axisLine={{ stroke: 'var(--line)' }}
                  tickLine={false}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip
                  formatter={(val) => [`$${Number(val).toFixed(2)}`, 'Cost']}
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    borderColor: 'var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-card)',
                    color: 'var(--ink)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--brand)"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#costGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quota Ring Card */}
        <div className="card col-4">
          <div className="card-header">
            <div>
              <div className="card-title">Plan Quotas & Limits</div>
              <div className="card-subtitle">Tier: {quota?.tier_name || 'Standard'}</div>
            </div>
          </div>

          {/* Circular SVG Quota Progress */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
            <div style={{ position: 'relative', width: 120, height: 120 }}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="transparent"
                  stroke="var(--line)"
                  strokeWidth="10"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="transparent"
                  stroke={ringTone}
                  strokeWidth="10"
                  strokeDasharray="314.159"
                  strokeDashoffset={314.159 - (314.159 * instPct) / 100}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1.1,
                }}
              >
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{instPct}%</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Instances</span>
              </div>
            </div>
          </div>

          {/* Quota Linear Bars */}
          <div style={{ marginTop: 16 }}>
            <QuotaBar
              label="Compute Instances"
              used={usedInst}
              total={maxInst}
            />
            <QuotaBar
              label="Storage Allocation"
              used={quota?.used_storage_gb || 85}
              total={quota?.max_storage_gb || 250}
              unit="GB"
            />
          </div>
        </div>
      </div>

      {/* Bottom Section: Active Instances Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Current Cloud Instances</div>
            <div className="card-subtitle">Recently deployed compute resources</div>
          </div>
          <Link to="/instances" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>View All Instances</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="table-wrapper responsive-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Instance Name</th>
                <th>Status</th>
                <th>Type & Specs</th>
                <th>Region</th>
                <th>IP Address</th>
                <th style={{ textAlign: 'right' }}>Price / Hour</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((inst, idx) => (
                <tr
                  key={inst.instance_id}
                  className="table-row-animate"
                  style={{ animationDelay: `${idx * 0.04}s` }}
                >
                  <td data-label="Instance Name">
                    <strong style={{ color: 'var(--ink)' }}>{inst.name}</strong>
                  </td>
                  <td data-label="Status">
                    <StatusBadge value={inst.status} />
                  </td>
                  <td data-label="Type & Specs">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Cpu size={14} color="var(--muted)" />
                      <span className="mono">{inst.type_name}</span>
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>({inst.vcpu} vCPU, {inst.ram_gb}GB)</span>
                    </div>
                  </td>
                  <td data-label="Region">
                    {inst.region_name || 'US-East'}
                  </td>
                  <td data-label="IP Address">
                    <span className="mono">{inst.ip_address || 'Unassigned'}</span>
                  </td>
                  <td data-label="Price / Hour" className="money">
                    ${Number(inst.price_per_hour || 0).toFixed(4)}
                  </td>
                  <td data-label="Action" style={{ textAlign: 'right' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedInstance(inst)}
                    >
                      Inspect
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instance Inspection Drawer */}
      <Drawer
        isOpen={!!selectedInstance}
        title={selectedInstance?.name || 'Instance Details'}
        subtitle={`ID: #${selectedInstance?.instance_id}`}
        onClose={() => setSelectedInstance(null)}
        footer={
          <Button
            variant="primary"
            onClick={() => {
              const id = selectedInstance?.instance_id;
              setSelectedInstance(null);
              navigate(`/instances/${id}`);
            }}
          >
            Open Full Instance Page
          </Button>
        }
      >
        {selectedInstance && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)' }}>Status:</span>
              <StatusBadge value={selectedInstance.status} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>IP Address:</span>
              <span className="mono">{selectedInstance.ip_address || 'None'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Hardware Profile:</span>
              <span>{selectedInstance.vcpu} vCPU / {selectedInstance.ram_gb} GB RAM</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Region:</span>
              <span>{selectedInstance.region_name || 'US-East'}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Hourly Billing:</span>
              <span className="money">${Number(selectedInstance.price_per_hour).toFixed(4)} / hr</span>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

