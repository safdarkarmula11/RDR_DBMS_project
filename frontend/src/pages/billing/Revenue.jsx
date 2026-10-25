import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import DataTable from '../../ui/DataTable';
import { TrendingUp, DollarSign, PieChart as PieIcon, Globe } from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';

const COLORS = ['#0E7C6A', '#D97706', '#2563EB', '#059669'];

export default function Revenue() {
  const [loading, setLoading] = useState(true);

  const regionBreakdown = [
    { region: 'US-East (N. Virginia)', revenue: 28400, share: '58%' },
    { region: 'EU-West (Frankfurt)', revenue: 14200, share: '29%' },
    { region: 'AP-South (Mumbai)', revenue: 6320, share: '13%' },
  ];

  const tierDistribution = [
    { name: 'Enterprise Tier', value: 29500 },
    { name: 'Startup Tier', value: 14200 },
    { name: 'Developer Tier', value: 5220 },
  ];

  const monthlyGrowth = [
    { month: 'May 2026', total: 34100, growth: '+6.2%' },
    { month: 'Jun 2026', total: 38200, growth: '+12.0%' },
    { month: 'Jul 2026', total: 41500, growth: '+8.6%' },
    { month: 'Aug 2026', total: 44200, growth: '+6.5%' },
    { month: 'Sep 2026', total: 46800, growth: '+5.8%' },
    { month: 'Oct 2026', total: 48920, growth: '+4.5%' },
  ];

  useEffect(() => {
    setLoading(false);
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1>Revenue & Growth Analytics</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
          Financial segmentation, ARR run-rate, and regional billing contributions
        </p>
      </div>

      <div className="grid-12" style={{ marginBottom: 24 }}>
        {/* Tier Distribution Pie Chart */}
        <div className="card col-5">
          <div className="card-header">
            <span className="card-title">Revenue by Account Tier</span>
          </div>
          <div style={{ height: 220, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tierDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {tierDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Region Contribution Bar Chart */}
        <div className="card col-7">
          <div className="card-header">
            <span className="card-title">Datacenter Regional Revenue ($USD)</span>
          </div>
          <div style={{ height: 220, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionBreakdown}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
                <XAxis dataKey="region" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={(v) => `$${v / 1000}k`} />
                <Tooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
                <Bar dataKey="revenue" fill="var(--brand)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* MoM Growth Ledger (Report R3 concept) */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 14 }}>Month-over-Month Revenue Growth (LAG() Analysis)</div>
        <DataTable
          columns={[
            { header: 'Billing Month', accessor: 'month' },
            { header: 'Gross Revenue', accessor: 'total', align: 'right', className: 'money', render: (row) => `$${row.total.toLocaleString()}` },
            {
              header: 'Growth Rate (LAG())',
              accessor: 'growth',
              align: 'right',
              className: 'mono',
              render: (row) => <span style={{ color: 'var(--ok)', fontWeight: 600 }}>{row.growth}</span>
            }
          ]}
          data={monthlyGrowth}
          keyField="month"
          loading={loading}
        />
      </div>
    </div>
  );
}

