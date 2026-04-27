import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { isConfigured } from './lib/supabase';
import ErrorBoundary from './components/ErrorBoundary';
import PageErrorBoundary from './components/PageErrorBoundary';
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary, #0a0a0f)', gap: 16 }}>
        <div className="spinner" />
        <p style={{ color: 'var(--text-muted, #5a5a6e)', fontSize: '0.85rem' }}>Loading dashboard…</p>
      </div>
    );
  }

  if (!user || !role || !['admin', 'superadmin', 'analyst'].includes(role)) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// Wrap each page route with a PageErrorBoundary so a crash in one page
// doesn't take down the whole app — the sidebar & layout stay intact.
function PageWrapper({ children }: { children: React.ReactNode }) {
  return <PageErrorBoundary>{children}</PageErrorBoundary>;
}

export default function App() {
  return (
    <ErrorBoundary>
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
              <Route index element={<PageWrapper><Dashboard /></PageWrapper>} />
              <Route path="waitlist" element={<PageWrapper><Waitlist /></PageWrapper>} />
              <Route path="users" element={<PageWrapper><Users /></PageWrapper>} />
              <Route path="users/:id" element={<PageWrapper><UserDetail /></PageWrapper>} />
              <Route path="offers" element={<PageWrapper><Listings type="offer" /></PageWrapper>} />
              <Route path="wants" element={<PageWrapper><Listings type="want" /></PageWrapper>} />
              <Route path="reports" element={<PageWrapper><Reports /></PageWrapper>} />
              <Route path="messages" element={<PageWrapper><Messages /></PageWrapper>} />
              <Route path="match-analytics" element={<PageWrapper><MatchAnalytics /></PageWrapper>} />
              <Route path="feature-flags" element={<PageWrapper><FeatureFlags /></PageWrapper>} />
              <Route path="categories" element={<PageWrapper><Categories /></PageWrapper>} />
              <Route path="tags" element={<PageWrapper><Tags /></PageWrapper>} />
              <Route path="ontology" element={<PageWrapper><Ontology /></PageWrapper>} />
              <Route path="analytics" element={<PageWrapper><Analytics /></PageWrapper>} />
              <Route path="audit-log" element={<PageWrapper><AuditLog /></PageWrapper>} />
              <Route path="settings" element={<PageWrapper><Settings /></PageWrapper>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
