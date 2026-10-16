import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, session } from '../api.js';

export default function Login() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: form });
      session.save(token, user);
      nav('/');
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="login">
      <div className="login-art">
        <h1>NimbusHost</h1>
        <p>Compute, storage and billing for your cloud, backed by MySQL.</p>
      </div>
      <form className="login-form" onSubmit={submit}>
        <h2>Sign in</h2>
        <label className="field"><span>Email</span>
          <input autoFocus type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="field"><span>Password</span>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary">Sign in</button>
        <small className="hint">
          Demo: admin@nimbus.test / admin123<br />owner@acme.test / customer123
        </small>
      </form>
    </div>
  );
}
