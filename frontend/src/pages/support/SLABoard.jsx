import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import StatusBadge from '../../ui/StatusBadge';
import { AlertOctagon, CheckCircle2, Clock, ShieldCheck, User } from 'lucide-react';

const LANES = [
  { id: 'critical', title: 'Critical SLA (1h Target)', tone: 'danger', bg: 'rgba(240, 68, 97, 0.08)' },
  { id: 'high', title: 'High Priority (4h Target)', tone: 'warn', bg: 'rgba(245, 165, 36, 0.08)' },
  { id: 'medium', title: 'Medium Priority (12h Target)', tone: 'brand', bg: 'var(--brand-light)' },
  { id: 'low', title: 'Low Priority (24h Target)', tone: 'muted', bg: 'rgba(107, 118, 144, 0.08)' },
];

export default function SLABoard() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchSlaData() {
      try {
        setLoading(true);
        const data = await api.get('/support/sla');
        const fallback = [
          { ticket_id: 104, subject: 'Database Host Panic (Host-01)', priority: 'critical', org_name: 'Stark Tech', hours_left: 0.8, status: 'open' },
          { ticket_id: 101, subject: 'Volume Mount Failures', priority: 'high', org_name: 'Acme Enterprises', hours_left: 2.5, status: 'in_progress' },
          { ticket_id: 102, subject: 'Reverse DNS PTR Request', priority: 'medium', org_name: 'Wayne Logistics', hours_left: 10.4, status: 'open' },
          { ticket_id: 99, subject: 'Invoice Item Tax Consultation', priority: 'low', org_name: 'Cyberdyne Systems', hours_left: 22.0, status: 'open' },
          { ticket_id: 98, subject: 'API Token Rotation Question', priority: 'low', org_name: 'Acme Enterprises', hours_left: 21.5, status: 'resolved' },
        ];
        if (mounted) setTickets(Array.isArray(data) && data.length ? data : fallback);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchSlaData();
    return () => { mounted = false; };
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1>SLA Compliance Board</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
          Service Level Agreement visual response matrix and breach countdown tracker
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {LANES.map(lane => {
          const laneTickets = tickets.filter(t => t.priority === lane.id);

          return (
            <div
              key={lane.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '75vh',
                padding: 12,
                background: 'var(--card)'
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: lane.bg,
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <strong style={{ fontSize: 13 }}>{lane.title}</strong>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{laneTickets.length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1 }}>
                {laneTickets.map((t, idx) => {
                  const isUrgent = t.hours_left <= 1 && t.status !== 'resolved';
                  return (
                    <div
                      key={t.ticket_id}
                      className="card card-interactive"
                      style={{
                        padding: 12,
                        borderLeft: `4px solid var(--${lane.tone})`,
                        boxShadow: 'var(--shadow-sm)',
                        animation: isUrgent ? 'pulseWarn 2.5s infinite' : undefined,
                        transition: 'transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>#{t.ticket_id}</span>
                        <StatusBadge value={t.status} />
                      </div>

                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', marginBottom: 6 }}>
                        {t.subject}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                        <span>{t.org_name}</span>
                        <span className="mono" style={{ color: isUrgent ? 'var(--danger)' : 'var(--ink)', fontWeight: 600 }}>
                          {t.hours_left}h left
                        </span>
                      </div>
                    </div>
                  );
                })}

                {laneTickets.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--muted)', fontSize: 12 }}>
                    No tickets in this SLA window
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

