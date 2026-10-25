import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NAV } from '../nav';

export default function MobileNav() {
  const { user } = useAuth();
  const role = user?.role || 'customer';
  const navItems = (NAV[role] || NAV.customer).slice(0, 5); // display top 5 for mobile tabs

  return (
    <nav className="mobile-nav" aria-label="Mobile Navigation">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard' || item.to === '/' || item.to === '/billing' || item.to === '/support/queue' || item.to === '/admin/capacity'}
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

