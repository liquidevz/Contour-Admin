import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  LayoutDashboard, Users, UserCheck, ShoppingBag, HandHeart,
  Flag, MessageSquare, Zap, ToggleLeft, Tag, Layers, BarChart3,
  ScrollText, Settings, LogOut, Menu, X, ChevronDown, Shield,
  Activity, GitBranch, CloudDownload, Bell, Sliders,
  AlertTriangle, Terminal, UsersRound, Inbox, Gauge, Cog, KeyRound,
  SlidersHorizontal, Command,
} from 'lucide-react';
import CommandPalette, { useNavCommands } from '../components/ui/CommandPalette';
import IdleTimeout from '../components/ui/IdleTimeout';
import ImpersonationBanner from '../components/ui/ImpersonationBanner';
import ToastHost from '../components/ui/Toast';

const navSections = [
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

export default function AdminLayout() {
  const { user, role, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const location = useLocation();

  const navCommands = useNavCommands(
    navSections.map(s => ({ section: s.label, items: s.items }))
  );
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

  // Heartbeat — keeps admin_sessions table fresh.
  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  // Open the command palette via the topbar pill — synthesize Ctrl+K
  const openPalette = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  };

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
              <span className="logo-subtitle">Admin Panel</span>
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
              <span className="user-role">{role || 'No role'}</span>
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
          <div className="top-bar-right">
            <div className="role-badge">{role}</div>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>

      {/* Global primitives */}
      <CommandPalette items={paletteItems} />
      <IdleTimeout />
      <ToastHost />
    </div>
  );
}
