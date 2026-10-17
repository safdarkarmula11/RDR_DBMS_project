import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileNav from './MobileNav';

export default function Shell() {
  return (
    <div className="shell-root">
      <Sidebar />
      <div className="shell-main">
        <Topbar />
        <main id="main-content" className="shell-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

