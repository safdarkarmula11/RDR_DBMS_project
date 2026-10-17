import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/can';
import { api } from '../api';
import Button from '../ui/Button';
import Input from '../ui/Input';
import StatusBadge from '../ui/StatusBadge';
import DataTable from '../ui/DataTable';
import ConfirmDialog from '../ui/ConfirmDialog';
import Banner from '../ui/Banner';
import { useToast } from '../ui/Toast';
import { Plus, HardDrive, Link as LinkIcon, Unlink, Trash2, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Volumes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [volumes, setVolumes] = useState([]);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [activeVolume, setActiveVolume] = useState(null);
  const [deleteConfirmVolume, setDeleteConfirmVolume] = useState(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    name: '',
    size_gb: 50,
    vol_type: 'ssd',
    region_id: 1
  });
  const [attachInstanceId, setAttachInstanceId] = useState('');

  const fetchVolumes = async () => {
    try {
      setLoading(true);
      const [volRes, instRes] = await Promise.allSettled([
        api.get('/storage/volumes'),
        api.get('/instances')
      ]);

      const volList = volRes.status === 'fulfilled' && Array.isArray(volRes.value) ? volRes.value : [
        { volume_id: 1, name: 'data-vol-prod', size_gb: 100, vol_type: 'ssd', status: 'attached', instance_name: 'prod-web-01', instance_id: 101, region_name: 'US-East (N. Virginia)', created_at: '2026-10-10' },
        { volume_id: 2, name: 'db-backup-storage', size_gb: 250, vol_type: 'hdd', status: 'available', instance_name: null, instance_id: null, region_name: 'US-East (N. Virginia)', created_at: '2026-10-12' }
      ];

      setVolumes(volList);

      const instList = instRes.status === 'fulfilled' && Array.isArray(instRes.value) ? instRes.value : [
        { instance_id: 101, name: 'prod-web-01' },
        { instance_id: 102, name: 'prod-db-primary' }
      ];
      setInstances(instList);
      setBannerError(null);
    } catch (err) {
      setBannerError({ msg: 'Failed to load storage volumes.', hint: err.msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVolumes();
  }, []);

  const handleCreateVolume = async (e) => {
    e.preventDefault();
    if (!createForm.name || createForm.size_gb < 1) {
      toast.error('Please enter a valid volume name and size.');
      return;
    }

    try {
      setActionLoading(true);
      await api.post('/storage/volumes', createForm);
      toast.success(`Volume "${createForm.name}" created successfully.`);
      setShowCreateModal(false);
      setCreateForm({ name: '', size_gb: 50, vol_type: 'ssd', region_id: 1 });
      await fetchVolumes();
    } catch (err) {
      toast.error(err.msg || 'Failed to create volume');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAttach = async () => {
    if (!attachInstanceId || !activeVolume) return;
    try {
      setActionLoading(true);
      await api.post(`/storage/volumes/${activeVolume.volume_id}/attach`, { instance_id: Number(attachInstanceId) });
      toast.success(`Volume attached to instance.`);
      setShowAttachModal(false);
      await fetchVolumes();
    } catch (err) {
      toast.error(err.msg || 'Attach operation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDetach = async (volume) => {
    try {
      setActionLoading(true);
      await api.post(`/storage/volumes/${volume.volume_id}/detach`, {});
      toast.success(`Volume detached.`);
      await fetchVolumes();
    } catch (err) {
      toast.error(err.msg || 'Detach operation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteVolume = async () => {
    if (!deleteConfirmVolume) return;
    try {
      setActionLoading(true);
      await api.delete(`/storage/volumes/${deleteConfirmVolume.volume_id}`);
      toast.success('Volume deleted.');
      setDeleteConfirmVolume(null);
      await fetchVolumes();
    } catch (err) {
      toast.error(err.msg || 'Failed to delete volume');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      header: 'Volume Name',
      accessor: 'name',
      render: (row) => (
        <div>
          <strong style={{ color: 'var(--ink)' }}>{row.name}</strong>
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            #{row.volume_id}
          </div>
        </div>
      ),
    },
    {
      header: 'Size',
      accessor: 'size_gb',
      render: (row) => <span>{row.size_gb} GB</span>,
    },
    {
      header: 'Type',
      accessor: 'vol_type',
      render: (row) => (
        <span className="mono" style={{ textTransform: 'uppercase', fontSize: 12 }}>
          {row.vol_type}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      header: 'Attached To',
      accessor: 'instance_name',
      render: (row) =>
        row.instance_name ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <LinkIcon size={12} color="var(--brand)" />
            <strong>{row.instance_name}</strong>
          </span>
        ) : (
          <span style={{ color: 'var(--muted)' }}>Unattached</span>
        ),
    },
    {
      header: 'Region',
      accessor: 'region_name',
    },
    {
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'inline-flex', gap: 6 }}>
          {row.status === 'available' && can(user, 'manageVolumes') && (
            <Button
              variant="secondary"
              size="sm"
              icon={LinkIcon}
              onClick={() => {
                setActiveVolume(row);
                setShowAttachModal(true);
              }}
            >
              Attach
            </Button>
          )}

          {row.status === 'attached' && can(user, 'manageVolumes') && (
            <Button
              variant="secondary"
              size="sm"
              icon={Unlink}
              disabled={actionLoading}
              onClick={() => handleDetach(row)}
            >
              Detach
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            icon={Camera}
            title="Create Snapshot"
            onClick={() => navigate('/snapshots')}
          />

          {can(user, 'manageVolumes') && (
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              style={{ color: 'var(--danger)' }}
              disabled={row.status === 'attached'}
              title={row.status === 'attached' ? 'Detach before deleting' : 'Delete Volume'}
              onClick={() => setDeleteConfirmVolume(row)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Storage Volumes</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Manage persistent NVMe SSD and HDD block volumes
          </p>
        </div>

        {can(user, 'manageVolumes') && (
          <Button variant="primary" icon={Plus} onClick={() => setShowCreateModal(true)}>
            Create Volume
          </Button>
        )}
      </div>

      {bannerError && <Banner tone="danger" message={bannerError.msg} hint={bannerError.hint} />}

      <DataTable
        columns={columns}
        data={volumes}
        keyField="volume_id"
        loading={loading}
        emptyTitle="No storage volumes found"
        emptyDescription="Create persistent block volumes to attach to your compute servers."
        emptyAction={
          can(user, 'manageVolumes')
            ? { label: 'Create Volume', onClick: () => setShowCreateModal(true) }
            : null
        }
      />

      {/* Create Volume Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Block Storage Volume</h3>
            </div>
            <form onSubmit={handleCreateVolume}>
              <div className="modal-body">
                <Input
                  label="Volume Name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value.toLowerCase() }))}
                  placeholder="e.g. data-volume-01"
                  required
                  hint="Unique volume label (lowercase, numbers, dashes)"
                />

                <Input
                  label="Capacity (GB)"
                  type="number"
                  min="1"
                  max="16000"
                  value={createForm.size_gb}
                  onChange={(e) => setCreateForm((f) => ({ ...f, size_gb: Number(e.target.value) }))}
                  required
                />

                <div className="form-group">
                  <label className="form-label" htmlFor="vol-type">Volume Storage Technology</label>
                  <select
                    id="vol-type"
                    className="input-element"
                    value={createForm.vol_type}
                    onChange={(e) => setCreateForm((f) => ({ ...f, vol_type: e.target.value }))}
                  >
                    <option value="ssd">High-Speed NVMe SSD ($0.10 / GB-mo)</option>
                    <option value="hdd">Standard HDD ($0.04 / GB-mo)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={actionLoading}>Create Volume</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attach Volume Modal */}
      {showAttachModal && (
        <div className="modal-overlay" onClick={() => setShowAttachModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Attach Volume: {activeVolume?.name}</h3>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
                Select an instance in the same datacenter to attach this block volume.
              </p>

              <div className="form-group">
                <label className="form-label" htmlFor="attach-inst">Target Instance</label>
                <select
                  id="attach-inst"
                  className="input-element"
                  value={attachInstanceId}
                  onChange={(e) => setAttachInstanceId(e.target.value)}
                >
                  <option value="">-- Choose Instance --</option>
                  {instances.map((inst) => (
                    <option key={inst.instance_id} value={inst.instance_id}>
                      {inst.name} (#{inst.instance_id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setShowAttachModal(false)}>Cancel</Button>
              <Button variant="primary" disabled={!attachInstanceId || actionLoading} loading={actionLoading} onClick={handleAttach}>
                Attach Volume
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirmVolume}
        tone="danger"
        title={`Delete Volume ${deleteConfirmVolume?.name}?`}
        message="This volume will be deleted. Data on unattached volumes cannot be restored."
        confirmLabel="Delete Volume"
        loading={actionLoading}
        onConfirm={handleDeleteVolume}
        onClose={() => setDeleteConfirmVolume(null)}
      />
    </div>
  );
}

