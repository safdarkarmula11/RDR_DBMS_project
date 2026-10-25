import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { INTRO_CONFIG } from './introConfig';
import { Server, ShieldCheck, RefreshCw, Cpu, CheckCircle2, Lock, HardDrive } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export default function PinnedFeatures() {
  const containerRef = useRef(null);
  const cardsRef = useRef([]);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      cardsRef.current.forEach((card, index) => {
        if (!card) return;

        // Visual animation on content panel while pinned
        const content = card.querySelector('.pinned-card-box');
        const graphic = card.querySelector('.feature-graphic-panel');

        gsap.fromTo(
          graphic,
          { opacity: 0.6, scale: 0.95 },
          {
            opacity: 1,
            scale: 1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 30%',
              end: 'bottom 70%',
              scrub: 1,
            },
          }
        );
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="features-pinned-track">
      <div className="features-section-header">
        <div className="features-kicker">Core System Architecture</div>
        <h2 className="features-heading">Engineered for Data Consistency First</h2>
        <p className="features-subheading">
          Explore how NimbusHost solves hypervisor capacity contention, multi-tenant row leakage,
          and snapshot crash consistency through deterministic database constraints.
        </p>
      </div>

      {INTRO_CONFIG.features.map((feature, idx) => (
        <div
          key={feature.id}
          ref={(el) => (cardsRef.current[idx] = el)}
          className="pinned-card-stage"
          style={{ top: `${100 + idx * 24}px` }}
        >
          <div className="pinned-card-box">
            {/* Left Column: Descriptive info & stats */}
            <div>
              <div className="feature-tag">{feature.tag}</div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-desc">{feature.description}</p>

              <div className="feature-pill-badge">
                <CheckCircle2 size={13} />
                <span>{feature.badge}</span>
              </div>

              <div className="feature-metrics-row">
                {feature.stats.map((stat, sIdx) => (
                  <div key={sIdx} className="feature-metric-item">
                    <span className="feature-metric-label">{stat.label}</span>
                    <span className="feature-metric-val">{stat.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Visual Telemetry / Diagram */}
            <div className="feature-graphic-panel">
              {feature.id === 'scale' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                      <Cpu size={16} color="var(--brand)" />
                      <span>Host Allocation Matrix</span>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ok)' }}>OK / READY</span>
                  </div>

                  {/* Micro Host Nodes */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ background: 'var(--bg-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span className="mono">us-east-1 // host-01</span>
                        <span className="mono">28/32 vCPU (87%)</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--line)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: '87%', background: 'var(--warn)', borderRadius: 2 }} />
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span className="mono">eu-west-1 // host-02</span>
                        <span className="mono">16/32 vCPU (50%)</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--line)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: '50%', background: 'var(--brand)', borderRadius: 2 }} />
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-alt)', padding: 10, borderRadius: 6, border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span className="mono">ap-south-1 // host-03</span>
                        <span className="mono">12/32 vCPU (37%)</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--line)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: '37%', background: 'var(--ok)', borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {feature.id === 'security' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                      <Lock size={16} color="var(--brand)" />
                      <span>Tenant Boundary Verification</span>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>JWT HS256</span>
                  </div>

                  <div
                    className="mono"
                    style={{
                      fontSize: 11,
                      lineHeight: 1.5,
                      background: 'var(--card)',
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      color: 'var(--ink)',
                    }}
                  >
                    <div><span style={{ color: 'var(--warn)' }}>-- Middleware SQL Isolation</span></div>
                    <div>SELECT * FROM instances</div>
                    <div>WHERE <span style={{ color: 'var(--ok)' }}>org_id = ?</span> AND status != 'terminated'</div>
                    <div style={{ color: 'var(--muted)', marginTop: 4 }}>-- Constant time token validation</div>
                    <div>verifyJWT(token, alg=['HS256']) -&gt; <span style={{ color: 'var(--ok)' }}>200 OK</span></div>
                  </div>
                </div>
              )}

              {feature.id === 'backup' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                      <HardDrive size={16} color="var(--brand)" />
                      <span>Point-in-Time Snapshot Stream</span>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ok)' }}>TRANSACTIONAL</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)' }} />
                      <span className="mono">NVMe Block Diff #8492</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>0.4s ago</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)' }} />
                      <span className="mono">Replication Sync (us-east -&gt; eu-west)</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>Active</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                      <span className="mono">InnoDB Write-Ahead Log (WAL) Flush</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11 }}>Synced</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

