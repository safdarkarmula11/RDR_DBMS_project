import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowUpRight, Building2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useAuth } from './AuthContext';
import { api } from '../api';
import { HOME } from '../nav';
import AuthShell from './AuthShell';

const MIN_PASSWORD = 12;

function strength(pw) {
  let s = 0;
  if (pw.length >= MIN_PASSWORD) s += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  return s;
}
const STRENGTH_LABEL = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ orgName: '', fullName: '', email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const score = form.password ? strength(form.password) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.orgName || !form.fullName || !form.email || !form.password) {
      setErrorMsg('All fields are required.');
      return;
    }
    if (form.password.length < MIN_PASSWORD) {
      setErrorMsg(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      await api.post('/auth/register', {
        org_name: form.orgName.trim(),
        full_name: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      // Sign in straight after registering
      const loggedUser = await login(form.email, form.password);
      navigate(HOME[loggedUser?.role] || '/dashboard', { replace: true });
    } catch (err) {
      setErrorMsg(err.msg || err.error || 'Failed to create organization. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      docTitle="Create your workspace · NimbusHost"
      eyebrow="Create your workspace"
      headline={
        <>
          Spin up your own <em>cloud.</em>
        </>
      }
      lead="Create an organization and an owner account in one step. Your data stays in its own isolated tenant."
      points={[
        'Your organization is an isolated tenant: others never see your data',
        'Starts on the Free plan: up to 2 servers and 50 GB of storage',
        'Invite teammates and manage API keys once you are in',
      ]}
      morph={0.7}
    >
      <div className="au-card">
        <div className="au-card-head" style={{ '--i': 0 }}>
          <h2>Create account</h2>
          <p>It takes less than a minute.</p>
        </div>

        {errorMsg && (
          <div className="au-alert au-alert--error" role="alert">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="au-form">
          <div className="au-field" style={{ '--i': 1 }}>
            <label htmlFor="reg-org">Organization name</label>
            <div className="au-input">
              <Building2 size={16} aria-hidden="true" />
              <input id="reg-org" value={form.orgName} onChange={set('orgName')} placeholder="Acme Corp" autoComplete="organization" required />
            </div>
            <small>A unique name for your team's workspace.</small>
          </div>

          <div className="au-row">
            <div className="au-field" style={{ '--i': 2 }}>
              <label htmlFor="reg-name">Full name</label>
              <div className="au-input">
                <User size={16} aria-hidden="true" />
                <input id="reg-name" value={form.fullName} onChange={set('fullName')} placeholder="Alice Johnson" autoComplete="name" required />
              </div>
            </div>
            <div className="au-field" style={{ '--i': 3 }}>
              <label htmlFor="reg-email">Work email</label>
              <div className="au-input">
                <Mail size={16} aria-hidden="true" />
                <input id="reg-email" type="email" value={form.email} onChange={set('email')} placeholder="alice@acme.com" autoComplete="email" required />
              </div>
            </div>
          </div>

          <div className="au-field" style={{ '--i': 4 }}>
            <label htmlFor="reg-password">Password</label>
            <div className="au-input">
              <Lock size={16} aria-hidden="true" />
              <input
                id="reg-password"
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder={`At least ${MIN_PASSWORD} characters`}
                autoComplete="new-password"
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
            <div className="au-meter" aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <i key={n} className={score >= n ? `on s${score}` : ''} />
              ))}
              <span>{form.password ? STRENGTH_LABEL[score] : `Use ${MIN_PASSWORD}+ characters`}</span>
            </div>
          </div>

          <button type="submit" className="au-submit" disabled={loading} style={{ '--i': 5 }}>
            {loading ? <span className="au-spinner" aria-hidden="true" /> : null}
            <span>{loading ? 'Creating workspace…' : 'Create account and workspace'}</span>
            {!loading && <ArrowUpRight size={18} />}
          </button>
        </form>

        <p className="au-switch" style={{ '--i': 6 }}>
          Already registered? <Link to="/login">Sign in to the console</Link>
        </p>
      </div>
    </AuthShell>
  );
}