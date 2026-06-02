import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ScopeProvider, useScope } from './context/ScopeContext';
import { ThemeProvider } from './context/ThemeContext';
import { isConfigured } from './lib/supabase';
import ErrorBoundary from './components/ErrorBoundary';
import PageErrorBoundary from './components/PageErrorBoundary';
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Waitlist from './pages/Waitlist';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Listings from './pages/Listings';
import Reports from './pages/Reports';
import Messages from './pages/Messages';
import MatchAnalytics from './pages/MatchAnalytics';
import MatchEngine from './pages/MatchEngine';
import FeatureFlags from './pages/FeatureFlags';
import Categories from './pages/Categories';
import Tags from './pages/Tags';
import Ontology from './pages/Ontology';
import Analytics from './pages/Analytics';
import AuditLog from './pages/AuditLog';
import Events from './pages/Events';
import OnboardingFunnel from './pages/OnboardingFunnel';
import OtaReleases from './pages/OtaReleases';
import Notifications from './pages/Notifications';
import DeliveryQueue from './pages/DeliveryQueue';
import RemoteConfig from './pages/RemoteConfig';
import Errors from './pages/Errors';
import EdgeLogs from './pages/EdgeLogs';
import Latency from './pages/Latency';
import BackgroundJobs from './pages/BackgroundJobs';
import AdminSessions from './pages/AdminSessions';
import Security from './pages/Security';
import Settings from './pages/Settings';

// ── Organisation pages (P2) ─────────────────────────────────────
import OrgDashboard from './pages/org/Dashboard';
import OrgMembers from './pages/org/Members';
import OrgInvites from './pages/org/Invites';
import OrgTeams from './pages/org/Teams';
import OrgTeamDetail from './pages/org/TeamDetail';
import OrgSettings from './pages/org/Settings';
import OrgAudit from './pages/org/Audit';
import OrgProjects from './pages/org/Projects';
import OrgProjectDetail from './pages/org/ProjectDetail';
import OrgTaskDetail from './pages/org/TaskDetail';
import OrgTickets from './pages/org/Tickets';
import OrgInbox from './pages/org/Inbox';
import OrgApprovals from './pages/org/Approvals';
import OrgDomains from './pages/org/Domains';
import OrgMemberDetail from './pages/org/MemberDetail';
import OrgJoinRequests from './pages/org/JoinRequests';
import OrgDepartments from './pages/org/Departments';
import OrgCustomRoles from './pages/org/CustomRoles';
import OrgActivity from './pages/org/Activity';
// ── Super-Admin org ops (P2) ───────────────────────────────────
import Organisations from './pages/Organisations';

// Canonical platform-role helpers (single source of truth — lib/roles.ts).
import { isPlatformRole } from './lib/roles';

/**
 * Gate: admit anyone who is either a platform admin or a member of at
 * least one organisation. The org membership probe is async; until it
 * resolves we render the existing loading spinner.
 * 
 * CRITICAL: We must wait for both auth and scope to finish loading before
 * making any redirect decisions. This ensures page refreshes maintain the
 * current route instead of redirecting to home/login.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, role, forcePasswordChange, loading: authLoading } = useAuth();
  const { scope, memberships, isPlatformAdmin, loading: scopeLoading } = useScope();
  const location = useLocation();

  if (!isConfigured) return <Navigate to="/login" replace />;

  // CRITICAL: Show loading spinner while auth or scope is initializing.
  // This prevents premature redirects during page refresh.
  if (authLoading || scopeLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary, #0a0a0f)', gap: 16 }}>
        <div className="spinner" />
        <p style={{ color: 'var(--text-muted, #5a5a6e)', fontSize: '0.85rem' }}>Loading dashboard…</p>
      </div>
    );
  }

  // Only redirect to login if we're certain there's no user after loading completes
  if (!user) return <Navigate to="/login" replace />;

  // ── Force-password-change gate ──
  // Mirrors the mobile gate (contour/app/_layout.tsx). Any signed-in user
  // with profiles.force_password_change=true is held on /change-password
  // regardless of which route they try to load. The gate releases once
  // ChangePassword calls refreshRole() after a successful
  // password_change_acknowledge() RPC.
  if (forcePasswordChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  const hasPlatformRole = isPlatformRole(role);
  const hasOrgMembership = memberships.some((m) => m.status === 'active');

  // Allow: platform admins (existing) OR any org member (new).
  if (!hasPlatformRole && !hasOrgMembership) {
    // Note: even an org member needs an active membership; pending invites
    // alone don't grant panel access. This matches the mobile-app gate.
    void isPlatformAdmin;
    void scope; // Scope is now handled in ScopeContext with route awareness
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * Wrapper for /change-password — bypasses the platform-role/org-member
 * check so a newly-provisioned user can land here even before their
 * membership scope has fully resolved. Still requires a valid session.
 */
function ChangePasswordRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary, #0a0a0f)' }}>
        <div className="spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <ChangePassword />;
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return <PageErrorBoundary>{children}</PageErrorBoundary>;
}

/**
 * Routes are shared across scopes — the AdminLayout sidebar adapts to
 * show only what the current scope is allowed to access. Direct URL
 * access to a platform-only page when the scope is 'org' is harmless:
 * RLS rejects the data query and the page renders empty.
 */
