import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  ArrowRight,
  Shield,
  Database,
  Server,
  Cpu,
  HardDrive,
  CheckCircle2,
  Zap,
  Globe,
  Activity,
  LogIn,
  Moon,
  Sun,
  Lock,
  RefreshCw,
  Terminal,
  CreditCard,
  LifeBuoy
} from 'lucide-react';
import LemonLogo from '../ui/LemonLogo';
import DotGrid from '../ui/DotGrid';
import '../styles/landing.css';

export default function LandingPage() {
  const { user } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const showcaseItems = [
    {
      title: 'Cloud Hosting Mesh',
      tag: 'Compute',
      badgeColor: '#38BDF8',
      desc: 'Sub-second virtual machine provisioning across ap-south-1, eu-west-1, and us-east-1.',
      image: '/landing-cloud-hosting.png',
    },
    {
      title: 'Bare-Metal Hypervisors',
      tag: 'Cluster',
      badgeColor: '#A855F7',
      desc: 'Real-time hypervisor CPU, RAM, and NVMe disk scheduling with automated load balancing.',
      image: '/landing-server-purple.png',
    },
    {
      title: 'Zero-Trust Isolation',
      tag: 'Security',
      badgeColor: '#06B6D4',
      desc: 'Row-level multi-tenant separation, cryptographically signed JWT sessions, and audit logging.',
      image: '/landing-security-lock.png',
    },
    {
      title: 'Autonomous Core Engine',
      tag: 'Storage & Backup',
      badgeColor: '#F59E0B',
      desc: 'Continuous differential volume snapshots and deterministic InnoDB crash consistency.',
      image: '/hero-monolith.png',
    },
  ];

  const features = [
    {
      icon: Cpu,
      title: 'Elastic Compute Hypervisors',
      desc: 'Deploy nano to xlarge virtual instances in under 650ms. Dedicated vCPU threads, guaranteed memory allocation, and isolated guest virtualisation.',
    },
    {
      icon: HardDrive,
      title: 'NVMe Block Storage & Snapshots',
      desc: 'Attach scalable SSD/HDD storage volumes on the fly. Point-in-time snapshot backups protect against data loss with zero performance degradation.',
    },
    {
      icon: Globe,
      title: 'Global VPC & Dedicated IPv4',
      desc: 'Integrated private networking, static public IP address pooling, and automated authoritative DNS management with sub-minute propagation.',
    },
    {
      icon: Shield,
      title: 'Zero-Trust Multi-Tenancy',
      desc: 'Strict tenant isolation via MySQL foreign keys and views. Granular role-based access control (RBAC), bcrypt hashing, and audit trails.',
    },
    {
      icon: CreditCard,
      title: 'Granular Hourly Billing',
      desc: 'Precise per-hour metering across compute, attached storage, and network egress. Automated invoice generation, credit balance, and receipts.',
    },
    {
      icon: LifeBuoy,
      title: 'Enterprise Support & SLA',
      desc: 'Integrated helpdesk ticketing with real-time engineer response queues, priority SLA dispatching, and resolution auditing.',
    },
  ];

  const specs = [
    { type: 'nano', vcpu: 1, ram: '1 GB', disk: '10 GB NVMe', hourly: '$0.0060', family: 'General Purpose' },
    { type: 'micro', vcpu: 1, ram: '2 GB', disk: '20 GB NVMe', hourly: '$0.0110', family: 'General Purpose' },
    { type: 'small', vcpu: 2, ram: '4 GB', disk: '40 GB NVMe', hourly: '$0.0210', family: 'Balanced Workload' },
    { type: 'medium', vcpu: 2, ram: '8 GB', disk: '80 GB NVMe', hourly: '$0.0420', family: 'Balanced Workload' },
    { type: 'large', vcpu: 4, ram: '16 GB', disk: '160 GB NVMe', hourly: '$0.0840', family: 'Compute Optimized' },
    { type: 'xlarge', vcpu: 8, ram: '32 GB', disk: '320 GB NVMe', hourly: '$0.1680', family: 'High-Density Memory' },
  ];

  return (
    <div className="simple-landing">
      {/* ── 1. Top Navigation Bar ────────────────────────────────────────── */}
      <header className="simple-nav">
        <div className="simple-nav-inner">
          <Link to="/" className="simple-brand">
            <LemonLogo size={28} />
            <div className="simple-brand-text">
              <span className="simple-brand-name">NimbusHost</span>
              <span className="simple-brand-badge">Cloud Engine</span>
            </div>
          </Link>

        <nav className="landing-nav-actions" aria-label="Main Navigation">
          {/* Theme Toggle (Blue & White vs Blue & Black) */}
          <button
            type="button"
            onClick={toggleTheme}
            className="landing-nav-link nav-optional"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title={`Switch to ${theme === 'light' ? 'Dark Mode (Blue & Black)' : 'Light Mode (Blue & White)'}`}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} color="#38BDF8" />}
            <span>{theme === 'light' ? 'Blue & Black' : 'Blue & White'}</span>
          </button>

          {/* Replay Intro button */}
          <button
            type="button"
            onClick={handleReplayIntro}
            className="landing-nav-link nav-optional"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            title="Replay intro startup animation"
          >
            <RotateCcw size={14} />
            <span>Replay Intro</span>
          </button>

            {user ? (
              <Link to="/dashboard" className="btn btn--primary btn--sm">
                <span>Go to Console</span>
                <ArrowRight size={14} />
              </Link>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Link to="/login" className="simple-login-btn">
                  <LogIn size={15} />
                  <span>Sign In</span>
                </Link>
                <Link to="/register" className="btn btn--primary btn--sm">
                  <span>Deploy Free Node</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── 2. Hero Section ──────────────────────────────────────────────── */}
      <section className="simple-hero" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Interactive WebGL DotGrid from React Bits */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            opacity: theme === 'dark' ? 0.75 : 0.65,
            pointerEvents: 'none'
          }}
          aria-hidden="true"
        >
          <DotGrid
            baseColor={theme === 'dark' ? '#1E293B' : '#E2E8F0'}
            activeColor={theme === 'dark' ? '#38BDF8' : '#1E60F2'}
            shape="circle"
            dotSize={4}
            gap={22}
            proximity={130}
            strength={1}
            bounce={0.5}
            tension={0.3}
            returnDuration={0.8}
            shockRadius={300}
            shockStrength={4}
            swell={0.6}
            stretch={0.4}
            glow={0.5}
            fade={0.25}
            intro={false}
          />
        </div>

        <div className="simple-hero-content">
          <div className="simple-pill-badge">
            <Activity size={14} />
            <span>High-Performance Cloud Infrastructure · ACID-Guaranteed</span>
          </div>

          <h1 className="simple-hero-title">
            Next-Generation Cloud Compute & Multi-Tenant Management
          </h1>

          <p className="simple-hero-subtitle">
            Sub-second virtual instance provisioning, isolated customer VPCs, automated NVMe volume snapshots,
            and real-time hypervisor telemetry powered by guaranteed database consistency.
          </p>

          <div className="simple-hero-actions">
            <Link to="/register" className="btn btn--primary btn--lg">
              <span>Deploy Compute Node</span>
              <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="btn btn--secondary btn--lg">
              <span>Sign In to Console</span>
            </Link>
          </div>

          <div className="simple-hero-note">
            <CheckCircle2 size={13} color="var(--ok)" />
            <span>Free Nano & Micro tiers included · Instant setup · No credit card required</span>
          </div>
        </div>
      </section>

      {/* ── 3. Visual Platform Showcase Grid ─────────────────────────────── */}
      <section id="showcase" className="simple-section">
        <div className="simple-section-header">
          <span className="simple-kicker">Visual Infrastructure</span>
          <h2 className="simple-section-title">Built for Real-World Cloud Reliability</h2>
          <p className="simple-section-desc">
            Explore the interconnected subsystems running inside NimbusHost — from high-density hypervisor
            clusters to multi-tenant encryption boundaries.
          </p>
        </div>

        <div className="simple-showcase-grid">
          {showcaseItems.map((item, idx) => (
            <div key={idx} className="simple-showcase-card">
              <div className="simple-showcase-img-wrap">
                <img
                  src={item.image}
                  alt={item.title}
                  className="simple-showcase-img"
                />
                <span className="simple-showcase-tag" style={{ borderLeftColor: item.badgeColor }}>
                  {item.tag}
                </span>
              </div>
              <div className="simple-showcase-body">
                <h3 className="simple-showcase-title">{item.title}</h3>
                <p className="simple-showcase-desc">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 4. Telemetry Metrics Strip ───────────────────────────────────── */}
      <section className="simple-metrics-strip">
        <div className="simple-metric-cell">
          <span className="simple-metric-val">&lt; 650ms</span>
          <span className="simple-metric-label">Provisioning Latency</span>
        </div>
        <div className="simple-metric-cell">
          <span className="simple-metric-val">99.99%</span>
          <span className="simple-metric-label">Hypervisor Uptime SLA</span>
        </div>
        <div className="simple-metric-cell">
          <span className="simple-metric-val">100%</span>
          <span className="simple-metric-label">ACID Serializability</span>
        </div>
        <div className="simple-metric-cell">
          <span className="simple-metric-val">3 Global</span>
          <span className="simple-metric-label">Active Cloud Regions</span>
        </div>
      </section>

      {/* ── 5. Core Platform Features Grid ──────────────────────────────── */}
      <section id="features" className="simple-section">
        <div className="simple-section-header">
          <span className="simple-kicker">Platform Capabilities</span>
          <h2 className="simple-section-title">Everything Needed to Host Mission-Critical Workloads</h2>
          <p className="simple-section-desc">
            Complete cloud lifecycle automation designed for developers, systems administrators, and billing teams.
          </p>
        </div>

        <div className="simple-features-grid">
          {features.map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div key={idx} className="simple-feature-card">
                <div className="simple-feature-icon-wrap">
                  <Icon size={20} color="var(--brand)" />
                </div>
                <h3 className="simple-feature-title">{feat.title}</h3>
                <p className="simple-feature-desc">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 6. Architecture & Data Integrity Section ─────────────────────── */}
      <section id="architecture" className="simple-section simple-arch-section">
        <div className="simple-arch-box">
          <div className="simple-arch-info">
            <span className="simple-kicker">Database Architecture</span>
            <h2 className="simple-section-title" style={{ textAlign: 'left', margin: '8px 0 16px' }}>
              Engineered with 3rd Normal Form & Strict Foreign Key Policies
            </h2>
            <p className="simple-section-desc" style={{ textAlign: 'left', margin: 0 }}>
              NimbusHost enforces referential integrity through standard constraints, compound indexes,
              and stored procedures. Multi-tenant rows remain isolated, host capacities cannot be over-allocated,
              and billing items correlate strictly to measured instance compute hours.
            </p>

            <ul className="simple-arch-list">
              <li>
                <CheckCircle2 size={16} color="var(--ok)" />
                <span><strong>22 Normalized Tables</strong> covering identity, hosts, instances, billing, and tickets.</span>
              </li>
              <li>
                <CheckCircle2 size={16} color="var(--ok)" />
                <span><strong>Strict Isolation:</strong> Organizations cannot read or mutate unassociated resources.</span>
              </li>
              <li>
                <CheckCircle2 size={16} color="var(--ok)" />
                <span><strong>Immutable Audit Log:</strong> Every INSERT, UPDATE, and DELETE tracked with JSON snapshots.</span>
              </li>
            </ul>
          </div>

          <div className="simple-arch-code">
            <div className="simple-code-header">
              <span className="simple-code-dot" />
              <span className="simple-code-title">nimbushost_schema.sql</span>
            </div>
            <pre className="simple-code-block">
{`CREATE TABLE instances (
  instance_id   INT AUTO_INCREMENT PRIMARY KEY,
  org_id        INT NOT NULL,
  host_id       INT NOT NULL,
  type_id       INT NOT NULL,
  image_id      INT NOT NULL,
  name          VARCHAR(40) NOT NULL,
  status        ENUM('running','stopped','suspended'),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inst_org  FOREIGN KEY (org_id)
    REFERENCES organizations(org_id),
  CONSTRAINT fk_inst_host FOREIGN KEY (host_id)
    REFERENCES hosts(host_id)
);`}
            </pre>
          </div>
        </div>
      </section>

      {/* ── 7. Pricing & Hardware Specifications ─────────────────────────── */}
      <section id="specs" className="simple-section">
        <div className="simple-section-header">
          <span className="simple-kicker">Transparent Pricing</span>
          <h2 className="simple-section-title">Compute Instance Profiles</h2>
          <p className="simple-section-desc">
            Predictable per-hour pricing with guaranteed dedicated vCPU and RAM allocations.
          </p>
        </div>

        <div className="simple-specs-table-wrap">
          <table className="simple-specs-table">
            <thead>
              <tr>
                <th>Profile Name</th>
                <th>Workload Class</th>
                <th>vCPU Cores</th>
                <th>RAM</th>
                <th>SSD Storage</th>
                <th>Hourly Rate</th>
                <th>Monthly Estimate</th>
              </tr>
            </thead>
            <tbody>
              {specs.map((item) => (
                <tr key={item.type}>
                  <td className="simple-specs-name">
                    <span className="simple-specs-dot" />
                    <strong>{item.type}</strong>
                  </td>
                  <td>{item.family}</td>
                  <td><strong>{item.vcpu} vCPU</strong></td>
                  <td>{item.ram}</td>
                  <td>{item.disk}</td>
                  <td className="simple-specs-price">{item.hourly}/hr</td>
                  <td className="simple-specs-monthly">
                    ~${(parseFloat(item.hourly.replace('$', '')) * 730).toFixed(2)}/mo
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 8. Simple Call to Action Banner ──────────────────────────────── */}
      <section className="simple-cta-section">
        <div className="simple-cta-card">
          <h2 className="simple-cta-title">Ready to Launch Your Cloud Workload?</h2>
          <p className="simple-cta-desc">
            Experience sub-second provisioning, reliable isolation, and deterministic transaction consistency today.
          </p>
          <div className="simple-cta-actions">
            <Link to="/register" className="btn btn--primary btn--lg">
              <span>Create Free Account</span>
              <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="btn btn--secondary btn--lg">
              <span>Sign In</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 9. Simple Clean Footer ───────────────────────────────────────── */}
      <footer className="simple-footer">
        <div className="simple-footer-inner">
          <div className="simple-footer-brand">
            <LemonLogo size={22} />
            <span>NimbusHost Cloud Management Engine</span>
          </div>
          <div className="simple-footer-links">
            <a href="#showcase">Showcase</a>
            <a href="#features">Features</a>
            <a href="#architecture">Architecture</a>
            <a href="#specs">Pricing</a>
            <Link to="/login">Console Login</Link>
          </div>
        </div>
        <div className="simple-footer-copy">
          Course AI203 DBMS Project · Distributed Cloud Infrastructure & Relational Storage Engine
        </div>
      </footer>
    </div>
  );
}