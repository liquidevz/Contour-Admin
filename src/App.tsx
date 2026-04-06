import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { isConfigured } from './lib/supabase';
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Waitlist from './pages/Waitlist';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Listings from './pages/Listings';
import Reports from './pages/Reports';
import Messages from './pages/Messages';
import MatchAnalytics from './pages/MatchAnalytics';
import FeatureFlags from './pages/FeatureFlags';
import Categories from './pages/Categories';
import Tags from './pages/Tags';
import Ontology from './pages/Ontology';
import Analytics from './pages/Analytics';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();

  if (!isConfigured) return <Navigate to="/login" replace />;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user || !role || !['admin', 'superadmin'].includes(role)) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="waitlist" element={<Waitlist />} />
            <Route path="users" element={<Users />} />
            <Route path="users/:id" element={<UserDetail />} />
            <Route path="offers" element={<Listings type="offer" />} />
            <Route path="wants" element={<Listings type="want" />} />
            <Route path="reports" element={<Reports />} />
            <Route path="messages" element={<Messages />} />
            <Route path="match-analytics" element={<MatchAnalytics />} />
            <Route path="feature-flags" element={<FeatureFlags />} />
            <Route path="categories" element={<Categories />} />
            <Route path="tags" element={<Tags />} />
            <Route path="ontology" element={<Ontology />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
