import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserCheck, UserX, Clock, ShoppingBag, HandHeart,
  MessageSquare, Zap, Activity, AlertTriangle, Flag, BarChart3
} from 'lucide-react';

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
    loadData();
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

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  const s = stats || {} as DashboardStats;

  const statCards = [
    { label: 'Total Users', value: s.total_users, icon: Users, color: 'purple', click: '/users' },
    { label: 'Pending Waitlist', value: s.pending_users, icon: Clock, color: 'amber', click: '/waitlist' },
    { label: 'Approved', value: s.approved_users, icon: UserCheck, color: 'green' },
    { label: 'Rejected', value: s.rejected_users, icon: UserX, color: 'red' },
    { label: 'Signups Today', value: s.signups_today, icon: Activity, color: 'blue' },
    { label: 'This Week', value: s.signups_this_week, icon: BarChart3, color: 'purple' },
    { label: 'Active Offers', value: s.active_offers, icon: ShoppingBag, color: 'green', click: '/offers' },
    { label: 'Active Wants', value: s.active_wants, icon: HandHeart, color: 'blue', click: '/wants' },
    { label: 'Messages', value: s.total_messages, icon: MessageSquare, color: 'purple', click: '/messages' },
    { label: 'Match Runs', value: s.total_match_runs, icon: Zap, color: 'amber', click: '/match-analytics' },
    { label: 'Flagged', value: s.flagged_listings, icon: Flag, color: 'red', click: '/reports' },
    { label: 'Errors', value: s.total_errors, icon: AlertTriangle, color: 'red', click: '/analytics' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Platform overview and key metrics</p>
      </div>

      <div className="stats-grid">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="stat-card"
            style={{ cursor: card.click ? 'pointer' : 'default' }}
            onClick={() => card.click && navigate(card.click)}
          >
            <div className="stat-card-header">
              <span className="stat-card-label">{card.label}</span>
              <div className={`stat-card-icon ${card.color}`}>
                <card.icon size={18} />
              </div>
            </div>
            <div className="stat-card-value">{card.value ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="two-col-grid">
        {/* Quick Stats */}
        <div className="data-card">
          <div className="data-card-header">
            <span className="data-card-title">Platform Metrics</span>
          </div>
          <div style={{ padding: '18px 22px' }}>
            <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="detail-item">
                <span className="detail-label">Complete Profiles</span>
                <span className="detail-value">{s.complete_profiles ?? 0}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Public Profiles</span>
                <span className="detail-value">{s.public_profiles ?? 0}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Total Contacts</span>
                <span className="detail-value">{s.total_contacts ?? 0}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Total Tasks</span>
                <span className="detail-value">{s.total_tasks ?? 0}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Total Meetings</span>
                <span className="detail-value">{s.total_meetings ?? 0}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Total Transactions</span>
                <span className="detail-value">{s.total_transactions ?? 0}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Total Events</span>
                <span className="detail-value">{s.total_events ?? 0}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Total Errors</span>
                <span className="detail-value">{s.total_errors ?? 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Users */}
        <div className="data-card">
          <div className="data-card-header">
            <span className="data-card-title">Recent Signups</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/users')}>View All</button>
          </div>
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
                {recentUsers.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No users yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
