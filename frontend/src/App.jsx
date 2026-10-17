import React from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import Shell from './layout/Shell';
import RequireRole from './auth/RequireRole';
import LoginPage from './auth/LoginPage';
import RegisterPage from './auth/RegisterPage';

// Customer pages
import Dashboard from './pages/Dashboard';
import Instances from './pages/Instances';
import LaunchWizard from './pages/LaunchWizard';
import InstanceDetail from './pages/InstanceDetail';
import Volumes from './pages/Volumes';
import Snapshots from './pages/Snapshots';
import Network from './pages/Network';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Usage from './pages/Usage';
import Tickets from './pages/Tickets';
import Team from './pages/Team';

// Admin pages
import Capacity from './pages/admin/Capacity';
import Hosts from './pages/admin/Hosts';
import Pricing from './pages/admin/Pricing';
import AuditLog from './pages/admin/AuditLog';
import Consistency from './pages/admin/Consistency';
import PerfLab from './pages/admin/PerfLab';
import Reports from './pages/admin/Reports';
import Simulator from './pages/admin/Simulator';

// Billing pages
import BillingDashboard from './pages/billing/BillingDashboard';
import AllInvoices from './pages/billing/AllInvoices';
import GenerateInvoice from './pages/billing/GenerateInvoice';
import Aging from './pages/billing/Aging';
import Credits from './pages/billing/Credits';
import Revenue from './pages/billing/Revenue';

// Support pages
import TicketQueue from './pages/support/TicketQueue';
import MyTickets from './pages/support/MyTickets';
import Customers from './pages/support/Customers';
import SLABoard from './pages/support/SLABoard';

import Button from './ui/Button';
import { FileQuestion } from 'lucide-react';

function NotFoundPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: 'rgba(107, 118, 144, 0.12)',
          padding: 16,
          borderRadius: '50%',
          marginBottom: 16,
        }}
      >
        <FileQuestion size={44} color="var(--muted)" />
      </div>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>404 — Page Not Found</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 440, marginBottom: 24, fontSize: 14 }}>
        The cloud resource or console path you are looking for does not exist or has been moved.
      </p>
      <Link to="/">
        <Button variant="primary">Return to Console</Button>
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public Authentication routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Main Console Layout */}
      <Route element={<Shell />}>
        {/* Customer Workspace Routes */}
        <Route
          path="/"
          element={
            <RequireRole allow={['customer', 'super_admin']}>
              <Dashboard />
            </RequireRole>
          }
        />
        <Route
          path="/instances"
          element={
            <RequireRole allow={['customer', 'super_admin']}>
              <Instances />
            </RequireRole>
          }
        />
        <Route
          path="/instances/launch"
          element={
            <RequireRole allow={['customer', 'super_admin']}>
              <LaunchWizard />
            </RequireRole>
          }
        />
        <Route
          path="/instances/:id"
          element={
            <RequireRole allow={['customer', 'super_admin', 'support']}>
              <InstanceDetail />
            </RequireRole>
          }
        />
        <Route
          path="/volumes"
          element={
            <RequireRole allow={['customer', 'super_admin']}>
              <Volumes />
            </RequireRole>
          }
        />
        <Route
          path="/snapshots"
          element={
            <RequireRole allow={['customer', 'super_admin']}>
              <Snapshots />
            </RequireRole>
          }
        />
        <Route
          path="/network"
          element={
            <RequireRole allow={['customer', 'super_admin']}>
              <Network />
            </RequireRole>
          }
        />
        <Route
          path="/invoices"
          element={
            <RequireRole allow={['customer', 'super_admin', 'billing']}>
              <Invoices />
            </RequireRole>
          }
        />
        <Route
          path="/invoices/:id"
          element={
            <RequireRole allow={['customer', 'super_admin', 'billing']}>
              <InvoiceDetail />
            </RequireRole>
          }
        />
        <Route
          path="/usage"
          element={
            <RequireRole allow={['customer', 'super_admin', 'billing']}>
              <Usage />
            </RequireRole>
          }
        />
        <Route
          path="/tickets"
          element={
            <RequireRole allow={['customer', 'super_admin', 'support']}>
              <Tickets />
            </RequireRole>
          }
        />
        <Route
          path="/team"
          element={
            <RequireRole allow={['customer', 'super_admin']}>
              <Team />
            </RequireRole>
          }
        />

        {/* Super Admin Infrastructure & Lab Routes */}
        <Route
          path="/admin/capacity"
          element={
            <RequireRole allow={['super_admin']}>
              <Capacity />
            </RequireRole>
          }
        />
        <Route
          path="/admin/hosts"
          element={
            <RequireRole allow={['super_admin']}>
              <Hosts />
            </RequireRole>
          }
        />
        <Route
          path="/admin/pricing"
          element={
            <RequireRole allow={['super_admin']}>
              <Pricing />
            </RequireRole>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RequireRole allow={['super_admin']}>
              <AuditLog />
            </RequireRole>
          }
        />
        <Route
          path="/admin/consistency"
          element={
            <RequireRole allow={['super_admin']}>
              <Consistency />
            </RequireRole>
          }
        />
        <Route
          path="/admin/perf"
          element={
            <RequireRole allow={['super_admin']}>
              <PerfLab />
            </RequireRole>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <RequireRole allow={['super_admin']}>
              <Reports />
            </RequireRole>
          }
        />
        <Route
          path="/admin/simulator"
          element={
            <RequireRole allow={['super_admin']}>
              <Simulator />
            </RequireRole>
          }
        />

        {/* Billing Operations Routes */}
        <Route
          path="/billing"
          element={
            <RequireRole allow={['billing', 'super_admin']}>
              <BillingDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/billing/invoices"
          element={
            <RequireRole allow={['billing', 'super_admin']}>
              <AllInvoices />
            </RequireRole>
          }
        />
        <Route
          path="/billing/generate"
          element={
            <RequireRole allow={['billing', 'super_admin']}>
              <GenerateInvoice />
            </RequireRole>
          }
        />
        <Route
          path="/billing/aging"
          element={
            <RequireRole allow={['billing', 'super_admin']}>
              <Aging />
            </RequireRole>
          }
        />
        <Route
          path="/billing/credits"
          element={
            <RequireRole allow={['billing', 'super_admin']}>
              <Credits />
            </RequireRole>
          }
        />
        <Route
          path="/billing/revenue"
          element={
            <RequireRole allow={['billing', 'super_admin']}>
              <Revenue />
            </RequireRole>
          }
        />

        {/* Technical Support Operations Routes */}
        <Route
          path="/support/queue"
          element={
            <RequireRole allow={['support', 'super_admin']}>
              <TicketQueue />
            </RequireRole>
          }
        />
        <Route
          path="/support/my-tickets"
          element={
            <RequireRole allow={['support', 'super_admin']}>
              <MyTickets />
            </RequireRole>
          }
        />
        <Route
          path="/support/customers"
          element={
            <RequireRole allow={['support', 'super_admin']}>
              <Customers />
            </RequireRole>
          }
        />
        <Route
          path="/support/sla"
          element={
            <RequireRole allow={['support', 'super_admin']}>
              <SLABoard />
            </RequireRole>
          }
        />

        {/* 404 Not Found inside Shell */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}