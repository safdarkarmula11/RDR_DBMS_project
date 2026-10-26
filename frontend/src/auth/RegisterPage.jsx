import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Banner from '../ui/Banner';
import AmbientBackground from '../ui/AmbientBackground';
import LemonLogo from '../ui/LemonLogo';
import { api } from '../api';

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    orgName: '',
    fullName: '',
    email: '',
    password: '',
    tierId: 1, // Developer tier default
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleChange = (field, val) => {
    setForm((prev) => ({ ...prev, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.orgName || !form.fullName || !form.email || !form.password) {
      setErrorMsg('All fields are required.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      // Call backend register endpoint
      if (form.password.length < 12) {
        setErrorMsg('Password must be at least 12 characters.');
        setLoading(false);
        return;
      }
      await api.post('/auth/register', {
        org_name: form.orgName.trim(),
        full_name: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      // Auto login on successful registration
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setErrorMsg(err.msg || err.error || 'Failed to create organization. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      <AmbientBackground />

      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon" style={{ background: 'rgba(250, 204, 21, 0.15)', border: '1px solid rgba(250, 204, 21, 0.35)' }}>
            <LemonLogo size={32} />
          </div>
          <div>
            <div className="auth-title">Get Started with NimbusHost</div>
            <div className="auth-subtitle">Create your organization and cloud account</div>
          </div>
        </div>

        {errorMsg && (
          <Banner tone="danger" message={errorMsg} hint="Ensure unique organization name and email." />
        )}

        <form onSubmit={handleSubmit} noValidate>
          <Input
            label="Organization Name"
            value={form.orgName}
            onChange={(e) => handleChange('orgName', e.target.value)}
            placeholder="Acme Corp"
            required
            hint="Unique identifier for your team's cloud workspace"
          />

          <Input
            label="Full Name"
            value={form.fullName}
            onChange={(e) => handleChange('fullName', e.target.value)}
            placeholder="Alice Johnson"
            required
          />

          <Input
            label="Work Email"
            type="email"
            value={form.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="alice@acme.com"
            required
            autoComplete="username"
          />

          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => handleChange('password', e.target.value)}
            placeholder="Minimum 8 characters"
            required
            autoComplete="new-password"
          />

          <div className="form-group">
            <label className="form-label" htmlFor="tier-select">
              Account Plan Tier
            </label>
            <select
              id="tier-select"
              className="input-element"
              value={form.tierId}
              onChange={(e) => handleChange('tierId', Number(e.target.value))}
            >
              <option value={1}>Developer Tier (Up to 5 Instances, 250 GB Storage)</option>
              <option value={2}>Startup Tier (Up to 20 Instances, 2000 GB Storage, 5% Discount)</option>
              <option value={3}>Enterprise Tier (Up to 100 Instances, 20000 GB Storage, 15% Discount)</option>
            </select>
          </div>

          <div style={{ marginTop: 24 }}>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={loading}
              style={{ width: '100%', height: 42, fontSize: 14 }}
            >
              Create Account &amp; Workspace
            </Button>
          </div>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          Already registered?{' '}
          <Link to="/login" style={{ fontWeight: 600, color: 'var(--brand)' }}>
            Sign in to Console
          </Link>
        </div>
      </div>
    </div>
  );
}
