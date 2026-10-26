import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../ui/Button';
import StatusBadge from '../../ui/StatusBadge';
import DataTable from '../../ui/DataTable';
import Drawer from '../../ui/Drawer';
import { UserCheck, CheckCircle2, Send } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import Banner from '../../ui/Banner';

export default function MyTickets() {
  const { user } = useAuth();
  const toast = useToast();

  const [myTickets, setMyTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchMyTickets = async () => {
    try {
      setLoading(true);
      const data = await api.get('/support/my-tickets');
      setMyTickets(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch (err) {
      setLoadError({ msg: 'Could not load your tickets.', hint: err.msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyTickets();
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

  const handleUpdateStatus = async (newStatus) => {
    if (!selectedTicket) return;
    try {
      setActionLoading(true);
      await api.post(`/support/tickets/${selectedTicket.ticket_id}/status`, { status: newStatus });
      toast.success(`Ticket marked as ${newStatus}.`);
      setSelectedTicket(prev => ({ ...prev, status: newStatus }));
      await fetchMyTickets();
    } catch (err) {
      toast.error(err.msg || 'Status update failed');
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
      toast.success('Reply submitted.');
      setThreadMessages(prev => [
        ...prev,
        {
          message_id: Date.now(),
          sender_name: user?.name || 'Support Agent',
          is_staff: true,
          body: replyText,
          created_at: new Date().toISOString()
        }
      ]);
      setReplyText('');
    } catch (err) {
      toast.error(err.msg || 'Failed to send message');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {loadError && <Banner tone="danger" message={loadError.msg} hint={loadError.hint} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1>My Assigned Tickets</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Support cases under your personal active investigation
          </p>
        </div>
      </div>

      <div className="card">
        <DataTable
          columns={[
            { header: 'Ticket #', accessor: 'ticket_id', render: (row) => <strong className="mono">#{row.ticket_id}</strong> },
            { header: 'Subject Issue', accessor: 'subject' },
            { header: 'Customer', accessor: 'org_name', render: (row) => <strong>{row.org_name}</strong> },
            { header: 'Priority', accessor: 'priority', render: (row) => <StatusBadge value={row.priority} /> },
            { header: 'Status', accessor: 'status', render: (row) => <StatusBadge value={row.status} /> },
            { header: 'Date Assigned', accessor: 'created_at' },
            {
              header: 'Action',
              align: 'right',
              render: (row) => (
                <Button variant="primary" size="sm" onClick={() => openThread(row)}>
                  Open Case
                </Button>
              )
            }
          ]}
          data={myTickets}
          keyField="ticket_id"
          loading={loading}
          onRowClick={(row) => openThread(row)}
          emptyTitle="No assigned tickets"
          emptyDescription="Your active ticket queue is currently clear."
        />
      </div>

      {/* Ticket Drawer */}
      <Drawer
        isOpen={!!selectedTicket}
        title={selectedTicket?.subject || 'Ticket'}
        subtitle={`Tenant: ${selectedTicket?.org_name}`}
        onClose={() => setSelectedTicket(null)}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, background: 'var(--bg)', padding: 10, borderRadius: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Status:</span>
              <StatusBadge value={selectedTicket?.status} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {selectedTicket?.status !== 'resolved' && (
                <Button variant="secondary" size="sm" icon={CheckCircle2} onClick={() => handleUpdateStatus('resolved')} disabled={actionLoading}>
                  Resolve
                </Button>
              )}
              {selectedTicket?.status !== 'closed' && (
                <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus('closed')} disabled={actionLoading}>
                  Close
                </Button>
              )}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 16 }}>
            {threadMessages.map(msg => (
              <div
                key={msg.message_id}
                style={{
                  background: msg.is_staff ? 'var(--brand-light)' : 'var(--bg)',
                  border: msg.is_staff ? '1px solid var(--line-hover)' : '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                  <strong>{msg.sender_name}</strong>
                  <span style={{ color: 'var(--muted)' }}>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {msg.body}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendReply} style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 'auto' }}>
            <textarea
              className="input-element"
              rows={3}
              placeholder="Send response to customer..."
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
    </div>
  );
}

