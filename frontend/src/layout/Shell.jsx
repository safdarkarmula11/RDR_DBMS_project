import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileNav from './MobileNav';
import AmbientBackground from '../ui/AmbientBackground';

export default function Shell() {
  const location = useLocation();

  return (
    <div className="shell-root">
      <AmbientBackground />
      <Sidebar />
      <div className="shell-main">
        <Topbar />
        <main id="main-content" className="shell-content" tabIndex={-1}>
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
