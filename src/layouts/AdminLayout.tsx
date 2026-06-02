import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { supabase } from '../lib/supabase';
import { canAccessRoute, roleLabel } from '../lib/roles';
import {
  LayoutDashboard, Users, UserCheck, ShoppingBag, HandHeart,
  Flag, MessageSquare, Zap, ToggleLeft, Tag, Layers, BarChart3,
  ScrollText, Settings, LogOut, Menu, X, ChevronDown, Shield,
  Activity, GitBranch, CloudDownload, Bell, Sliders,
  AlertTriangle, Terminal, UsersRound, Inbox, Gauge, Cog, KeyRound,
  SlidersHorizontal, Command, Building2, Mail, Briefcase, Check,
  User as UserIcon, FolderKanban, Receipt, Globe,
} from 'lucide-react';
import CommandPalette, { useNavCommands, type PaletteItem } from '../components/ui/CommandPalette';
import { orgGlobalSearch } from '../lib/tasks';
import { CircleDot, Ticket } from 'lucide-react';
import IdleTimeout from '../components/ui/IdleTimeout';
import ImpersonationBanner from '../components/ui/ImpersonationBanner';
import ToastHost from '../components/ui/Toast';
import ThemeToggle from '../components/ui/ThemeToggle';

/**
 * Sidebar sections for the Super-Admin (platform) scope — the existing
 * full power-user view, unchanged. Reachable only by users with a
 * platform role (admin / superadmin / analyst / …) AND when the active
 * scope is 'platform'.
 */
const platformNavSections = [
  {
    label: 'Overview',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ]
  },
  {
    label: 'User Management',
    items: [
      { to: '/waitlist', icon: UserCheck, label: 'Waitlist' },
      { to: '/users', icon: Users, label: 'All Users' },
    ]
  },
  {
    label: 'Organisations',
    items: [
      { to: '/organisations', icon: Building2, label: 'All Organisations' },
    ]
  },
  {
    label: 'Marketplace',
    items: [
      { to: '/offers', icon: ShoppingBag, label: 'Offers' },
      { to: '/wants', icon: HandHeart, label: 'Wants' },
      { to: '/reports', icon: Flag, label: 'Reports' },
    ]
  },
  {
    label: 'Communication',
    items: [
      { to: '/messages', icon: MessageSquare, label: 'Messages' },
      { to: '/notifications', icon: Bell, label: 'Notifications' },
      { to: '/delivery-queue', icon: Inbox, label: 'Delivery Queue' },
    ]
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/match-engine',    icon: SlidersHorizontal, label: 'Match Engine' },
      { to: '/match-analytics', icon: Zap, label: 'Match Analytics' },
      { to: '/feature-flags',   icon: ToggleLeft, label: 'Feature Flags' },
      { to: '/remote-config',   icon: Sliders, label: 'Remote Config' },
    ]
  },
  {
    label: 'Catalog',
    items: [
      { to: '/categories', icon: Layers, label: 'Categories' },
      { to: '/tags', icon: Tag, label: 'Tags' },
      { to: '/ontology', icon: Layers, label: 'Ontology' },
    ]
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
      { to: '/events', icon: Activity, label: 'Events' },
      { to: '/onboarding', icon: GitBranch, label: 'Onboarding' },
      { to: '/audit-log', icon: ScrollText, label: 'Audit Log' },
    ]
  },
  {
    label: 'Observability',
    items: [
      { to: '/errors', icon: AlertTriangle, label: 'Errors' },
      { to: '/latency', icon: Gauge, label: 'Latency' },
      { to: '/edge-logs', icon: Terminal, label: 'Edge Logs' },
      { to: '/background-jobs', icon: Cog, label: 'Background Jobs' },
    ]
  },
  {
    label: 'Releases',
    items: [
      { to: '/ota', icon: CloudDownload, label: 'OTA Releases' },
    ]
  },
  {
    label: 'System',
    items: [
      { to: '/admin-sessions', icon: UsersRound, label: 'Admin Sessions' },
      { to: '/security', icon: KeyRound, label: 'Security' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ]
  }
];

