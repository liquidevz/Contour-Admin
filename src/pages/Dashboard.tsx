/**
 * Dashboard — first impression for every admin.
 *
 * Layout:
 *  1. Narrative subtitle  — tells the admin what they're looking at.
 *  2. Live signals row    — realtime event / error / push pulse.
 *  3. Hero metrics        — clickable click-throughs to detail pages.
 *  4. Two-column footer   — Platform metrics + Recent signups.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  Users as UsersIcon, UserCheck, UserX, Clock, ShoppingBag, HandHeart,
  MessageSquare, Zap, Activity, AlertTriangle, Flag, BarChart3,
  LayoutDashboard, ArrowRight,
} from 'lucide-react';
import Page from '../components/ui/Page';
import MetricCard from '../components/ui/MetricCard';
import EmptyState from '../components/ui/EmptyState';
import Help from '../components/ui/Help';

interface DashboardStats {
  total_users: number;
  pending_users: number;
  approved_users: number;
  rejected_users: number;
  signups_today: number;
  signups_this_week: number;
  complete_profiles: number;
  public_profiles: number;
  total_contacts: number;
  total_tasks: number;
  total_meetings: number;
  total_transactions: number;
  active_offers: number;
  active_wants: number;
  total_messages: number;
  total_match_runs: number;
  total_events: number;
  total_errors: number;
  flagged_listings: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      const [statsRes, usersRes] = await Promise.all([
        supabase.rpc('admin_get_dashboard_stats'),
        supabase.from('profiles')
          .select('id, username, display_name, avatar_url, access_status, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      if (statsRes.data) setStats(statsRes.data);
      if (usersRes.data) setRecentUsers(usersRes.data);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const s = stats || {} as DashboardStats;

  return (
    <Page
      title="Dashboard"
      subtitle="A live overview of who's signing up, what's being offered, and how the platform is performing. Click any tile to drill in."
      icon={<LayoutDashboard size={20} />}
    >
      <LiveSignals />

      <section>
        <SectionHeading
          title="At a glance"
          hint="Top-line counts across the platform. Each tile is a shortcut into the detail page."
        />
        <div className="metrics-row">
          <MetricCard label="Total Users"        value={s.total_users}        icon={UsersIcon}    to="/users"            loading={loading} />
          <MetricCard label="Pending Waitlist"   value={s.pending_users}      icon={Clock}        to="/waitlist"         tone="warning" loading={loading}
                       help="People who signed up but haven't been approved yet." />
          <MetricCard label="Approved"           value={s.approved_users}     icon={UserCheck}    tone="success"  loading={loading} />
          <MetricCard label="Rejected"           value={s.rejected_users}     icon={UserX}        tone="danger"   loading={loading} />
          <MetricCard label="Signups Today"      value={s.signups_today}      icon={Activity}     tone="info"     loading={loading} />
          <MetricCard label="Signups This Week"  value={s.signups_this_week}  icon={BarChart3}    loading={loading} />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Marketplace activity"
          hint="What users are listing and how they're talking to each other."
        />
        <div className="metrics-row">
          <MetricCard label="Active Offers" value={s.active_offers} icon={ShoppingBag}  to="/offers"         tone="success" loading={loading} />
          <MetricCard label="Active Wants"  value={s.active_wants}  icon={HandHeart}    to="/wants"          tone="info"    loading={loading} />
          <MetricCard label="Messages"      value={s.total_messages} icon={MessageSquare} to="/messages"     loading={loading} />
          <MetricCard label="Match Runs"    value={s.total_match_runs} icon={Zap}       to="/match-analytics" tone="warning" loading={loading}
                       help="Every time the matching engine produced results for a user." />
          <MetricCard label="Flagged"       value={s.flagged_listings} icon={Flag}     to="/reports"        tone="danger"  loading={loading} />
          <MetricCard label="Errors"        value={s.total_errors}    icon={AlertTriangle} to="/errors"     tone="danger"  loading={loading} />
        </div>
      </section>

      <div className="two-col-grid">
        <div className="data-card">
          <div className="data-card-header">
            <span className="data-card-title">
              Platform Metrics <Help text="Aggregate counts across the whole platform — historical totals, not just today." />
            </span>
          </div>
          <div style={{ padding: '18px 22px' }}>
            <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Detail label="Complete profiles"   value={s.complete_profiles} />
              <Detail label="Public profiles"     value={s.public_profiles} />
              <Detail label="Total contacts"      value={s.total_contacts} />
              <Detail label="Total tasks"         value={s.total_tasks} />
              <Detail label="Total meetings"      value={s.total_meetings} />
              <Detail label="Total transactions"  value={s.total_transactions} />
              <Detail label="Total events"        value={s.total_events} />
              <Detail label="Total errors"        value={s.total_errors} />
            </div>
          </div>
        </div>

        <div className="data-card">
          <div className="data-card-header">
            <span className="data-card-title">Recent signups</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/users')}>
              View all <ArrowRight size={12} />
            </button>
          </div>
          {recentUsers.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="No users yet"
              body="Once people sign up, they'll appear here. Until then, you can pre-approve specific email domains in Settings."
              size="sm"
            />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Status</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map(user => (
                    <tr key={user.id} className="clickable-row" onClick={() => navigate(`/users/${user.id}`)}>
                      <td>
                        <div className="user-cell">
                          <div className="user-cell-avatar">
                            {user.avatar_url ? (
                              <img src={user.avatar_url} alt="" />
                            ) : (
                              (user.display_name || user.username || '?')[0].toUpperCase()
                            )}
                          </div>
                          <div className="user-cell-info">
                            <span className="user-cell-name">{user.display_name || user.username || 'Unnamed'}</span>
                            <span className="user-cell-sub">@{user.username || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${user.access_status}`}>
                          {user.access_status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}


function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
        {title}
      </h2>
      {hint && <Help text={hint} />}
    </div>
  );
}


function Detail({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div className="detail-item">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value ?? 0}</span>
    </div>
  );
}


// ─── Live signals — realtime event / error / push pulse ──
interface SignalState {
  count:  number;
  recent: number[];
  lastAt: string | null;
}
function emptySignal(): SignalState { return { count: 0, recent: [], lastAt: null }; }

function LiveSignals() {
  const [events,    setEvents]    = useState<SignalState>(emptySignal);
  const [errors,    setErrors]    = useState<SignalState>(emptySignal);
  const [pushes,    setPushes]    = useState<SignalState>(emptySignal);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const handle = (
      setter: React.Dispatch<React.SetStateAction<SignalState>>,
    ) => (payload: { new: { created_at?: string; queued_at?: string } }) => {
      const ts = payload.new?.created_at ?? payload.new?.queued_at ?? new Date().toISOString();
      const tMs = new Date(ts).getTime();
      setter(prev => {
        const cutoff = Date.now() - 5 * 60_000;
        return {
          count: prev.count + 1,
          recent: [...prev.recent, tMs].filter(t => t >= cutoff),
          lastAt: ts,
        };
      });
    };

    const channel = supabase
      .channel('dashboard-live')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_events' },     handle(setEvents))
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_error_logs' }, handle(setErrors))
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_deliveries' }, handle(setPushes))
      .subscribe(status => setConnected(status === 'SUBSCRIBED'));

    const t = window.setInterval(() => {
      const cutoff = Date.now() - 5 * 60_000;
      setEvents(p => ({ ...p, recent: p.recent.filter(x => x >= cutoff) }));
      setErrors(p => ({ ...p, recent: p.recent.filter(x => x >= cutoff) }));
      setPushes(p => ({ ...p, recent: p.recent.filter(x => x >= cutoff) }));
    }, 10_000);

    return () => { void supabase.removeChannel(channel); window.clearInterval(t); };
  }, []);

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
          Live signals
        </h2>
        <Help text="Real-time counts of activity since you opened this dashboard. The dot is green when the realtime channel is connected." />
      </div>
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}>
        <SignalCard label="Events (live)"   state={events} color="#7C3AED" connected={connected} icon={<Activity size={14} />} />
        <SignalCard label="Errors (live)"   state={errors} color="#ff5b6b" connected={connected} icon={<AlertTriangle size={14} />} />
        <SignalCard label="Push deliveries" state={pushes} color="#14B8A6" connected={connected} icon={<Zap size={14} />} />
      </div>
    </section>
  );
}


function SignalCard({
  label, state, color, connected, icon,
}: {
  label: string; state: SignalState; color: string; connected: boolean; icon: React.ReactNode;
}) {
  const ratePerMin = state.recent.length / 5;
  return (
    <div className="data-card" style={{ padding: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        color: 'var(--text-muted)', fontSize: 11,
        textTransform: 'uppercase', letterSpacing: 0.5,
        marginBottom: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: connected ? color : '#5a5a6e',
          boxShadow: connected ? `0 0 0 3px ${color}33` : 'none',
        }} />
        {icon}
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>
          {state.count}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {ratePerMin.toFixed(1)}/min (5m)
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        {state.lastAt ? `last: ${new Date(state.lastAt).toLocaleTimeString()}` : 'waiting…'}
      </div>
    </div>
  );
}
