import { NavLink, useNavigate } from 'react-router-dom';
import { session } from '../api.js';

// Modules appear here as they get built. "soon" items are placeholders from the plan.
const NAV = [
  { to: '/', label: 'Overview', roles: ['super_admin', 'support', 'billing', 'customer'] },
  { to: '/catalog', label: 'Catalog', roles: ['super_admin', 'support', 'billing', 'customer'] },
  { to: '/infrastructure', label: 'Infrastructure', roles: ['super_admin', 'support'] },
  { to: '/pricing', label: 'Types & pricing', roles: ['super_admin', 'support', 'billing'] },
  { to: '/instances', label: 'Instances', roles: ['super_admin', 'support', 'billing', 'customer'] },
  { label: 'Storage & network', soon: true, roles: ['customer'] },
  { label: 'Invoices', soon: true, roles: ['customer', 'billing'] },
  { label: 'Tickets', soon: true, roles: ['customer', 'support', 'super_admin'] },
  { label: 'Reports', soon: true, roles: ['super_admin', 'billing'] },
  { label: 'Audit log', soon: true, roles: ['super_admin'] },
];

export default function Layout({ children }) {
  const nav = useNavigate();
  const user = session.user;
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="dot" />NimbusHost</div>
        <nav>
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) =>
            n.soon ? (
              <span key={n.label} className="soon">{n.label}<em>soon</em></span>
            ) : (
              <NavLink key={n.label} to={n.to} end className={({ isActive }) => (isActive ? 'active' : '')}>{n.label}</NavLink>
            ))}
        </nav>
        <div className="who">
          <div>{user.name}</div>
          <small>{user.role.replace('_', ' ')}{user.org_name ? ` · ${user.org_name}` : ''}</small>
          <button className="ghost" onClick={() => { session.clear(); nav('/login'); }}>Log out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