/**
 * Sidebar sections for an Org scope. Members see "My Workspace";
 * managers/admins/owners see additional admin sections. We filter on
 * role at render time.
 */
function buildOrgNavSections(role: 'owner' | 'admin' | 'manager' | 'member' | 'guest' | null) {
  const isAdminTier = role === 'owner' || role === 'admin';
  const isManagerOrUp = isAdminTier || role === 'manager';

  const sections: Array<{ label: string; items: Array<{ to: string; icon: any; label: string }> }> = [
    {
      label: 'Workspace',
      items: [
        { to: '/org/dashboard', icon: LayoutDashboard, label: 'Overview' },
        { to: '/org/inbox', icon: Bell, label: 'Inbox' },
      ],
    },
  ];

  // Work
  const workItems: Array<{ to: string; icon: any; label: string }> = [];
  workItems.push({ to: '/org/tickets', icon: Ticket, label: 'Tickets' }); // every member can file/triage
  if (isManagerOrUp) workItems.push({ to: '/org/projects', icon: FolderKanban, label: 'Projects' });
  if (isAdminTier)   workItems.push({ to: '/org/approvals', icon: Receipt, label: 'Approvals' });
  if (workItems.length) sections.push({ label: 'Work', items: workItems });

  // People
  const peopleItems: Array<{ to: string; icon: any; label: string }> = [];
  if (isAdminTier)   peopleItems.push({ to: '/org/members',     icon: Users,     label: 'Members'      });
  if (isAdminTier)   peopleItems.push({ to: '/org/invites',     icon: Mail,      label: 'Invitations'  });
  if (isAdminTier)   peopleItems.push({ to: '/org/requests',    icon: UserCheck, label: 'Join Requests'});
  if (isAdminTier)   peopleItems.push({ to: '/org/departments', icon: Briefcase, label: 'Departments'  });
  if (isManagerOrUp) peopleItems.push({ to: '/org/teams',       icon: UsersRound,label: 'Teams'        });
  if (peopleItems.length) sections.push({ label: 'People', items: peopleItems });

  // Settings
  if (isAdminTier) {
    sections.push({
      label: 'Administration',
      items: [
        { to: '/org/settings', icon: Settings,   label: 'Org Settings' },
        { to: '/org/roles',    icon: KeyRound,   label: 'Custom Roles' },
        { to: '/org/domains',  icon: Globe,      label: 'Domains' },
        { to: '/org/audit',    icon: ScrollText, label: 'Audit Log' },
        { to: '/org/activity', icon: Inbox,      label: 'Activity' },
      ],
    });
  }

  return sections;
}

/**
 * Sections shown when the active scope is "Personal" — the user has
 * either no orgs (yet) or has chosen to view their personal context.
 * Minimal for now; will expand as P3 lifts more features into scope.
 */
const personalNavSections = [
  {
    label: 'Personal',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
    ],
  },
];

