import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Skeleton from '../ui/Skeleton';
import Button from '../ui/Button';
import { ShieldAlert } from 'lucide-react';
import { HOME } from '../nav';

/**
 * Route protection wrapper verifying user role before rendering.
 * Shows skeleton during session restore, redirects unauthenticated users,
 * and renders a polite 403 Forbidden message if permission is lacking.
 */
export default function RequireRole({ allow = [], children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        <Skeleton rows={8} height={24} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const role = user.role;
  const isAllowed = allow.length === 0 || allow.includes(role);

  if (!isAllowed) {
    const homeUrl = HOME[role] || '/';
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          textAlign: 'center',
          padding: 24
        }}
      >
        <div
          style={{
            background: 'rgba(240, 68, 97, 0.1)',
            padding: 16,
            borderRadius: '50%',
            marginBottom: 16
          }}
        >
          <ShieldAlert size={48} color="var(--danger)" aria-hidden="true" />
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>403 — Access Restricted</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 460, marginBottom: 24, fontSize: 14 }}>
          Your account role (<code className="mono">{role}</code>) does not have permission to view this section.
        </p>
        <Link to={homeUrl}>
          <Button variant="primary">Return to Your Dashboard</Button>
        </Link>
      </div>
    );
  }

  return children;
}

