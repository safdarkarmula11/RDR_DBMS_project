import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Search, Moon, Sun, Bell, User, Check, Building, Shield, ChevronDown } from 'lucide-react';
import Button from '../ui/Button';

export default function Topbar() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const notifRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Click outside to dismiss popovers
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfile(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <header className="shell-topbar">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flex: 1,
          maxWidth: searchFocused ? 520 : 380,
          transition: 'max-width 0.25s var(--ease-out)'
        }}
      >
        <div style={{ position: 'relative', width: '100%' }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: searchFocused ? 'var(--brand)' : 'var(--muted)',
              pointerEvents: 'none',
              transition: 'color 0.2s var(--ease-out)'
            }}
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search instances, IPs, domains, tickets..."
            aria-label="Global search"
            className="input-element"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={{
              paddingLeft: 36,
              height: 36,
              fontSize: 13,
              borderRadius: 'var(--radius-full)',
              background: searchFocused ? 'var(--card)' : 'var(--bg-alt)',
              border: searchFocused ? '1px solid var(--brand)' : '1px solid var(--line)',
              transition: 'all 0.2s var(--ease-out)'
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Organization / Tenant badge */}
        {user?.org_name && (
          <div
            className="badge badge--brand"
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Building size={13} color="var(--brand)" aria-hidden="true" />
            <span style={{ fontWeight: 600 }}>{user.org_name}</span>
            {user.member_role && (
              <span style={{ opacity: 0.75, fontSize: 11 }}>({user.member_role})</span>
            )}
          </div>
        )}

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          className="btn btn--secondary btn--sm"
          style={{
            width: 34,
            height: 34,
            padding: 0,
            borderRadius: 'var(--radius-full)',
            transition: 'transform 0.25s var(--ease-spring), background-color 0.2s'
          }}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          {theme === 'light' ? (
            <Moon size={15} style={{ transition: 'transform 0.3s ease' }} />
          ) : (
            <Sun size={15} color="var(--warn)" style={{ transition: 'transform 0.3s ease' }} />
          )}
        </button>

        {/* Notifications Button */}
        <div style={{ position: 'relative' }} ref={notifRef}>
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="btn btn--secondary btn--sm"
            style={{
              width: 34,
              height: 34,
              padding: 0,
              borderRadius: 'var(--radius-full)',
              position: 'relative'
            }}
            aria-label="View notifications"
          >
            <Bell size={15} />
            <span
              style={{
                position: 'absolute',
                top: 7,
                right: 7,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--brand)',
                boxShadow: '0 0 0 2px var(--card)'
              }}
              aria-hidden="true"
            />
          </button>

          {showNotifications && (
            <div
              className="card"
              style={{
                position: 'absolute',
                top: 44,
                right: 0,
                width: 320,
                padding: 14,
                boxShadow: 'var(--shadow-lg)',
                zIndex: 200,
                animation: 'popoverIn 0.2s var(--ease-spring) both',
                transformOrigin: 'top right'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-display)' }}>System Alerts</span>
                <span className="badge badge--ok" style={{ fontSize: 10 }}>Live</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                <div style={{ padding: '10px', background: 'var(--bg-alt)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Cluster Health: Operational</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>All MySQL triggers, procedures, and partitions active.</div>
                </div>
                <div style={{ padding: '10px', background: 'var(--bg-alt)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>SLA Compliance</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>Zero breaches in current ticketing queue.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div style={{ position: 'relative' }} ref={profileRef}>
          <button
            type="button"
            onClick={() => setShowProfile(!showProfile)}
            className="btn btn--secondary btn--sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 34,
              padding: '0 10px',
              borderRadius: 'var(--radius-full)'
            }}
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
              {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name || user?.email}
            </span>
            <ChevronDown size={13} color="var(--muted)" />
          </button>

          {showProfile && (
            <div
              className="card"
              style={{
                position: 'absolute',
                top: 44,
                right: 0,
                width: 240,
                padding: 12,
                boxShadow: 'var(--shadow-lg)',
                zIndex: 200,
                animation: 'popoverIn 0.2s var(--ease-spring) both',
                transformOrigin: 'top right'
              }}
            >
              <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--line)', marginBottom: 10 }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font-display)' }}>{user?.name}</div>
                <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 1 }}>{user?.email}</div>
                <div style={{ marginTop: 6 }}>
                  <span className="badge badge--brand" style={{ fontSize: 11, textTransform: 'capitalize' }}>
                    {user?.role?.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="btn btn--danger btn--sm"
                style={{ width: '100%' }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
