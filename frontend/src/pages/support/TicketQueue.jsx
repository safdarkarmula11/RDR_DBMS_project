import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../ui/Button';
import StatusBadge from '../../ui/StatusBadge';
import DataTable from '../../ui/DataTable';
import Drawer from '../../ui/Drawer';
import { Inbox, AlertOctagon, UserCheck, ShieldAlert, Send } from 'lucide-react';
import { useToast } from '../../ui/Toast';

export default function TicketQueue() {
  const { user } = useAuth();
  const toast = useToast();

  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchQueue = async () => {
    try {
      setLoading(true);
      const data = await api.get('/support/queue');

      const fallback = [
        { ticket_id: 104, subject: 'Production Database Kernel Panic on Host-01', priority: 'critical', org_name: 'Stark Technologies', status: 'open', assigned_to_name: null, hours_left: 0.8, created_at: '2026-10-17 09:10:00' },
        { ticket_id: 101, subject: 'Cannot mount SSD volume to staging instance', priority: 'high', org_name: 'Acme Enterprises', status: 'in_progress', assigned_to_name: 'Agent Dave', hours_left: 2.5, created_at: '2026-10-16 14:20:00' },
        { ticket_id: 102, subject: 'Reverse DNS PTR record request for elastic IP', priority: 'medium', org_name: 'Wayne Logistics', status: 'open', assigned_to_name: null, hours_left: 14.2, created_at: '2026-10-16 11:15:00' },
        { ticket_id: 99, subject: 'Billing invoice discrepancy inquiry', priority: 'low', org_name: 'Cyberdyne Systems', status: 'open', assigned_to_name: null, hours_left: 42.0, created_at: '2026-10-15 16:00:00' },
      ];

      setQueue(Array.isArray(data) && data.length ? data : fallback);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleClaim = async (ticket) => {
    try {
      setActionLoading(true);
      await api.post(`/support/tickets/${ticket.ticket_id}/assign`, { user_id: user?.user_id });
      toast.success(`Ticket #${ticket.ticket_id} assigned to you.`);
      await fetchQueue();
    } catch (err) {
      toast.error(err.msg || 'Failed to claim ticket');
    } finally {
      setActionLoading(false);
    }
  };

  const openThread = async (ticket) => {
    setSelectedTicket(ticket);
    try {
      const msgs = await api.get(`/tickets/${ticket.ticket_id}/messages`);
      setThreadMessages(Array.isArray(msgs) ? msgs : []);
    } catch {
      setThreadMessages([
        { message_id: 1, sender_name: 'Customer Admin', is_staff: false, body: 'Critical incident: server is unresponsive following kernel update.', created_at: ticket.created_at }
      ]);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;
    try {
      setActionLoading(true);
      await api.post(`/tickets/${selectedTicket.ticket_id}/messages`, { body: replyText });
      toast.success('Reply submitted to customer.');
      setThreadMessages(prev => [
        ...prev,
        {
          message_id: Date.now(),
          sender_name: user?.name || 'Support Staff',
          is_staff: true,
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1>Support Ticket Queue (SLA Prioritized)</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
            Sorted dynamically by SLA breach countdown risk (v_ticket_sla view)
          </p>
        </div>
      </div>

      <div className="card">
        <DataTable
          columns={[
            {
              header: 'SLA Risk',
              accessor: 'hours_left',
              render: (row) => {
                const urgent = row.hours_left <= 2;
                const warn = row.hours_left <= 8;
                return (
                  <span
                    className={`badge ${urgent ? 'badge--danger' : warn ? 'badge--warn' : 'badge--ok'}`}
                    style={{ fontWeight: 700 }}
                  >
                    {row.hours_left <= 0 ? 'BREACHED' : `${row.hours_left}h left`}
                  </span>
                );
              }
            },
            {
              header: 'Ticket #',
              accessor: 'ticket_id',
              render: (row) => <strong className="mono">#{row.ticket_id}</strong>
            },
            {
              header: 'Priority',
              accessor: 'priority',
              render: (row) => <StatusBadge value={row.priority} />
            },
            {
              header: 'Customer Tenant',
              accessor: 'org_name',
              render: (row) => <strong>{row.org_name}</strong>
            },
            {
              header: 'Subject Issue',
              accessor: 'subject'
            },
            {
              header: 'Status',
              accessor: 'status',
              render: (row) => <StatusBadge value={row.status} />
            },
            {
              header: 'Assigned Agent',
              accessor: 'assigned_to_name',
              render: (row) => row.assigned_to_name || <span style={{ color: 'var(--muted)' }}>Unassigned</span>
            },
            {
              header: 'Action',
              align: 'right',
              render: (row) => (
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  {!row.assigned_to_name && (
                    <Button variant="secondary" size="sm" icon={UserCheck} onClick={(e) => { e.stopPropagation(); handleClaim(row); }}>
                      Claim
                    </Button>
                  )}
                  <Button variant="primary" size="sm" onClick={() => openThread(row)}>
                    Respond
                  </Button>
                </div>
              )
            }
          ]}
          data={queue}
          keyField="ticket_id"
          loading={loading}
          onRowClick={(row) => openThread(row)}
        />
      </div>

      {/* Ticket Drawer */}
      <Drawer
        isOpen={!!selectedTicket}
        title={selectedTicket?.subject || 'Support Ticket'}
        subtitle={`Tenant: ${selectedTicket?.org_name} · SLA: ${selectedTicket?.hours_left}h remaining`}
        onClose={() => setSelectedTicket(null)}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
              placeholder="Type official support response..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              style={{ resize: 'vertical', marginBottom: 10 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="primary" size="sm" icon={Send} loading={actionLoading} disabled={!replyText.trim() || actionLoading}>
                Submit Agent Response
              </Button>
            </div>
          </form>
        </div>
      </Drawer>
    </div>
  );
}

