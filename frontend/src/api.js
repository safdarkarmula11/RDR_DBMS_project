/**
 * API client wrapper for NimbusHost.
 * Access token is stored strictly in memory (NEVER in localStorage).
 * Handles:
 *  - Bearer token header injection
 *  - 401 token refresh queue & retry
 *  - 1213 deadlock automatic retry (up to 3 attempts)
 *  - Unified error shape { code, msg, hint }
 */

let accessToken = null;
let refreshPromise = null;
let authListener = null;

export function setToken(token) {
  accessToken = token;
}

export function getToken() {
  return accessToken;
}

export function clearToken() {
  accessToken = null;
}

export function setAuthListener(fn) {
  authListener = fn;
}

async function doRefreshToken() {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // sends httpOnly refresh token cookie
    });

    if (!res.ok) {
      throw new Error('Refresh failed');
    }

    const data = await res.json();
    if (data.token) {
      setToken(data.token);
      if (authListener) authListener(data.user || null);
      return data.token;
    }
    throw new Error('No token returned');
  } catch (err) {
    clearToken();
    if (authListener) authListener(null);
    throw err;
  } finally {
    refreshPromise = null;
  }
}

export async function request(path, options = {}, attempt = 1, retriedAfterRefresh = false) {
  const url = path.startsWith('http') ? path : (path.startsWith('/api') ? path : `/api${path}`);
  const headers = {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
    credentials: 'include',
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  let res;
  try {
    res = await fetch(url, config);
  } catch (netErr) {
    throw {
      code: 'NETWORK_ERROR',
      msg: 'Could not connect to NimbusHost API. Please verify backend is running on http://localhost:5000.',
      hint: 'Run "npm run dev" in the backend directory.',
      original: netErr
    };
  }

  // Intercept 401: Token expired, attempt refresh
  if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
    // Already retried once with a fresh token and still 401: the token is fine,
    // the server is refusing this account (for example no active organization).
    // Report that error instead of refreshing again and again.
    if (retriedAfterRefresh) {
      const body = await res.json().catch(() => ({}));
      throw {
        status: 401,
        code: body?.code || 'UNAUTHORIZED',
        msg: body?.msg || body?.error || 'Not authorized for this request.',
        hint: body?.hint || null,
        details: body,
      };
    }
    try {
      if (!refreshPromise) {
        refreshPromise = doRefreshToken();
      }
      const newToken = await refreshPromise;

      // Retry original request with newly refreshed token
      return request(path, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newToken}`,
        },
      }, attempt, true);
    } catch {
      // Refresh failed; notify app and reject
      if (window.location.pathname !== '/login') {
        window.location.assign('/login?expired=1');
      }
      throw {
        code: 'UNAUTHORIZED',
        msg: 'Session expired. Please log in again.',
        status: 401
      };
    }
  }

  let data;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  } else {
    data = await res.text().catch(() => '');
  }

  // Automatic retry on DB deadlock (code RETRY or errno 1213)
  if (data && (data.code === 'RETRY' || data.errno === 1213) && attempt < 3) {
    await new Promise((r) => setTimeout(r, attempt * 150));
    return request(path, options, attempt + 1);
  }

  if (!res.ok) {
    const errorObj = {
      status: res.status,
      code: data?.code || (res.status === 404 ? 'NOT_FOUND' : res.status === 403 ? 'FORBIDDEN' : 'API_ERROR'),
      msg: data?.msg || data?.error || (typeof data === 'string' ? data : 'An unexpected error occurred.'),
      hint: data?.hint || null,
      details: data
    };
    throw errorObj;
  }

  return data;
}

export const api = {
  get: (path, opts) => request(path, { method: 'GET', ...opts }),
  post: (path, body, opts) => request(path, { method: 'POST', body, ...opts }),
  put: (path, body, opts) => request(path, { method: 'PUT', body, ...opts }),
  patch: (path, body, opts) => request(path, { method: 'PATCH', body, ...opts }),
  delete: (path, opts) => request(path, { method: 'DELETE', ...opts }),
};

export default api;