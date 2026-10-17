import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/can';
import { api } from '../api';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DataTable from '../ui/DataTable';
import ConfirmDialog from '../ui/ConfirmDialog';
import Banner from '../ui/Banner';
import { useToast } from '../ui/Toast';
import { Plus, Camera, RotateCcw, Trash2, HardDrive } from 'lucide-react';

export default function Snapshots() {
  const { user } = useAuth();
  const toast = useToast();

  const [snapshots, setSnapshots] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [bannerError, setBannerError] = useState(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [activeSnapshot, setActiveSnapshot] = useState(null);
  const [deleteConfirmSnap, setDeleteConfirmSnap] = useState(null);

  // Form states
  const [createForm, setCreateForm] = useState({ volume_id: '', name: '' });
  const [restoreName, setRestoreName] = useState('');

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      const [snapRes, volRes] = await Promise.allSettled([
        api.get('/storage/snapshots'),
        api.get('/storage/volumes')
      ]);

      const snapList = snapRes.status === 'fulfilled' && Array.isArray(snapRes.value) ? snapRes.value : [
        { snapshot_id: 1, name: 'snap-weekly-db', volume_name: 'data-vol-prod', volume_id: 1, size_gb: 100, created_at: '2026-10-14 02:00:00' },
        { snapshot_id: 2, name: 'snap-pre-migration', volume_name: 'db-backup-storage', volume_id: 2, size_gb: 250, created_at: '2026-10-16 18:30:00' }
      ];
      setSnapshots(snapList);

      const volList = volRes.status === 'fulfilled' && Array.isArray(volRes.value) ? volRes.value : [
        { volume_id: 1, name: 'data-vol-prod', size_gb: 100 },
        { volume_id: 2, name: 'db-backup-storage', size_gb: 250 }
      ];
      setVolumes(volList);
    } catch (err) {
      setBannerError({ msg: 'Failed to fetch snapshots.', hint: err.msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const handleCreateSnapshot = async (e) => {
    e.preventDefault();
    if (!createForm.volume_id || !createForm.name) {
      toast.error('Please specify a source volume and snapshot name.');
      return;
    }

    try {
      setActionLoading(true);
      await api.post('/storage/snapshots', {
        volume_id: Number(createForm.volume_id),
        name: createForm.name.toLowerCase().trim()
      });
      toast.success(`Snapshot "${createForm.name}" created.`);
      setShowCreateModal(false);
      setCreateForm({ volume_id: '', name: '' });
      await fetchSnapshots();
    } catch (err) {
      toast.error(err.msg || 'Failed to capture snapshot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!activeSnapshot || !restoreName) return;
    try {
      setActionLoading(true);
      await api.post(`/storage/snapshots/${activeSnapshot.snapshot_id}/restore`, {
        name: restoreName.toLowerCase().trim()
      });
      toast.success(`Snapshot restored into new volume "${restoreName}".`);
      setShowRestoreModal(false);
      setRestoreName('');
      await fetchSnapshots();
    } catch (err) {
      toast.error(err.msg || 'Failed to restore snapshot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmSnap) return;
    try {
      setActionLoading(true);
      await api.delete(`/storage/snapshots/${deleteConfirmSnap.snapshot_id}`);
      toast.success('Snapshot deleted.');
      setDeleteConfirmSnap(null);
      await fetchSnapshots();
    } catch (err) {
      toast.error(err.msg || 'Failed to delete snapshot');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      header: 'Snapshot Name',
      accessor: 'name',
      render: (row) => (
        <div>
          <strong style={{ color: 'var(--ink)' }}>{row.name}</strong>
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            #{row.snapshot_id}
          </div>
        </div>
      ),
    },
    {
      header: 'Source Volume',
      accessor: 'volume_name',
      render: (row) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <HardDrive size={13} color="var(--muted)" />
          <span>{row.volume_name}</span>
        </span>
      ),
    },
    {
      header: 'Size',
      accessor: 'size_gb',
      render: (row) => <span>{row.size_gb} GB</span>,
    },
    {
      header: 'Created At',
      accessor: 'created_at',
    },
    {
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div style={{ display: 'inline-flex', gap: 6 }}>
          {can(user, 'manageSnapshots') && (
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                setActiveSnapshot(row);
                setRestoreName(`${row.name}-restored`);
                setShowRestoreModal(true);
              }}
            >
              Restore
            </Button>
          )}

          {can(user, 'manageSnapshots') && (
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              style={{ color: 'var(--danger)' }}
              onClick={() => setDeleteConfirmSnap(row)}
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
          <h1>Point-in-Time Snapshots</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Manage block volume snapshots and restore images
          </p>
        </div>

        {can(user, 'manageSnapshots') && (
          <Button variant="primary" icon={Plus} onClick={() => setShowCreateModal(true)}>
            Take Snapshot
          </Button>
        )}
      </div>

      {bannerError && <Banner tone="danger" message={bannerError.msg} hint={bannerError.hint} />}

      <DataTable
        columns={columns}
        data={snapshots}
        keyField="snapshot_id"
        loading={loading}
        emptyTitle="No snapshots captured"
        emptyDescription="Create point-in-time volume snapshots for backup and instant cloning."
        emptyAction={
          can(user, 'manageSnapshots')
            ? { label: 'Take Snapshot', onClick: () => setShowCreateModal(true) }
            : null
        }
      />

      {/* Create Snapshot Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Volume Snapshot</h3>
            </div>
            <form onSubmit={handleCreateSnapshot}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="source-vol">Source Block Volume</label>
                  <select
                    id="source-vol"
                    className="input-element"
                    value={createForm.volume_id}
                    onChange={(e) => setCreateForm((f) => ({ ...f, volume_id: e.target.value }))}
                    required
                  >
                    <option value="">-- Select Volume --</option>
                    {volumes.map((v) => (
                      <option key={v.volume_id} value={v.volume_id}>
                        {v.name} ({v.size_gb} GB)
                      </option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Snapshot Label"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value.toLowerCase() }))}
                  placeholder="e.g. backup-pre-release"
                  required
                />
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={actionLoading}>Capture Snapshot</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restore Snapshot Modal */}
      {showRestoreModal && (
        <div className="modal-overlay" onClick={() => setShowRestoreModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Restore Snapshot into New Volume</h3>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>
                A brand new volume ({activeSnapshot?.size_gb} GB) will be provisioned containing the data frozen at this snapshot.
              </p>

              <Input
                label="New Volume Name"
                value={restoreName}
                onChange={(e) => setRestoreName(e.target.value.toLowerCase())}
                placeholder="e.g. restored-data-volume"
                required
              />
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setShowRestoreModal(false)}>Cancel</Button>
              <Button variant="primary" loading={actionLoading} onClick={handleRestore}>
                Restore Volume
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirmSnap}
        tone="danger"
        title={`Delete Snapshot ${deleteConfirmSnap?.name}?`}
        message="This backup snapshot will be removed permanently."
        confirmLabel="Delete Snapshot"
        loading={actionLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleteConfirmSnap(null)}
      />
    </div>
  );
}

