import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Banner from '../ui/Banner';
import AmbientBackground from '../ui/AmbientBackground';
import { Lock, Mail } from 'lucide-react';
import LemonLogo from '../ui/LemonLogo';
import { HOME } from '../nav';

const DEMO_LOGINS = [
  { role: 'super_admin', label: 'Super Admin',   email: 'admin@nimbus.test',   pass: 'admin123' },
  { role: 'support',     label: 'Support',        email: 'support@nimbus.test', pass: 'support123' },
  { role: 'billing',     label: 'Billing',        email: 'billing@nimbus.test', pass: 'billing123' },
  { role: 'customer',    label: 'Customer Owner', email: 'owner@acme.test',     pass: 'customer123' },
  { role: 'customer',    label: 'Customer Member',email: 'dev@acme.test',       pass: 'customer123' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const isExpired = new URLSearchParams(location.search).get('expired') === '1';

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const loggedUser = await login(email, password);
      const target = location.state?.from?.pathname || HOME[loggedUser.role] || '/';
      navigate(target, { replace: true });
    } catch (err) {
      setErrorMsg(err.msg || err.error || 'Failed to sign in. Verify credentials and database connection.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (demo) => {
    setEmail(demo.email);
    setPassword(demo.pass);
    setErrorMsg(null);
  };

  return (
    <div className="auth-root">
      <AmbientBackground />

      <div className="auth-card">
        {/* Logo + title */}
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon" style={{ background: 'rgba(250, 204, 21, 0.15)', border: '1px solid rgba(250, 204, 21, 0.35)' }}>
            <LemonLogo size={32} />
          </div>
          <div>
            <div className="auth-title">NimbusHost</div>
            <div className="auth-subtitle">Cloud Infrastructure Management</div>
          </div>
        </div>

        {isExpired && (
          <Banner tone="warn" message="Session expired." hint="Please sign in again to continue." />
        )}

        {errorMsg && (
          <Banner tone="danger" message={errorMsg} hint="Check your database seed users or password." />
        )}

        <form onSubmit={handleSubmit} noValidate>
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
            autoComplete="username"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />

          <div style={{ marginTop: 22 }}>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={loading}
              style={{ width: '100%', height: 42, fontSize: 14 }}
            >
              Sign In
            </Button>
          </div>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div>
            Don't have an account?{' '}
            <Link to="/register" style={{ fontWeight: 600, color: 'var(--brand)' }}>
              Create Organization
            </Link>
          </div>
          <div>
            <Link
              to="/landing"
              style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}
              onMouseEnter={e => e.target.style.color = 'var(--brand)'}
              onMouseLeave={e => e.target.style.color = 'var(--muted)'}
            >
              ← Interactive Platform Tour &amp; Architecture
            </Link>
          </div>
        </div>

        {/* Demo credentials */}
        <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--subtle)',
            marginBottom: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Demo one-click credentials
          </div>
          <div className="demo-grid">
            {DEMO_LOGINS.map((demo) => (
              <button
                key={demo.email}
                type="button"
                className="demo-pill"
                onClick={() => fillDemo(demo)}
              >
                {demo.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
