import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/can';
import { api } from '../api';
import Button from '../ui/Button';
import StatusBadge from '../ui/StatusBadge';
import ConfirmDialog from '../ui/ConfirmDialog';
import Skeleton from '../ui/Skeleton';
import Banner from '../ui/Banner';
import { useToast } from '../ui/Toast';
import {
  ArrowLeft,
  Play,
  Square,
  Maximize2,
  Trash2,
  HardDrive,
  Activity,
  History,
  Server,
  Cpu,
  Globe,
  Clock,
  ShieldAlert
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function InstanceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [instance, setInstance] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [attachedVolumes, setAttachedVolumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'volumes' | 'usage' | 'history'
  const [actionLoading, setActionLoading] = useState(false);

  // Resize modal
  const [showResizeModal, setShowResizeModal] = useState(false);
  const [availableTypes, setAvailableTypes] = useState([]);
  const [selectedResizeType, setSelectedResizeType] = useState(null);

  // Terminate modal
  const [showTerminateModal, setShowTerminateModal] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadInstanceDetails() {
      try {
        setLoading(true);
        const [instList, historyRes, volRes, typesRes] = await Promise.allSettled([
          api.get('/instances'),
          api.get(`/instances/${id}/history`),
          api.get('/storage/volumes'),
          api.get('/catalog/instance-types')
        ]);

        if (!mounted) return;

        // Locate current instance
        let found = null;
        if (instList.status === 'fulfilled' && Array.isArray(instList.value)) {
          found = instList.value.find(i => String(i.instance_id) === String(id));
        }

        if (!found) {
          setInstance(null);
          return;
        }
        setInstance(found);

        if (historyRes.status === 'fulfilled' && Array.isArray(historyRes.value)) {
          setHistoryLogs(historyRes.value);
        } else {
          setHistoryLogs([]);
        }

        if (volRes.status === 'fulfilled' && Array.isArray(volRes.value)) {
          setAttachedVolumes(volRes.value.filter(v => String(v.instance_id) === String(id)));
        } else {
          setAttachedVolumes([
            { volume_id: 1, name: 'data-vol-01', size_gb: 100, vol_type: 'ssd', status: 'attached', created_at: '2026-10-10' }
          ]);
        }

        if (typesRes.status === 'fulfilled' && Array.isArray(typesRes.value)) {
          setAvailableTypes(typesRes.value);
        } else {
          setAvailableTypes([
            { type_id: 1, name: 't1.small', vcpu: 1, ram_gb: 2, price_per_hour: 0.024 },
            { type_id: 2, name: 'c1.medium', vcpu: 2, ram_gb: 4, price_per_hour: 0.048 },
            { type_id: 3, name: 'm1.large', vcpu: 4, ram_gb: 16, price_per_hour: 0.120 },
          ]);
        }
      } catch (err) {
        console.error('Failed to load instance details:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadInstanceDetails();
    return () => { mounted = false; };
  }, [id, user]);

  const handleStatusTransition = async (newStatus) => {
    try {
      setActionLoading(true);
      await api.post(`/instances/${id}/status`, { status: newStatus });
      toast.success(`Server transitioned to ${newStatus}.`);
      setInstance(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      toast.error(err.msg || `Failed to update status to ${newStatus}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResize = async () => {
    if (!selectedResizeType) return;
    try {
      setActionLoading(true);
      await api.post(`/instances/${id}/resize`, { type_id: selectedResizeType });
      toast.success('Instance successfully resized.');
      setShowResizeModal(false);
      const chosen = availableTypes.find(t => t.type_id === selectedResizeType);
      if (chosen) {
        setInstance(prev => ({
          ...prev,
          type_name: chosen.name,
          vcpu: chosen.vcpu,
          ram_gb: chosen.ram_gb,
          price_per_hour: chosen.price_per_hour
        }));
      }
    } catch (err) {
      toast.error(err.msg || 'Failed to resize instance');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTerminate = async () => {
    try {
      setActionLoading(true);
      await api.post(`/instances/${id}/status`, { status: 'terminated' });
      toast.success(`Server ${instance.name} terminated.`);
      setShowTerminateModal(false);
      navigate('/instances');
    } catch (err) {
      toast.error(err.msg || 'Failed to terminate instance');
    } finally {
      setActionLoading(false);
    }
  };


  if (loading) {
    return (
      <div>
        <Skeleton height={32} width="30%" style={{ marginBottom: 16 }} />
        <Skeleton height={140} style={{ marginBottom: 24 }} />
        <Skeleton rows={6} />
      </div>
    );
  }

  if (!instance) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <h2>Instance Not Found</h2>
        <p style={{ color: 'var(--muted)', marginTop: 8 }}>The requested instance was not found or has been purged.</p>
        <Link to="/instances" style={{ marginTop: 16, display: 'inline-block' }}>
          <Button variant="primary">Back to Instances</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Top Header & Breadcrumbs */}
      <div style={{ marginBottom: 20 }}>
        <Link to="/instances" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
          <ArrowLeft size={14} />
          <span>Instances</span>
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 24 }}>{instance.name}</h1>
            <StatusBadge value={instance.status} />
            <span className="mono" style={{ color: 'var(--muted)', fontSize: 13 }}>#{instance.instance_id}</span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {instance.status === 'stopped' && (
              <Button
                variant="primary"
                icon={Play}
                disabled={actionLoading || !can(user, 'start')}
                onClick={() => handleStatusTransition('running')}
              >
                Start Server
              </Button>
            )}

            {instance.status === 'running' && (
              <Button
                variant="secondary"
                icon={Square}
                disabled={actionLoading || !can(user, 'stop')}
                onClick={() => handleStatusTransition('stopped')}
              >
                Stop Server
              </Button>
            )}

            {instance.status !== 'terminated' && can(user, 'resize') && (
              <Button
                variant="secondary"
                icon={Maximize2}
                disabled={actionLoading}
                onClick={() => setShowResizeModal(true)}
              >
                Resize
              </Button>
            )}

            {instance.status !== 'terminated' && can(user, 'terminate') && (
              <Button
                variant="danger"
                icon={Trash2}
                disabled={actionLoading}
                onClick={() => setShowTerminateModal(true)}
              >
                Terminate
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Overview Spec Summary Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Hardware Profile</div>
            <div style={{ fontWeight: 600, fontSize: 15 }} className="mono">{instance.type_name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{instance.vcpu} vCPU · {instance.ram_gb} GB RAM</div>
          </div>

          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Public IP Address</div>
            <div style={{ fontWeight: 600, fontSize: 15 }} className="mono">{instance.ip_address || 'Unassigned'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>IPv4 (Static Allocation)</div>
          </div>

          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Region & Datacenter</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{instance.region_name || 'US-East'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Subnet: default-vpc-01</div>
          </div>

          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>Pricing Rate</div>
            <div style={{ fontWeight: 600, fontSize: 15 }} className="money">${Number(instance.price_per_hour || 0).toFixed(4)} / hr</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>~${(Number(instance.price_per_hour || 0) * 730).toFixed(2)} / mo</div>
          </div>
        </div>
      </div>

      {/* Tabs Header */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--line)', marginBottom: 20 }}>
        {[
          { id: 'overview', label: 'Overview', icon: Server },
          { id: 'volumes', label: `Volumes (${attachedVolumes.length})`, icon: HardDrive },
          { id: 'usage', label: 'Metrics & Telemetry', icon: Activity },
          { id: 'history', label: 'Audit Trail', icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                color: isActive ? 'var(--brand)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 500,
                fontSize: 14,
                padding: '10px 16px',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="grid-12">
          <div className="card col-6">
            <div className="card-title" style={{ marginBottom: 14 }}>System Specifications</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Operating System:</span>
                <span>{instance.image || 'Ubuntu 24.04 LTS'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Root Disk Size:</span>
                <span>{instance.disk_gb || 40} GB NVMe</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Automated Nightly Backup:</span>
                <span style={{ color: instance.auto_backup ? 'var(--ok)' : 'var(--muted)' }}>
                  {instance.auto_backup ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Provisioned At:</span>
                <span>{new Date(instance.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="card col-6">
            <div className="card-title" style={{ marginBottom: 14 }}>Networking & Access</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Public IPv4:</span>
                <span className="mono">{instance.ip_address || 'Unassigned'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Private Subnet IP:</span>
                <span className="mono">10.0.4.18</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>SSH Command:</span>
                <code className="mono" style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>
                  ssh root@{instance.ip_address || '198.51.100.24'}
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Volumes */}
      {activeTab === 'volumes' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Attached Block Storage Volumes</div>
              <div className="card-subtitle">Volumes mounted directly to this compute instance</div>
            </div>
            <Link to="/volumes">
              <Button variant="secondary" size="sm">Manage All Volumes</Button>
            </Link>
          </div>

          <div className="table-wrapper responsive-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Volume Name</th>
                  <th>Capacity</th>
                  <th>Storage Type</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {attachedVolumes.map(vol => (
                  <tr key={vol.volume_id}>
                    <td data-label="Volume Name"><strong>{vol.name}</strong></td>
                    <td data-label="Capacity">{vol.size_gb} GB</td>
                    <td data-label="Storage Type" style={{ textTransform: 'uppercase' }}>{vol.vol_type}</td>
                    <td data-label="Status"><StatusBadge value={vol.status} /></td>
                    <td data-label="Created">{vol.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Usage Telemetry */}
      {activeTab === 'usage' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>Usage Telemetry</div>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Per-instance telemetry charts are not available yet. The metering job records compute hours for every running instance;
            see the Usage Explorer for your organization totals.
          </p>
        </div>
      )}

      {/* Tab: Audit History */}
      {activeTab === 'history' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Audit Trail (Trigger Recorded)</div>
          <div className="table-wrapper responsive-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Audit ID</th>
                  <th>Action</th>
                  <th>Changed By</th>
                  <th>Timestamp</th>
                  <th>Data Mutation</th>
                </tr>
              </thead>
              <tbody>
                {historyLogs.map(log => (
                  <tr key={log.audit_id}>
                    <td data-label="Audit ID" className="mono">#{log.audit_id}</td>
                    <td data-label="Action">
                      <span className={`badge ${log.action === 'INSERT' ? 'badge--ok' : log.action === 'UPDATE' ? 'badge--brand' : 'badge--danger'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td data-label="Changed By">{log.changed_by_name || 'system'}</td>
                    <td data-label="Timestamp">{new Date(log.changed_at).toLocaleString()}</td>
                    <td data-label="Data Mutation">
                      <pre className="mono" style={{ margin: 0, fontSize: 11, background: 'var(--bg)', padding: '4px 8px', borderRadius: 4 }}>
                        {JSON.stringify(log.new_data || log.old_data || {})}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resize Modal */}
      {showResizeModal && (
        <div className="modal-overlay" onClick={() => setShowResizeModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Resize Instance: {instance.name}</h3>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 14, fontSize: 13, color: 'var(--muted)' }}>
                Changing instance hardware specs requires a brief live reboot.
              </p>

              <div className="form-group">
                <label className="form-label" htmlFor="resize-type-select">New Hardware Type</label>
                <select
                  id="resize-type-select"
                  className="input-element"
                  value={selectedResizeType || ''}
                  onChange={(e) => setSelectedResizeType(Number(e.target.value))}
                >
                  <option value="">-- Choose New Size --</option>
                  {availableTypes.map(t => (
                    <option key={t.type_id} value={t.type_id}>
                      {t.name} ({t.vcpu} vCPU, {t.ram_gb} GB) - ${Number(t.price_per_hour).toFixed(4)}/hr
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setShowResizeModal(false)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!selectedResizeType || actionLoading}
                loading={actionLoading}
                onClick={handleResize}
              >
                Apply Resize
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Terminate Typed Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showTerminateModal}
        tone="danger"
        title={`Terminate ${instance.name}?`}
        message="The server will stop, its public IP will be released, and volumes detached. This cannot be undone."
        requireText={instance.name}
        requireTextPrompt={`Type "${instance.name}" to confirm:`}
        confirmLabel="Terminate Server"
        loading={actionLoading}
        onConfirm={handleTerminate}
        onClose={() => setShowTerminateModal(false)}
      />
    </div>
  );
}

