import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowUpRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from './AuthContext';
import { HOME } from '../nav';
import AuthShell from './AuthShell';

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

  // The landing page can send a demo account in the navigation state ("Try as Support", etc.)
  const preset = DEMO_LOGINS.find((d) => d.email === location.state?.demo);
  const [email, setEmail] = useState(preset ? preset.email : '');
  const [password, setPassword] = useState(preset ? preset.pass : '');
  const [showPw, setShowPw] = useState(false);
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
      const target = location.state?.from?.pathname || HOME[loggedUser.role] || '/dashboard';
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
    <AuthShell
      docTitle="Sign in · NimbusHost"
      eyebrow="Cloud Infrastructure Console"
      headline={
        <>
          Welcome back to the <em>console.</em>
        </>
      }
      lead="Pick up where you left off: servers, storage, domains and invoices, all backed by rules that live in the database."
      points={[
        'Role-based access for customers, support, billing and admins',
        'Every important change lands in an append-only audit log',
        'Sessions use short-lived tokens that rotate on refresh',
      ]}
      morph={0.3}
    >
      <div className="au-card">
        <div className="au-card-head" style={{ '--i': 0 }}>
          <h2>Sign in</h2>
          <p>Use your NimbusHost account to continue.</p>
        </div>

        {isExpired && (
          <div className="au-alert au-alert--warn" role="status" style={{ '--i': 1 }}>
            <b>Session expired.</b> Please sign in again to continue.
          </div>
        )}
        {errorMsg && (
          <div className="au-alert au-alert--error" role="alert">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="au-form">
          <div className="au-field" style={{ '--i': 2 }}>
            <label htmlFor="login-email">Email address</label>
            <div className="au-input">
              <Mail size={16} aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="au-field" style={{ '--i': 3 }}>
            <label htmlFor="login-password">Password</label>
            <div className="au-input">
              <Lock size={16} aria-hidden="true" />
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="au-eye"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="au-submit" disabled={loading} style={{ '--i': 4 }}>
            {loading ? <span className="au-spinner" aria-hidden="true" /> : null}
            <span>{loading ? 'Signing in…' : 'Sign in'}</span>
            {!loading && <ArrowUpRight size={18} />}
          </button>
        </form>

        <p className="au-switch" style={{ '--i': 5 }}>
          New to NimbusHost? <Link to="/register">Create an organization</Link>
        </p>

        <div className="au-demo" style={{ '--i': 6 }}>
          <span className="au-demo-title">Demo accounts · one click fills the form</span>
          <div className="au-chips">
            {DEMO_LOGINS.map((d) => (
              <button
                key={d.email}
                type="button"
                className={`au-chip${email === d.email ? ' is-on' : ''}`}
                onClick={() => fillDemo(d)}
              >
                <i aria-hidden="true" />
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AuthShell>
  );
}