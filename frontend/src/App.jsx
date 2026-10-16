import { Navigate, Route, Routes } from 'react-router-dom';
import { session } from './api.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Catalog from './pages/Catalog.jsx';
import Infrastructure from './pages/Infrastructure.jsx';
import Pricing from './pages/Pricing.jsx';
import Instances from './pages/Instances.jsx';

function Protected({ roles, children }) {
  const user = session.user;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/catalog" element={<Protected><Catalog /></Protected>} />
      <Route path="/infrastructure" element={<Protected roles={['super_admin', 'support']}><Infrastructure /></Protected>} />
      <Route path="/pricing" element={<Protected roles={['super_admin', 'billing', 'support']}><Pricing /></Protected>} />
      <Route path="/instances" element={<Protected><Instances /></Protected>} />
      {/* Step 4+: /volumes, /billing, /tickets, /admin/... */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
