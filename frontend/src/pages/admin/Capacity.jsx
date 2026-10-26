import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Button from '../../ui/Button';
import StatusBadge from '../../ui/StatusBadge';
import DataTable from '../../ui/DataTable';
import Skeleton from '../../ui/Skeleton';
import Banner from '../../ui/Banner';
import CountUp from '../../ui/CountUp';
import { Cpu, HardDrive, Server, RefreshCw, AlertTriangle, CheckCircle2, Database } from 'lucide-react';

export default function Capacity() {
  const [regions, setRegions] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bannerError, setBannerError] = useState(null);

  const fetchCapacity = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setIsRefreshing(true);

      const [capRes, hostRes] = await Promise.allSettled([
        api.get('/infra/capacity'),
        api.get('/infra/hosts')
      ]);

      const rList = capRes.status === 'fulfilled' && Array.isArray(capRes.value) ? capRes.value : [];
      const hList = hostRes.status === 'fulfilled' && Array.isArray(hostRes.value) ? hostRes.value : [];
      const failed = [capRes, hostRes].find((r) => r.status === 'rejected');

      setRegions(rList);
      setHosts(hList);
      setBannerError(failed ? { msg: 'Failed to load capacity data.', hint: failed.reason?.msg } : null);
    } catch (err) {
      setBannerError({ msg: 'Failed to refresh capacity data.', hint: err.msg });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCapacity();
    // Poll every 10 seconds without flicker
    const interval = setInterval(() => {
      fetchCapacity(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const getUtilColor = (pct) => {
    if (pct >= 90) return 'var(--danger)';
    if (pct >= 75) return 'var(--warn)';
    return 'var(--brand)';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Cluster Capacity & Infrastructure Heat Map</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Real-time physical hypervisor CPU, RAM, and Disk utilization (refreshed every 10s)
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link to="/admin/er-diagram" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="sm" icon={Database}>
              View ER Diagram
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={isRefreshing}
            onClick={() => fetchCapacity(false)}
          >
            Refresh Cluster Telemetry
          </Button>
        </div>
      </div>

      {bannerError && <Banner tone="danger" message={bannerError.msg} hint={bannerError.hint} />}

      {/* Region Cards */}
      <div className="grid-12" style={{ marginBottom: 24 }}>
        {regions.map((reg, idx) => {
          const cpuPct = Math.round((reg.used_vcpu / (reg.total_vcpu || 1)) * 100);
          const ramPct = Math.round((reg.used_ram_gb / (reg.total_ram_gb || 1)) * 100);
          const diskPct = Math.round((reg.used_disk_gb / (reg.total_disk_gb || 1)) * 100);

          return (
            <div key={reg.region_id} className={`card card-interactive col-4 stagger-${(idx % 4) + 1}`}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <div>
                  <div className="card-title">{reg.name}</div>
                  <div className="card-subtitle mono">{reg.code} · {reg.total_hosts} Active Hypervisors</div>
                </div>
                <span
                  className={`badge ${cpuPct >= 90 ? 'badge--danger' : cpuPct >= 75 ? 'badge--warn' : 'badge--ok'}`}
                >
                  {cpuPct >= 90 ? 'Full' : cpuPct >= 75 ? 'Limited' : 'Plenty'}
                </span>
              </div>

              {/* CPU bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span>vCPU Usage</span>
                  <span className="mono">
                    {reg.used_vcpu} / {reg.total_vcpu} (<CountUp value={cpuPct} suffix="%" />)
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${cpuPct}%`, background: getUtilColor(cpuPct), borderRadius: 999, transition: 'width 0.6s var(--ease-out)' }} />
                </div>
              </div>

              {/* RAM bar */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span>RAM Memory</span>
                  <span className="mono">
                    {reg.used_ram_gb} GB / {reg.total_ram_gb} GB (<CountUp value={ramPct} suffix="%" />)
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${ramPct}%`, background: getUtilColor(ramPct), borderRadius: 999, transition: 'width 0.6s var(--ease-out)' }} />
                </div>
              </div>

              {/* Disk bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span>NVMe Storage</span>
                  <span className="mono">
                    {reg.used_disk_gb} GB / {reg.total_disk_gb} GB (<CountUp value={diskPct} suffix="%" />)
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${diskPct}%`, background: getUtilColor(diskPct), borderRadius: 999, transition: 'width 0.6s var(--ease-out)' }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Host Details Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Physical Hypervisor Hosts</div>
            <div className="card-subtitle">Detailed node-level allocation status</div>
          </div>
        </div>

        <DataTable
          columns={[
            {
              header: 'Hostname',
              accessor: 'hostname',
              render: (row) => <strong className="mono">{row.hostname}</strong>
            },
            { header: 'Region', accessor: 'region_name' },
            {
              header: 'Status',
              accessor: 'status',
              render: (row) => <StatusBadge value={row.status} />
            },
            {
              header: 'vCPU Allocation',
              render: (row) => {
                const pct = Math.round((row.used_vcpu / (row.total_vcpu || 1)) * 100);
                return (
                  <div style={{ width: 140 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span className="mono">{row.used_vcpu}/{row.total_vcpu}</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: getUtilColor(pct) }} />
                    </div>
                  </div>
                );
              }
            },
            {
              header: 'RAM Allocation',
              render: (row) => {
                const pct = Math.round((row.used_ram_gb / (row.total_ram_gb || 1)) * 100);
                return (
                  <div style={{ width: 140 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span className="mono">{row.used_ram_gb}G/{row.total_ram_gb}G</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: getUtilColor(pct) }} />
                    </div>
                  </div>
                );
              }
            },
            {
              header: 'Storage Allocation',
              render: (row) => {
                const pct = Math.round((row.used_disk_gb / (row.total_disk_gb || 1)) * 100);
                return (
                  <div style={{ width: 140 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span className="mono">{row.used_disk_gb}G/{row.total_disk_gb}G</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: getUtilColor(pct) }} />
                    </div>
                  </div>
                );
              }
            }
          ]}
          data={hosts}
          keyField="host_id"
          loading={loading}
        />
      </div>
    </div>
  );
}

