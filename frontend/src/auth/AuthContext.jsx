import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setToken, clearToken, setAuthListener, api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync state if api.js refreshes the token behind the scenes
  useEffect(() => {
    setAuthListener((refreshedUser) => {
      if (refreshedUser) {
        setUser((prev) => ({ ...prev, ...refreshedUser }));
      } else {
        setUser(null);
      }
    });
  }, []);

  // Try to restore session on initial page load via refresh token cookie
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const data = await api.post('/auth/refresh', {});
        if (mounted && data?.token && data?.user) {
          setToken(data.token);
          setUser(data.user);
        }
      } catch {
        // No active cookie session, clean state
        clearToken();
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initSession();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const data = await api.post('/auth/login', { email, password });
      if (data?.token && data?.user) {
        setToken(data.token);
        setUser(data.user);
        return data.user;
      }
      throw new Error('Invalid response from server');
    } catch (err) {
      setError(err.msg || err.error || 'Authentication failed');
      throw err;
    }
  }, []);

  const register = useCallback(async (payload) => {
    setError(null);
    try {
      const data = await api.post('/auth/register', payload);
      if (data?.token && data?.user) {
        setToken(data.token);
        setUser(data.user);
        return data.user;
      }
      return data;
    } catch (err) {
      setError(err.msg || err.error || 'Registration failed');
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // Ignore network errors on logout
    } finally {
      clearToken();
      setUser(null);
      window.location.assign('/login');
    }
  }, []);

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    setUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;

