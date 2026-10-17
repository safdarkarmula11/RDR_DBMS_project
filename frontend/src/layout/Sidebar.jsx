import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NAV } from '../nav';
import { Cloud, Shield, LogOut } from 'lucide-react';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const role = user?.role || 'customer';
  const navItems = NAV[role] || NAV.customer;

  return (
    <aside className="shell-sidebar" aria-label="Main Navigation">
      <div className="sidebar-brand">
        <div className="logo-icon">
          <Cloud size={18} />
        </div>
        <div>
          <div style={{ lineHeight: 1.1, fontSize: 15, fontWeight: 700 }}>NimbusHost</div>
          <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Cloud Management
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || item.to === '/billing' || item.to === '/support/queue' || item.to === '/admin/capacity'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.2)',
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.org_name || user?.name || 'Nimbus User'}
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 11, textTransform: 'capitalize' }}>
              {role.replace('_', ' ')}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="btn btn--ghost btn--sm"
            style={{ color: 'rgba(255, 255, 255, 0.6)', padding: 4, height: 26, width: 26, minHeight: 'unset', minWidth: 'unset' }}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

