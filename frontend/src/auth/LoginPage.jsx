import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Banner from '../ui/Banner';
import { Cloud, Lock, Mail } from 'lucide-react';
import { HOME } from '../nav';

const DEMO_LOGINS = [
  { role: 'super_admin', label: 'Super Admin', email: 'admin@nimbus.test', pass: 'admin123' },
  { role: 'support', label: 'Support', email: 'support@nimbus.test', pass: 'support123' },
  { role: 'billing', label: 'Billing', email: 'billing@nimbus.test', pass: 'billing123' },
  { role: 'customer', label: 'Customer Owner', email: 'owner@acme.test', pass: 'customer123' },
  { role: 'customer', label: 'Customer Member', email: 'dev@acme.test', pass: 'customer123' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isExpired = new URLSearchParams(location.search).get('expired') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 24,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 440,
          padding: 32,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: 'var(--brand)',
              borderRadius: 'var(--radius-md)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              marginBottom: 12,
            }}
          >
            <Cloud size={28} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>NimbusHost</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            Cloud Infrastructure Management System
          </p>
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

          <div style={{ marginTop: 24 }}>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={loading}
              style={{ width: '100%' }}
            >
              Sign In
            </Button>
          </div>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ fontWeight: 600 }}>
            Create Organization
          </Link>
        </div>

        <div
          style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop: '1px solid var(--line)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--muted)',
              marginBottom: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Demo One-Click Credentials
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DEMO_LOGINS.map((demo) => (
              <button
                key={demo.email}
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => fillDemo(demo)}
                style={{ fontSize: 11, padding: '4px 8px' }}
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