export default function AdminLayout() {
  const { user, role, signOut } = useAuth();
  const {
    scope, memberships, isPlatformAdmin,
    switchToPersonal, switchToPlatform, switchToOrg,
  } = useScope();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Pick the right nav based on scope.
  const navSections = useMemo(() => {
    if (scope.type === 'platform') {
      // Gate each platform nav item by the viewer's platform role so an
      // analyst/support/moderator only sees what they can act on.
      return platformNavSections
        .map((s) => ({ ...s, items: s.items.filter((it) => canAccessRoute(role, it.to)) }))
        .filter((s) => s.items.length > 0);
    }
    if (scope.type === 'org')      return buildOrgNavSections(scope.role);
    return personalNavSections;
  }, [scope.type, scope.role, role]);

  const navCommands = useNavCommands(
    navSections.map(s => ({ section: s.label, items: s.items }))
  );

  // Issue-key / project search for the palette (org scope only).
  const paletteRemoteSearch = useMemo(() => {
    const orgId = scope.orgId;
    if (!orgId) return undefined;
    return async (q: string): Promise<PaletteItem[]> => {
      try {
        const res = await orgGlobalSearch(orgId, q, 12);
        const projects: PaletteItem[] = res.projects.map((p) => ({
          id: `proj:${p.id}`, label: p.name, section: 'Projects',
          icon: FolderKanban, action: () => navigate(`/org/projects/${p.id}`),
        }));
        const tasks: PaletteItem[] = res.tasks.map((t) => ({
          id: `task:${t.id}`,
          label: t.issue_key ? `${t.issue_key} · ${t.title}` : t.title,
          section: 'Issues', icon: CircleDot,
          action: () => t.project_id
            ? navigate(`/org/projects/${t.project_id}/task/${t.id}`)
            : navigate(`/org/projects`),
        }));
        return [...tasks, ...projects];
      } catch { return []; }
    };
  }, [scope.orgId, navigate]);
  const paletteItems = useMemo(() => [
    ...navCommands,
    {
      id: 'action:signout', label: 'Sign out', section: 'Actions',
      keywords: ['logout', 'exit'],
      action: async () => { await signOut(); navigate('/login'); },
    },
    {
      id: 'action:rebuild-idf', label: 'Rebuild match-engine IDF', section: 'Actions',
      keywords: ['recompute', 'index', 'corpus'],
      action: async () => { await supabase.rpc('admin_rebuild_idf_now'); },
    },
    {
      id: 'action:refresh-tags', label: 'Refresh tag usage counts', section: 'Actions',
      keywords: ['recompute', 'tags', 'usage'],
      action: async () => { await supabase.rpc('admin_refresh_tag_usage_counts'); },
    },
  ], [navCommands, signOut, navigate]);

  const toggleSection = (label: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Close mobile drawer on route change
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);
  // Close scope menu on route change too
  useEffect(() => { setScopeMenuOpen(false); }, [location.pathname]);

  // Heartbeat — keeps admin_sessions table fresh (only meaningful for platform admins).
  useEffect(() => {
    if (!user || !isPlatformAdmin) return;
    const touch = () => {
      void supabase.rpc('admin_session_touch', { p_user_agent: navigator.userAgent });
    };
    touch();
    const interval = window.setInterval(touch, 5 * 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') touch(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user, isPlatformAdmin]);

  const openPalette = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  };

  // Display name for the current scope chip.
  const scopeLabel =
    scope.type === 'platform' ? 'Super Admin'
    : scope.type === 'org'    ? (scope.membership?.org_name ?? 'Workspace')
    : 'Personal';
  const scopeRoleLabel =
    scope.type === 'platform' ? roleLabel(role)
    : scope.type === 'org'    ? (scope.role ?? '')
    : 'self';

  const activeMemberships = memberships.filter((m) => m.status === 'active');

  return (
    <div className="admin-layout">
      <ImpersonationBanner />

      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-area">
            <div className="logo-icon">
              <Shield size={22} />
            </div>
            <div className="logo-text">
              <span className="logo-title">Contour</span>
              <span className="logo-subtitle">
                {scope.type === 'platform' ? 'Super Admin'
                 : scope.type === 'org'    ? 'Workspace'
                 : 'Personal'}
              </span>
            </div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navSections.map(section => (
            <div className="nav-section" key={section.label}>
              <button
                className="nav-section-title"
                onClick={() => toggleSection(section.label)}
                aria-expanded={!collapsedSections.has(section.label)}
              >
                <span>{section.label}</span>
                <ChevronDown
                  size={14}
                  className={`section-chevron ${collapsedSections.has(section.label) ? 'collapsed' : ''}`}
                />
              </button>
              {!collapsedSections.has(section.label) && (
                <div className="nav-items">
                  {section.items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/dashboard'}
                      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <item.icon size={18} />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.email?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="user-details">
              <span className="user-email">{user?.email}</span>
              <span className="user-role">{scopeRoleLabel || 'No role'}</span>
            </div>
          </div>
          <button className="sign-out-btn" onClick={handleSignOut} title="Sign out" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <button
            type="button"
            className="topbar-cmd-hint"
            onClick={openPalette}
            title="Open command palette"
          >
            <Command size={12} />
            <span>Jump to…</span>
            <kbd>⌘K</kbd>
          </button>

          <div className="top-bar-right" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ThemeToggle />

          {/* ── Scope switcher ─────────────────────────────────
              Only render when the user actually has something to switch
              between: at least one org membership, OR they're a platform
              admin who also belongs to an org. A pure platform admin with
              no org memberships sees a static role badge instead. */}
          {(activeMemberships.length > 0 || (isPlatformAdmin && activeMemberships.length > 0)) ? (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setScopeMenuOpen((v) => !v)}
              className="role-badge"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', userSelect: 'none',
              }}
              aria-haspopup="menu"
              aria-expanded={scopeMenuOpen}
            >
              {scope.type === 'platform' ? <Shield size={14} />
                : scope.type === 'org'   ? <Building2 size={14} />
                : <UserIcon size={14} />}
              <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {scopeLabel}
              </span>
              <ChevronDown size={12} />
            </button>

            {scopeMenuOpen && (
              <>
                {/* click-outside catcher */}
                <div
                  onClick={() => setScopeMenuOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                />
                <div
                  role="menu"
                  style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    background: 'var(--bg-elevated, #14141c)',
                    border: '1px solid var(--border-subtle, #2a2a35)',
                    borderRadius: 8,
                    minWidth: 260,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                    zIndex: 11,
                    overflow: 'hidden',
                  }}
                >
                  {isPlatformAdmin && (
                    <ScopeMenuItem
                      label="Super Admin"
                      sub={role ?? 'platform'}
                      icon={<Shield size={14} />}
                      active={scope.type === 'platform'}
                      onClick={() => { 
                        switchToPlatform(); 
                        setScopeMenuOpen(false);
                        // Navigate to platform dashboard
                        if (location.pathname.startsWith('/org/')) {
                          navigate('/dashboard');
                        }
                      }}
                    />
                  )}

                  <ScopeMenuItem
                    label="Personal"
                    sub="Your individual account"
                    icon={<UserIcon size={14} />}
                    active={scope.type === 'personal'}
                    onClick={() => { 
                      switchToPersonal(); 
                      setScopeMenuOpen(false);
                      // Navigate to personal dashboard
                      if (location.pathname.startsWith('/org/')) {
                        navigate('/dashboard');
                      }
                    }}
                  />

                  {activeMemberships.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border-subtle, #2a2a35)', padding: '6px 0' }}>
                      <div style={{ padding: '6px 12px', fontSize: 10, letterSpacing: 1, color: 'var(--text-muted, #5a5a6e)' }}>
                        WORKSPACES
                      </div>
                      {activeMemberships.map((m) => (
                        <ScopeMenuItem
                          key={m.org_id}
                          label={m.org_name}
                          sub={m.role}
                          icon={<Building2 size={14} />}
                          active={scope.type === 'org' && scope.orgId === m.org_id}
                          onClick={() => { 
                            switchToOrg(m.org_id); 
                            setScopeMenuOpen(false);
                            // Navigate to org dashboard if not already on org route
                            if (!location.pathname.startsWith('/org/')) {
                              navigate('/org/dashboard');
                            }
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          ) : (
            // No-orgs fallback: show the role badge so the topbar isn't empty.
            <div className="role-badge">{role ?? 'no role'}</div>
          )}
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>

      {/* Global primitives */}
      <CommandPalette items={paletteItems} remoteSearch={paletteRemoteSearch} />
      <IdleTimeout />
      <ToastHost />
    </div>
  );
}

function ScopeMenuItem({
  label, sub, icon, active, onClick,
}: { label: string; sub: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '10px 12px',
        background: active ? 'var(--bg-hover, rgba(255,255,255,0.04))' : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        color: 'var(--text-primary, #e0e0e8)',
      }}
    >
      <span style={{ display: 'inline-flex', color: 'var(--text-muted, #8a8a96)' }}>{icon}</span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted, #8a8a96)', textTransform: 'capitalize' }}>{sub}</span>
      </span>
      {active && <Check size={14} style={{ color: 'var(--accent, #6366f1)' }} />}
    </button>
  );
}
