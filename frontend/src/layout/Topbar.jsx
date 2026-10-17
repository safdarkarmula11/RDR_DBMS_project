import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Search, Moon, Sun, Bell, User, Check, Building, Shield } from 'lucide-react';
import Button from '../ui/Button';

export default function Topbar() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <header className="shell-topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, maxWidth: 480 }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted)',
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search instances, IPs, domains, tickets..."
            aria-label="Global search"
            className="input-element"
            style={{ paddingLeft: 34, height: 36, fontSize: 13 }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Organization / Tenant badge */}
        {user?.org_name && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <Building size={14} color="var(--brand)" aria-hidden="true" />
            <span>{user.org_name}</span>
            {user.member_role && (
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>({user.member_role})</span>
            )}
          </div>
        )}

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          className="btn btn--secondary btn--sm"
          style={{ width: 34, height: 34, padding: 0 }}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {/* Notifications Button */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="btn btn--secondary btn--sm"
            style={{ width: 34, height: 34, padding: 0, position: 'relative' }}
            aria-label="View notifications"
          >
            <Bell size={16} />
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--brand)',
              }}
              aria-hidden="true"
            />
          </button>

          {showNotifications && (
            <div
              className="card"
              style={{
                position: 'absolute',
                top: 42,
                right: 0,
                width: 320,
                padding: 14,
                boxShadow: 'var(--shadow-lg)',
                zIndex: 200,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>System Alerts</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Realtime</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                <div style={{ padding: '8px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontWeight: 500, color: 'var(--ink)' }}>Cluster Health: Normal</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>All MySQL triggers and procedures operational.</div>
                </div>
                <div style={{ padding: '8px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontWeight: 500, color: 'var(--ink)' }}>SLA Monitor</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>0 urgent ticket breaches in the last 24h.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowProfile(!showProfile)}
            className="btn btn--secondary btn--sm"
            style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34 }}
            aria-label="User profile menu"
            aria-expanded={showProfile}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--brand)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <span style={{ fontSize: 13, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'Account'}
            </span>
          </button>

          {showProfile && (
            <div
              className="card"
              style={{
                position: 'absolute',
                top: 42,
                right: 0,
                width: 240,
                padding: 14,
                boxShadow: 'var(--shadow-lg)',
                zIndex: 200,
              }}
            >
              <div style={{ marginBottom: 12, borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{user?.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, wordBreak: 'break-all' }}>{user?.email}</div>
                <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>
                  <Shield size={12} color="var(--brand)" />
                  <span style={{ textTransform: 'capitalize' }}>{user?.role?.replace('_', ' ')}</span>
                </div>
              </div>

              <Button
                variant="danger"
                size="sm"
                onClick={logout}
                style={{ width: '100%' }}
              >
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

