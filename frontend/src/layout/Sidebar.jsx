import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NAV } from '../nav';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import LemonLogo from '../ui/LemonLogo';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const role = user?.role || 'customer';
  const navItems = NAV[role] || NAV.customer;

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('nimbus_sidebar_collapsed') === 'true';
  });

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('nimbus_sidebar_collapsed', String(next));
      return next;
    });
  };

  const initials = (user?.org_name || user?.name || 'N')
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <aside
      className={`shell-sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-label="Main Navigation"
      style={{
        width: collapsed ? 68 : 220,
        transition: 'width 0.25s var(--ease-out)',
        willChange: 'width',
      }}
    >
      {/* ── Brand Header ────────────────────────────────────────────── */}
      <div
        className="sidebar-brand"
        style={{
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '16px 10px' : '18px 16px',
          transition: 'padding 0.25s var(--ease-out)',
        }}
      >
        <div
          className="logo-icon"
          style={{
            transition: 'transform 0.3s var(--ease-spring)',
            cursor: collapsed ? 'pointer' : 'default',
            flexShrink: 0,
            background: 'rgba(250, 204, 21, 0.15)',
            border: '1px solid rgba(250, 204, 21, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={collapsed ? 'NimbusHost — click to expand' : undefined}
          onClick={collapsed ? toggleCollapse : undefined}
        >
          <LemonLogo size={20} />
        </div>
        {!collapsed && (
          <div style={{ animation: 'fadeIn 0.2s var(--ease-out)', minWidth: 0 }}>
            <div style={{ lineHeight: 1.1, fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>
              NimbusHost
            </div>
            <div style={{ fontSize: 10, color: 'rgba(155, 178, 168, 0.70)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
              Cloud Management
            </div>
          </div>
        )}
      </div>

      {/* ── Nav Links ───────────────────────────────────────────────── */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={
                item.to === '/dashboard' ||
                item.to === '/billing' ||
                item.to === '/support/queue' ||
                item.to === '/admin/capacity'
              }
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
              style={{
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '10px 0' : '8px 12px',
                transition: 'all 0.18s var(--ease-out)',
              }}
            >
              <Icon size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
              {!collapsed && (
                <span style={{ animation: 'fadeIn 0.18s var(--ease-out)', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* ── Footer: user + controls ──────────────────────────────────── */}
      <div
        style={{
          padding: collapsed ? '12px 8px' : '12px 14px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(0, 0, 0, 0.18)',
          fontSize: 12,
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
        }}>
          {/* Avatar + name */}
          {!collapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, animation: 'fadeIn 0.15s ease-out' }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'var(--brand)',
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                boxShadow: '0 0 0 2px rgba(30, 96, 242, 0.35)',
              }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>
                  {user?.org_name || user?.name || 'Nimbus User'}
                </div>
                <div style={{ color: 'rgba(155, 178, 168, 0.65)', fontSize: 11, textTransform: 'capitalize' }}>
                  {role.replace('_', ' ')}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'var(--brand)',
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                boxShadow: '0 0 0 2px rgba(30, 96, 242, 0.35)',
              }}
              title={`${user?.org_name || user?.name} (${role})`}
            >
              {initials}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            {!collapsed && (
              <button
                type="button"
                onClick={logout}
                className="btn btn--ghost btn--sm"
                style={{ color: 'rgba(155, 178, 168, 0.70)', padding: 5, height: 28, width: 28, minHeight: 'unset', minWidth: 'unset' }}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={toggleCollapse}
              className="btn btn--ghost btn--sm"
              style={{
                color: 'rgba(155, 178, 168, 0.70)',
                padding: 5,
                height: 28,
                width: 28,
                minHeight: 'unset',
                minWidth: 'unset',
              }}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
            </button>
          </div>
        </div>

        {/* Sign-out when collapsed */}
        {collapsed && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <button
              type="button"
              onClick={logout}
              className="btn btn--ghost btn--sm"
              style={{ color: 'rgba(155, 178, 168, 0.70)', padding: 5, height: 28, width: 28, minHeight: 'unset', minWidth: 'unset' }}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
