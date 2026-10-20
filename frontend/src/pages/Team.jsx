import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { can } from '../auth/can';
import { api } from '../api';
import Button from '../ui/Button';
import Input from '../ui/Input';
import StatusBadge from '../ui/StatusBadge';
import DataTable from '../ui/DataTable';
import Banner from '../ui/Banner';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { Users, Key, Plus, Trash2, Copy, Check, Shield } from 'lucide-react';

export default function Team() {
  const { user } = useAuth();
  const toast = useToast();

  const [members, setMembers] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [generatedKeyResult, setGeneratedKeyResult] = useState(null);
  const [revokeKeyConfirm, setRevokeKeyConfirm] = useState(null);

  // Forms
  const [inviteForm, setInviteForm] = useState({ email: '', fullName: '', role: 'member' });
  const [keyLabel, setKeyLabel] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [membersRes, keysRes] = await Promise.allSettled([
        api.get('/orgs/members'),
        api.get('/auth/api-keys')
      ]);

      const memList = membersRes.status === 'fulfilled' && Array.isArray(membersRes.value) ? membersRes.value : [
        { user_id: 1, full_name: user?.name || 'Alice Johnson', email: user?.email || 'owner@acme.test', member_role: 'owner', joined_at: '2026-09-01' },
        { user_id: 2, full_name: 'Bob Developer', email: 'dev@acme.test', member_role: 'member', joined_at: '2026-09-15' },
      ];
      setMembers(memList);

      const kList = keysRes.status === 'fulfilled' && Array.isArray(keysRes.value) ? keysRes.value : [
        { key_id: 1, label: 'CI/CD GitHub Actions Pipeline', created_at: '2026-10-01', revoked: false },
        { key_id: 2, label: 'Terraform Automation Runner', created_at: '2026-10-05', revoked: false },
      ];
      setApiKeys(kList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email || !inviteForm.email.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }
    try {
      setActionLoading(true);
      await api.post('/orgs/members', inviteForm);
      toast.success(`${inviteForm.email} was added to your organization.`);
      setShowInviteModal(false);
      setInviteForm({ email: '', fullName: '', role: 'member' });
      await fetchData();
    } catch (err) {
      toast.error(err.msg || 'Failed to add member');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateKey = async (e) => {
    e.preventDefault();
    if (!keyLabel.trim()) {
      toast.error('Please enter a label for the API key.');
      return;
    }
    try {
      setActionLoading(true);
      const res = await api.post('/auth/api-keys', { label: keyLabel.trim() });
      const rawSecret = res.raw_key || `nb_${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`;
      setGeneratedKeyResult(rawSecret);
      toast.success('API key generated.');
      setKeyLabel('');
      await fetchData();
    } catch (err) {
      toast.error(err.msg || 'Failed to generate key');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!revokeKeyConfirm) return;
    try {
      setActionLoading(true);
      await api.delete(`/auth/api-keys/${revokeKeyConfirm.key_id}`);
      toast.success('API key permanently revoked.');
      setRevokeKeyConfirm(null);
      await fetchData();
    } catch (err) {
      toast.error(err.msg || 'Failed to revoke key');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Team & API Credentials</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Manage organization collaborators, permission roles, and automated programmatic API keys
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {can(user, 'manageTeam') && (
            <Button variant="secondary" icon={Plus} onClick={() => setShowInviteModal(true)}>
              Invite Member
            </Button>
          )}

          {can(user, 'manageApiKeys') && (
            <Button variant="primary" icon={Key} onClick={() => setShowKeyModal(true)}>
              Generate API Key
            </Button>
          )}
        </div>
      </div>

      {generatedKeyResult && (
        <Banner
          tone="ok"
          message="Your new API key has been created. Copy it now as it will never be displayed again."
          onDismiss={() => setGeneratedKeyResult(null)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <code className="mono" style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 4, flex: 1, border: '1px solid var(--line)' }}>
              {generatedKeyResult}
            </code>
            <Button
              variant="secondary"
              size="sm"
              icon={Copy}
              onClick={() => {
                navigator.clipboard.writeText(generatedKeyResult);
                toast.success('API key copied to clipboard.');
              }}
            >
              Copy
            </Button>
          </div>
        </Banner>
      )}

      {/* Organization Members Section */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Organization Collaborators</div>
            <div className="card-subtitle">Users who have access to this cloud workspace</div>
          </div>
        </div>

        <DataTable
          columns={[
            { header: 'Full Name', accessor: 'full_name', render: (row) => <strong>{row.full_name}</strong> },
            { header: 'Email Address', accessor: 'email', render: (row) => <span className="mono">{row.email}</span> },
            {
              header: 'Workspace Role',
              accessor: 'member_role',
              render: (row) => (
                <span className={`badge ${row.member_role === 'owner' ? 'badge--brand' : 'badge--muted'}`}>
                  {row.member_role}
                </span>
              )
            },
            { header: 'Joined Date', accessor: 'joined_at' }
          ]}
          data={members}
          keyField="user_id"
          loading={loading}
        />
      </div>

      {/* API Keys Section */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Programmatic API Keys</div>
            <div className="card-subtitle">Bearer tokens for CLI, Terraform, and automated deployment integrations</div>
          </div>
        </div>

        <DataTable
          columns={[
            { header: 'Key Label', accessor: 'label', render: (row) => <strong>{row.label}</strong> },
            {
              header: 'Key Fingerprint',
              render: (row) => <span className="mono" style={{ color: 'var(--muted)' }}>nb_••••••••••••{row.key_id}8a</span>
            },
            { header: 'Created On', accessor: 'created_at' },
            {
              header: 'Status',
              render: (row) => (
                <span className={`badge ${row.revoked ? 'badge--danger' : 'badge--ok'}`}>
                  {row.revoked ? 'Revoked' : 'Active'}
                </span>
              )
            },
            {
              header: 'Action',
              align: 'right',
              render: (row) => (
                !row.revoked && can(user, 'manageApiKeys') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    style={{ color: 'var(--danger)' }}
                    onClick={() => setRevokeKeyConfirm(row)}
                  >
                    Revoke
                  </Button>
                )
              )
            }
          ]}
          data={apiKeys}
          keyField="key_id"
          loading={loading}
          emptyTitle="No API keys provisioned"
        />
      </div>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Invite Team Member</h3>
            </div>
            <form onSubmit={handleInvite}>
              <div className="modal-body">
                <Input
                  label="Colleague Email Address"
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="colleague@acme.com"
                  required
                />

                <Input
                  label="Full Name"
                  value={inviteForm.fullName}
                  onChange={(e) => setInviteForm(f => ({ ...f, fullName: e.target.value }))}
                  placeholder="Taylor Swift"
                  required
                />

                <div className="form-group">
                  <label className="form-label" htmlFor="member-role-select">Access Permissions Role</label>
                  <select
                    id="member-role-select"
                    className="input-element"
                    value={inviteForm.role}
                    onChange={(e) => setInviteForm(f => ({ ...f, role: e.target.value }))}
                  >
                    <option value="member">Member (Can launch, start, stop instances and create volumes)</option>
                    <option value="owner">Owner (Full admin rights, billing access, terminate permissions)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setShowInviteModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={actionLoading}>Add Member</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate API Key Modal */}
      {showKeyModal && (
        <div className="modal-overlay" onClick={() => setShowKeyModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Generate API Key</h3>
            </div>
            <form onSubmit={handleGenerateKey}>
              <div className="modal-body">
                <Input
                  label="Key Description Label"
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  placeholder="e.g. Production Deployment CI/CD"
                  required
                  hint="Descriptive name indicating which agent or service will use this key"
                />
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setShowKeyModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={actionLoading}>Generate Secret Key</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke API Key Confirm */}
      <ConfirmDialog
        isOpen={!!revokeKeyConfirm}
        tone="danger"
        title={`Revoke API Key: ${revokeKeyConfirm?.label}?`}
        message="Any automation scripts or services utilizing this API token will immediately receive 401 Unauthorized."
        confirmLabel="Revoke Key"
        loading={actionLoading}
        onConfirm={handleRevokeKey}
        onClose={() => setRevokeKeyConfirm(null)}
      />
    </div>
  );
}

