import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/can';
import { api } from '../api';
import Button from '../ui/Button';
import StatusBadge from '../ui/StatusBadge';
import DataTable from '../ui/DataTable';
import ConfirmDialog from '../ui/ConfirmDialog';
import Banner from '../ui/Banner';
import { useToast } from '../ui/Toast';
import { Plus, Play, Square, Trash2, ExternalLink, Search } from 'lucide-react';

export default function Instances() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerError, setBannerError] = useState(null);

  // Terminate modal state
  const [terminatingInstance, setTerminatingInstance] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchInstances = async () => {
    try {
      setLoading(true);
      const data = await api.get('/instances');
      setInstances(Array.isArray(data) ? data : []);
      setBannerError(null);
    } catch (err) {
      setBannerError({
        msg: err.msg || 'Could not load instances from the server.',
        hint: err.hint || 'Verify backend connection and database tables.'
      });
      setInstances([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInstances();
  }, []);

  const handleStatusChange = async (instanceId, newStatus) => {
    try {
      setActionLoading(true);
      await api.post(`/instances/${instanceId}/status`, { status: newStatus });
      toast.success(`Server status updated to ${newStatus}.`);
      await fetchInstances();
    } catch (err) {
      toast.error(err.msg || `Failed to transition status to ${newStatus}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmTerminate = async () => {
    if (!terminatingInstance) return;
    try {
      setActionLoading(true);
      await api.post(`/instances/${terminatingInstance.instance_id}/status`, { status: 'terminated' });
      toast.success(`Instance ${terminatingInstance.name} has been terminated.`);
      setTerminatingInstance(null);
      await fetchInstances();
    } catch (err) {
      toast.error(err.msg || 'Failed to terminate instance');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredInstances = instances.filter((inst) => {
    const matchesStatus = filterStatus === 'all' || inst.status === filterStatus;
    const matchesSearch =
      inst.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.ip_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.type_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const columns = [
    {
      header: 'Instance Name',
      accessor: 'name',
      render: (row) => (
        <div>
          <strong style={{ color: 'var(--ink)' }}>{row.name}</strong>
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            #{row.instance_id}
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      header: 'Type & Specs',
      accessor: 'type_name',
      render: (row) => (
        <div>
          <span className="mono">{row.type_name}</span>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {row.vcpu} vCPU · {row.ram_gb} GB RAM
          </div>
        </div>
      ),
    },
    {
      header: 'Region',
      accessor: 'region_name',
    },
    {
      header: 'IP Address',
      accessor: 'ip_address',
      render: (row) => <span className="mono">{row.ip_address || 'Unassigned'}</span>,
    },
    {
      header: 'Price / Hr',
      accessor: 'price_per_hour',
      align: 'right',
      className: 'money',
      render: (row) => `$${Number(row.price_per_hour || 0).toFixed(4)}`,
    },
    {
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {row.status === 'stopped' && (
            <Button
              variant="secondary"
              size="sm"
              icon={Play}
              disabled={actionLoading || !can(user, 'start')}
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(row.instance_id, 'running');
              }}
              title="Start Server"
            >
              Start
            </Button>
          )}

          {row.status === 'running' && (
            <Button
              variant="secondary"
              size="sm"
              icon={Square}
              disabled={actionLoading || !can(user, 'stop')}
              onClick={(e) => {
                e.stopPropagation();
                handleStatusChange(row.instance_id, 'stopped');
              }}
              title="Stop Server"
            >
              Stop
            </Button>
          )}

          {row.status !== 'terminated' && can(user, 'terminate') && (
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              disabled={actionLoading}
              onClick={(e) => {
                e.stopPropagation();
                setTerminatingInstance(row);
              }}
              title="Terminate Server"
              style={{ color: 'var(--danger)' }}
            >
              Terminate
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            icon={ExternalLink}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/instances/${row.instance_id}`);
            }}
            title="Inspect"
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Instances</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Manage compute virtual servers across global regions
          </p>
        </div>

        {can(user, 'launch') && (
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => navigate('/instances/launch')}
          >
            Launch Server
          </Button>
        )}
      </div>

      {bannerError && (
        <Banner tone="danger" message={bannerError.msg} hint={bannerError.hint} onDismiss={() => setBannerError(null)} />
      )}

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          {/* Status filter tabs */}
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'running', 'stopped', 'terminated'].map((st) => (
              <button
                key={st}
                type="button"
                className={`btn btn--sm ${filterStatus === st ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setFilterStatus(st)}
                style={{ textTransform: 'capitalize' }}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div style={{ position: 'relative', width: 260 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              type="search"
              placeholder="Filter by name or IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-element"
              style={{ paddingLeft: 30, height: 32, fontSize: 13 }}
            />
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredInstances}
        keyField="instance_id"
        loading={loading}
        onRowClick={(row) => navigate(`/instances/${row.instance_id}`)}
        emptyTitle="No instances match your filter"
        emptyDescription="Launch a new instance to start provisioning compute nodes."
        emptyAction={
          can(user, 'launch')
            ? { label: 'Launch New Instance', onClick: () => navigate('/instances/launch') }
            : null
        }
      />

      {/* Terminate Typed Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!terminatingInstance}
        tone="danger"
        title={`Terminate ${terminatingInstance?.name}?`}
        message="The instance will immediately stop, storage detached, and IP address returned to the pool. This action cannot be reversed."
        requireText={terminatingInstance?.name}
        requireTextPrompt={`Type "${terminatingInstance?.name}" to confirm termination:`}
        confirmLabel="Terminate Server"
        loading={actionLoading}
        onConfirm={handleConfirmTerminate}
        onClose={() => setTerminatingInstance(null)}
      />
    </div>
  );
}
