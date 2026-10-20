import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import Button from '../ui/Button';
import Input from '../ui/Input';
import StatusBadge from '../ui/StatusBadge';
import DataTable from '../ui/DataTable';
import Drawer from '../ui/Drawer';
import Banner from '../ui/Banner';
import { useToast } from '../ui/Toast';
import { LifeBuoy, Plus, Search, Send, User, ShieldCheck } from 'lucide-react';

export default function Tickets() {
  const { user } = useAuth();
  const toast = useToast();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [createForm, setCreateForm] = useState({ subject: '', priority: 'medium', message: '' });

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const data = await api.get('/tickets');
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      setTickets([]);
      setLoadError({ msg: 'Could not load tickets.', hint: err.msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const openThread = async (ticket) => {
    setSelectedTicket(ticket);
    try {
      const msgs = await api.get(`/tickets/${ticket.ticket_id}/messages`);
      setThreadMessages(Array.isArray(msgs) ? msgs : []);
    } catch (err) {
      setThreadMessages([]);
      toast.error(err.msg || 'Could not load the conversation.');
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!createForm.subject || !createForm.message) {
      toast.error('Please enter a subject and description.');
      return;
    }
    try {
      setActionLoading(true);
      await api.post('/tickets', createForm);
      toast.success('Support ticket submitted successfully.');
      setShowCreateModal(false);
      setCreateForm({ subject: '', priority: 'medium', message: '' });
      await fetchTickets();
    } catch (err) {
      toast.error(err.msg || 'Failed to submit ticket');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;
    try {
      setActionLoading(true);
      await api.post(`/tickets/${selectedTicket.ticket_id}/messages`, { body: replyText });
      toast.success('Reply sent.');
      setThreadMessages(prev => [
        ...prev,
        {
          message_id: Date.now(),
          sender_name: user?.name || 'You',
          is_staff: user?.role === 'support' || user?.role === 'super_admin',
          body: replyText,
          created_at: new Date().toISOString()
        }
      ]);
      setReplyText('');
    } catch (err) {
      toast.error(err.msg || 'Failed to send reply');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredTickets = tickets.filter(t =>
    t.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      {loadError && <Banner tone="danger" message={loadError.msg} hint={loadError.hint} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Customer Support Tickets</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Submit and track technical support inquiries with SLA tracking
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => setShowCreateModal(true)}>
          New Support Ticket
        </Button>
      </div>

      {/* Search Bar */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="search"
            placeholder="Search tickets by keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-element"
            style={{ paddingLeft: 30, height: 32, fontSize: 13 }}
          />
        </div>
      </div>

      <DataTable
        columns={[
          {
            header: 'Ticket ID',
            accessor: 'ticket_id',
            render: (row) => <strong className="mono">#{row.ticket_id}</strong>
          },
          {
            header: 'Subject',
            accessor: 'subject',
            render: (row) => <strong>{row.subject}</strong>
          },
          {
            header: 'Priority',
            accessor: 'priority',
            render: (row) => <StatusBadge value={row.priority} />
          },
          {
            header: 'Status',
            accessor: 'status',
            render: (row) => <StatusBadge value={row.status} />
          },
          {
            header: 'Created By',
            accessor: 'created_by_name'
          },
          {
            header: 'Date Submitted',
            accessor: 'created_at'
          },
          {
            header: 'Action',
            align: 'right',
            render: (row) => (
              <Button variant="ghost" size="sm" onClick={() => openThread(row)}>
                View Thread
              </Button>
            )
          }
        ]}
        data={filteredTickets}
        keyField="ticket_id"
        loading={loading}
        onRowClick={(row) => openThread(row)}
        emptyTitle="No support tickets found"
        emptyDescription="Create a ticket if you experience any infrastructure anomalies."
      />

      {/* Ticket Thread Drawer */}
      <Drawer
        isOpen={!!selectedTicket}
        title={selectedTicket?.subject || 'Ticket Thread'}
        subtitle={`Ticket #${selectedTicket?.ticket_id} · Priority: ${selectedTicket?.priority}`}
        onClose={() => setSelectedTicket(null)}
        width={540}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 16 }}>
            {threadMessages.map(msg => (
              <div
                key={msg.message_id}
                style={{
                  background: msg.is_staff ? 'rgba(47, 107, 255, 0.08)' : 'var(--bg)',
                  border: msg.is_staff ? '1px solid rgba(47, 107, 255, 0.2)' : '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {msg.is_staff ? <ShieldCheck size={14} color="var(--brand)" /> : <User size={14} color="var(--muted)" />}
                    <strong>{msg.sender_name}</strong>
                    {msg.is_staff && <span className="badge badge--brand" style={{ fontSize: 10, padding: '1px 6px' }}>Staff</span>}
                  </div>
                  <span style={{ color: 'var(--muted)' }}>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {msg.body}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendReply} style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 'auto' }}>
            <textarea
              className="input-element"
              rows={3}
              placeholder="Type your response here..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              style={{ resize: 'vertical', marginBottom: 10 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="primary" size="sm" icon={Send} loading={actionLoading} disabled={!replyText.trim() || actionLoading}>
                Send Message
              </Button>
            </div>
          </form>
        </div>
      </Drawer>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create Technical Support Ticket</h3>
            </div>
            <form onSubmit={handleCreateTicket}>
              <div className="modal-body">
                <Input
                  label="Subject Summary"
                  value={createForm.subject}
                  onChange={(e) => setCreateForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g. Cannot reach instance via SSH port 22"
                  required
                />

                <div className="form-group">
                  <label className="form-label" htmlFor="ticket-priority">Issue Urgency & Priority</label>
                  <select
                    id="ticket-priority"
                    className="input-element"
                    value={createForm.priority}
                    onChange={(e) => setCreateForm(f => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="low">Low (General guidance, non-blocking)</option>
                    <option value="medium">Medium (Standard production query)</option>
                    <option value="high">High (Service impaired or degraded)</option>
                    <option value="critical">Critical (Production outage)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="ticket-desc">Detailed Problem Description</label>
                  <textarea
                    id="ticket-desc"
                    className="input-element"
                    rows={4}
                    value={createForm.message}
                    onChange={(e) => setCreateForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Provide relevant instance IDs, IP addresses, error codes..."
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <Button variant="ghost" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" loading={actionLoading}>Submit Ticket</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

