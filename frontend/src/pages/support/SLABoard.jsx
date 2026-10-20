import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import Button from '../../ui/Button';
import StatusBadge from '../../ui/StatusBadge';
import { AlertOctagon, CheckCircle2, Clock, ShieldCheck, User } from 'lucide-react';
import Banner from '../../ui/Banner';

const LANES = [
  { id: 'critical', title: 'Critical SLA (1h Target)', tone: 'danger', bg: 'rgba(240, 68, 97, 0.08)' },
  { id: 'high', title: 'High Priority (4h Target)', tone: 'warn', bg: 'rgba(245, 165, 36, 0.08)' },
  { id: 'medium', title: 'Medium Priority (12h Target)', tone: 'brand', bg: 'rgba(47, 107, 255, 0.08)' },
  { id: 'low', title: 'Low Priority (24h Target)', tone: 'muted', bg: 'rgba(107, 118, 144, 0.08)' },
];

export default function SLABoard() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function fetchSlaData() {
      try {
        setLoading(true);
        const data = await api.get('/support/sla');
        if (mounted) { setTickets(Array.isArray(data) ? data : []); setLoadError(null); }
      } catch (err) {
        if (mounted) setLoadError({ msg: 'Could not load the SLA board.', hint: err.msg });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchSlaData();
    return () => { mounted = false; };
  }, []);

  return (
    <div>
      {loadError && <Banner tone="danger" message={loadError.msg} hint={loadError.hint} />}
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
                {laneTickets.map(t => (
                  <div
                    key={t.ticket_id}
                    className="card"
                    style={{
                      padding: 12,
                      borderLeft: `4px solid var(--${lane.tone})`,
                      boxShadow: 'var(--shadow-sm)'
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
                      <span className="mono" style={{ color: t.hours_left <= 1 ? 'var(--danger)' : 'var(--ink)', fontWeight: 600 }}>
                        {t.hours_left}h left
                      </span>
                    </div>
                  </div>
                ))}

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

