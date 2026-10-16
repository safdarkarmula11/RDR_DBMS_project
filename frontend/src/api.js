export const session = {
  get user() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  get token() { return localStorage.getItem('token'); },
  save(token, user) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); },
  clear() { localStorage.removeItem('token'); localStorage.removeItem('user'); },
};

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') { session.clear(); window.location.href = '/login'; }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