export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ScopeProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/change-password" element={<ChangePasswordRoute />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <AdminLayout />
                    </ProtectedRoute>
                  }
                >
                <Route index element={<Navigate to="/dashboard" replace />} />

                {/* ── Platform-admin scope (existing) ─────────── */}
                <Route path="dashboard" element={<PageWrapper><Dashboard /></PageWrapper>} />
                <Route path="waitlist" element={<PageWrapper><Waitlist /></PageWrapper>} />
                <Route path="users" element={<PageWrapper><Users /></PageWrapper>} />
                <Route path="users/:id" element={<PageWrapper><UserDetail /></PageWrapper>} />
                <Route path="offers" element={<PageWrapper><Listings type="offer" /></PageWrapper>} />
                <Route path="wants" element={<PageWrapper><Listings type="want" /></PageWrapper>} />
                <Route path="reports" element={<PageWrapper><Reports /></PageWrapper>} />
                <Route path="messages" element={<PageWrapper><Messages /></PageWrapper>} />
                <Route path="match-analytics" element={<PageWrapper><MatchAnalytics /></PageWrapper>} />
                <Route path="match-engine" element={<PageWrapper><MatchEngine /></PageWrapper>} />
                <Route path="feature-flags" element={<PageWrapper><FeatureFlags /></PageWrapper>} />
                <Route path="remote-config" element={<PageWrapper><RemoteConfig /></PageWrapper>} />
                <Route path="categories" element={<PageWrapper><Categories /></PageWrapper>} />
                <Route path="tags" element={<PageWrapper><Tags /></PageWrapper>} />
                <Route path="ontology" element={<PageWrapper><Ontology /></PageWrapper>} />
                <Route path="analytics" element={<PageWrapper><Analytics /></PageWrapper>} />
                <Route path="events" element={<PageWrapper><Events /></PageWrapper>} />
                <Route path="onboarding" element={<PageWrapper><OnboardingFunnel /></PageWrapper>} />
                <Route path="ota" element={<PageWrapper><OtaReleases /></PageWrapper>} />
                <Route path="notifications" element={<PageWrapper><Notifications /></PageWrapper>} />
                <Route path="delivery-queue" element={<PageWrapper><DeliveryQueue /></PageWrapper>} />
                <Route path="audit-log" element={<PageWrapper><AuditLog /></PageWrapper>} />
                <Route path="errors" element={<PageWrapper><Errors /></PageWrapper>} />
                <Route path="edge-logs" element={<PageWrapper><EdgeLogs /></PageWrapper>} />
                <Route path="latency" element={<PageWrapper><Latency /></PageWrapper>} />
                <Route path="background-jobs" element={<PageWrapper><BackgroundJobs /></PageWrapper>} />
                <Route path="admin-sessions" element={<PageWrapper><AdminSessions /></PageWrapper>} />
                <Route path="security" element={<PageWrapper><Security /></PageWrapper>} />
                <Route path="settings" element={<PageWrapper><Settings /></PageWrapper>} />

                {/* ── Super Admin → Organisations (platform only) ── */}
                <Route path="organisations" element={<PageWrapper><Organisations /></PageWrapper>} />

                {/* ── Org-scoped admin (P2) ───────────────────── */}
                <Route path="org/dashboard" element={<PageWrapper><OrgDashboard /></PageWrapper>} />
                <Route path="org/inbox" element={<PageWrapper><OrgInbox /></PageWrapper>} />
                <Route path="org/approvals" element={<PageWrapper><OrgApprovals /></PageWrapper>} />
                <Route path="org/domains" element={<PageWrapper><OrgDomains /></PageWrapper>} />
                <Route path="org/audit" element={<PageWrapper><OrgAudit /></PageWrapper>} />
                <Route path="org/projects" element={<PageWrapper><OrgProjects /></PageWrapper>} />
                <Route path="org/projects/:id" element={<PageWrapper><OrgProjectDetail /></PageWrapper>} />
                <Route path="org/projects/:projectId/task/:taskId" element={<PageWrapper><OrgTaskDetail /></PageWrapper>} />
                <Route path="org/tickets" element={<PageWrapper><OrgTickets /></PageWrapper>} />
                <Route path="org/members" element={<PageWrapper><OrgMembers /></PageWrapper>} />
                <Route path="org/members/:userId" element={<PageWrapper><OrgMemberDetail /></PageWrapper>} />
                <Route path="org/invites" element={<PageWrapper><OrgInvites /></PageWrapper>} />
                <Route path="org/requests" element={<PageWrapper><OrgJoinRequests /></PageWrapper>} />
                <Route path="org/departments" element={<PageWrapper><OrgDepartments /></PageWrapper>} />
                <Route path="org/roles" element={<PageWrapper><OrgCustomRoles /></PageWrapper>} />
                <Route path="org/activity" element={<PageWrapper><OrgActivity /></PageWrapper>} />
                <Route path="org/teams" element={<PageWrapper><OrgTeams /></PageWrapper>} />
                <Route path="org/teams/:id" element={<PageWrapper><OrgTeamDetail /></PageWrapper>} />
                <Route path="org/settings" element={<PageWrapper><OrgSettings /></PageWrapper>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ScopeProvider>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
  );
}
