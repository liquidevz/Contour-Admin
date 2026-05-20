import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, UserCheck, UserX, Ban, Mail, Phone, Smartphone, AlertTriangle, Bell, Activity, ShieldOff, Download, Eye, EyeOff } from 'lucide-react';

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [activeTab, setActiveTab] = useState('profile');
  const [tabData, setTabData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [overview, setOverview] = useState<any>(null);

  useEffect(() => { if (id) loadProfile(id); }, [id]);
  useEffect(() => { if (id) loadTabData(activeTab); }, [activeTab, id]);
  useEffect(() => {
    if (activeTab !== 'platform' || !id) return;
    setTabLoading(true);
    void (async () => {
      const { data, error } = await supabase.rpc('admin_get_user_overview', { p_user_id: id });
      if (error) console.warn('[UserDetail] overview', error);
      setOverview(data);
      setTabLoading(false);
    })();
  }, [activeTab, id]);

  async function banUser() {
    if (!id) return;
    const reason = prompt('Reason for ban? (optional)') ?? null;
    if (!confirm('Ban this user? All push tokens will be revoked.')) return;
    const { error } = await supabase.rpc('admin_ban_user', { p_user_id: id, p_reason: reason });
    if (error) { alert(error.message); return; }
    await loadProfile(id);
  }
  async function unbanUser() {
    if (!id) return;
    if (!confirm('Unban this user?')) return;
    const { error } = await supabase.rpc('admin_unban_user', { p_user_id: id });
    if (error) { alert(error.message); return; }
    await loadProfile(id);
  }

  // Track an active "view-as" session id in localStorage so a refresh
  // doesn't lose the audit context — the badge + end-session button
  // stay visible until the admin explicitly ends it.
  const impStorageKey = id ? `imp:${id}` : '';
  const [impSessionId, setImp] = useState<string | null>(
    impStorageKey ? localStorage.getItem(impStorageKey) : null,
  );

  async function startImpersonation() {
    if (!id) return;
    const reason = prompt('Reason for view-as session? (recorded in audit log)') ?? null;
    const { data, error } = await supabase.rpc('admin_start_impersonation', {
      p_target_user_id: id, p_reason: reason,
    });
    if (error) { alert(error.message); return; }
    if (data && typeof data === 'string') {
      localStorage.setItem(impStorageKey, data);
      setImp(data);
    }
  }
  async function endImpersonation() {
    if (!impSessionId) return;
    const { error } = await supabase.rpc('admin_end_impersonation', { p_id: impSessionId });
    if (error) { alert(error.message); return; }
    localStorage.removeItem(impStorageKey);
    setImp(null);
  }

  async function exportUser() {
    if (!id) return;
    const { data, error } = await supabase.rpc('admin_export_user', { p_user_id: id });
    if (error) { alert(error.message); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-export-${id}-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function loadProfile(userId: string) {
    setLoading(true);
    const { data } = await supabase.from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);

    const { data: emailData } = await supabase.rpc('admin_get_user_emails', { user_ids: [userId] });
    if (emailData?.[0]) setEmail(emailData[0].email);
    setLoading(false);
  }

  async function loadTabData(tab: string) {
    if (!id) return;
    setTabLoading(true);
    let result: any[] = [];

    switch (tab) {
      case 'contacts': {
        const { data } = await supabase.from('contacts')
          .select('id, name, phone, email, company_name, designation, is_favourite, tags, created_at')
          .eq('user_id', id).order('created_at', { ascending: false });
        result = data || [];
        break;
      }
      case 'tasks': {
        const { data } = await supabase.from('tasks')
          .select('id, title, description, priority, status, due_date, created_at, completed_at')
          .eq('user_id', id).order('created_at', { ascending: false });
        result = data || [];
        break;
      }
      case 'meetings': {
        const { data } = await supabase.from('meetings')
          .select('id, title, meeting_type, status, scheduled_start, scheduled_end, location, notes, created_at')
          .eq('user_id', id).order('created_at', { ascending: false });
        result = data || [];
        break;
      }
      case 'transactions': {
        const { data } = await supabase.from('transactions')
          .select('id, amount, currency, category, status, transaction_date, reference_id, notes, created_at')
          .eq('user_id', id).order('created_at', { ascending: false });
        result = data || [];
        break;
      }
      case 'offers': {
        const { data } = await supabase.from('user_offers')
          .select('id, title, description, category, is_active, created_at')
          .eq('user_id', id).order('created_at', { ascending: false });
        result = data || [];
        break;
      }
      case 'wants': {
        const { data } = await supabase.from('user_wants')
          .select('id, title, description, category, is_active, created_at')
          .eq('user_id', id).order('created_at', { ascending: false });
        result = data || [];
        break;
      }
      case 'activity': {
        const { data } = await supabase.from('user_events')
          .select('id, event_name, metadata, app_version, platform, created_at')
          .eq('user_id', id).order('created_at', { ascending: false }).limit(50);
        result = data || [];
        break;
      }
    }
    setTabData(result);
    setTabLoading(false);
  }

  async function updateStatus(status: string) {
    if (!id) return;
    await supabase.from('profiles').update({ access_status: status }).eq('id', id);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('admin_audit_logs').insert({
      admin_id: user.id, action: status === 'approved' ? 'approve_user' : status === 'rejected' ? 'reject_user' : 'revoke_access',
      entity: 'profiles', entity_id: id,
    });
    setProfile((p: any) => ({ ...p, access_status: status }));
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;
  if (!profile) return <div className="empty-state"><h3>User not found</h3></div>;

  const tabs = [
    { key: 'profile', label: 'Profile' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'meetings', label: 'Meetings' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'offers', label: 'Offers' },
    { key: 'wants', label: 'Wants' },
    { key: 'activity', label: 'Activity' },
    { key: 'platform', label: 'Platform' },
  ];

  const isBanned = !!profile.banned_at;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div className="flex-center gap-md">
            <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1>{profile.display_name || profile.username || 'Unnamed User'}</h1>
              <p style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>@{profile.username || '—'}</span>
                <span className={`badge badge-${profile.access_status}`}>{profile.access_status}</span>
              </p>
            </div>
          </div>
          <div className="btn-group">
            {profile.access_status !== 'approved' && (
              <button className="btn btn-success btn-sm" onClick={() => updateStatus('approved')}>
                <UserCheck size={14} /> Approve
              </button>
            )}
            {profile.access_status !== 'rejected' && (
              <button className="btn btn-danger btn-sm" onClick={() => updateStatus('rejected')}>
                <UserX size={14} /> Reject
              </button>
            )}
            {profile.access_status === 'approved' && (
              <button className="btn btn-danger btn-sm" onClick={() => updateStatus('rejected')}>
                <Ban size={14} /> Revoke
              </button>
            )}
            {isBanned ? (
              <button className="btn btn-ghost btn-sm" onClick={() => void unbanUser()} title="Unban + restore">
                <UserCheck size={14} /> Unban
              </button>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={() => void banUser()}
                title="Ban this user — revokes all push tokens">
                <ShieldOff size={14} /> Ban
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => void exportUser()}
              title="Download all data we hold about this user as JSON">
              <Download size={14} /> Export
            </button>
            {impSessionId
              ? <button className="btn btn-ghost btn-sm" onClick={() => void endImpersonation()}
                  title="End the audited view-as session">
                  <EyeOff size={14} /> End view-as
                </button>
              : <button className="btn btn-ghost btn-sm" onClick={() => void startImpersonation()}
                  title="Start an audited view-as session for support work">
                  <Eye size={14} /> View as
                </button>}
          </div>
        </div>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {impSessionId && (
        <div style={{
          padding: 12, borderRadius: 6, marginBottom: 16,
          background: 'rgba(124,58,237,0.08)',
          border: '1px solid rgba(124,58,237,0.45)',
          color: '#7C3AED', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Eye size={14} />
          <strong>View-as session active.</strong> Every page load is audited until you end it.
        </div>
      )}

      {isBanned && (
        <div style={{
          padding: 12, borderRadius: 6, marginBottom: 16,
          background: 'rgba(255,91,107,0.08)',
          border: '1px solid rgba(255,91,107,0.4)',
          color: '#ff5b6b', fontSize: 13,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <ShieldOff size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <strong>Banned</strong> on {new Date(profile.banned_at).toLocaleString()}
            {profile.banned_reason ? ` — “${profile.banned_reason}”` : ''}
          </div>
        </div>
      )}

      {activeTab === 'platform' ? (
        tabLoading ? <div className="loading-state"><div className="spinner" /></div>
          : !overview ? <div className="empty-state"><h3>No platform data</h3></div>
          : <PlatformPanel overview={overview} />
      ) : activeTab === 'profile' ? (
        <div className="data-card" style={{ padding: 24 }}>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-label">Display Name</span>
              <span className="detail-value">{profile.display_name || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Username</span>
              <span className="detail-value">@{profile.username || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label flex-center"><Mail size={12} /> Email</span>
              <span className="detail-value">{email || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label flex-center"><Phone size={12} /> Phone</span>
              <span className="detail-value">{profile.phone || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Bio</span>
              <span className="detail-value">{profile.bio || '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Access Status</span>
              <span className={`badge badge-${profile.access_status}`}>{profile.access_status}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Profile Complete</span>
              <span className="detail-value">{profile.is_complete ? 'Yes' : 'No'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Public</span>
              <span className="detail-value">{profile.is_public ? 'Yes' : 'No'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Joined</span>
              <span className="detail-value">{new Date(profile.created_at).toLocaleString()}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">User ID</span>
              <span className="detail-value mono">{profile.id}</span>
            </div>
          </div>
        </div>
      ) : tabLoading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : tabData.length === 0 ? (
        <div className="data-card">
          <div className="empty-state">
            <h3>No {activeTab}</h3>
            <p>This user hasn't created any {activeTab} yet</p>
          </div>
        </div>
      ) : (
        <div className="data-card">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {Object.keys(tabData[0]).filter(k => k !== 'id').map(k => (
                    <th key={k}>{k.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabData.map((row, i) => (
                  <tr key={row.id || i}>
                    {Object.entries(row).filter(([k]) => k !== 'id').map(([k, v]) => (
                      <td key={k} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v === null || v === undefined ? '—'
                          : typeof v === 'boolean' ? (v ? 'Yes' : 'No')
                          : typeof v === 'object' ? JSON.stringify(v)
                          : String(v).length > 50 ? String(v).slice(0, 50) + '…'
                          : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Platform tab ────────────────────────────────────────────

interface Overview {
  tokens:   Array<{ token: string; platform: string; device_id: string | null; app_version: string | null; created_at: string; last_used: string }>;
  sessions: Array<{ session_id: string; started_at: string; last_event_at: string; event_count: number; app_version: string | null; platform: string | null }>;
  events:   Array<{ id: string; event_name: string; metadata: Record<string, unknown>; app_version: string | null; platform: string | null; created_at: string }>;
  errors:   Array<{ id: string; error_name: string; error_message: string | null; app_version: string | null; platform: string | null; created_at: string }>;
  pushes:   Array<{ id: string; campaign_id: string; campaign_title: string | null; platform: string; status: string; error: string | null; queued_at: string; sent_at: string | null; delivered_at: string | null; opened_at: string | null }>;
  prefs:    { push_enabled: boolean; category_mutes: string[]; quiet_hours_start: number | null; quiet_hours_end: number | null } | null;
}

function PlatformPanel({ overview }: { overview: Overview }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Section icon={<Smartphone size={14} />} title={`Devices & push tokens (${overview.tokens.length})`}>
        {overview.tokens.length === 0 ? <Empty>No registered push tokens</Empty>
          : <Tbl head={['Platform', 'Device', 'App', 'First seen', 'Last used']}
              rows={overview.tokens.map(t => [
                t.platform,
                t.device_id ? <code style={{ fontSize: 11 }}>{t.device_id.slice(0, 14)}</code> : '—',
                t.app_version || '—',
                new Date(t.created_at).toLocaleString(),
                new Date(t.last_used).toLocaleString(),
              ])} />}
      </Section>

      <Section icon={<Activity size={14} />} title={`Recent sessions (${overview.sessions.length})`}>
        {overview.sessions.length === 0 ? <Empty>No sessions in last 30 days</Empty>
          : <Tbl head={['Session', 'Started', 'Last event', 'Events', 'App', 'Platform']}
              rows={overview.sessions.map(s => [
                <code style={{ fontSize: 11 }}>{s.session_id.slice(0, 8)}</code>,
                new Date(s.started_at).toLocaleString(),
                new Date(s.last_event_at).toLocaleString(),
                s.event_count, s.app_version || '—', s.platform || '—',
              ])} />}
      </Section>

      <Section icon={<Bell size={14} />} title={`Recent pushes (${overview.pushes.length})`}>
        {overview.pushes.length === 0 ? <Empty>No push history</Empty>
          : <Tbl head={['Campaign', 'Platform', 'Status', 'Sent', 'Delivered', 'Error']}
              rows={overview.pushes.map(p => [
                p.campaign_title || <code style={{ fontSize: 11 }}>{p.campaign_id.slice(0, 8)}</code>,
                p.platform, p.status,
                p.sent_at ? new Date(p.sent_at).toLocaleTimeString() : '—',
                p.delivered_at ? new Date(p.delivered_at).toLocaleTimeString() : '—',
                p.error ? <span style={{ color: '#ff5b6b' }}>{p.error.slice(0, 40)}</span> : '—',
              ])} />}
      </Section>

      <Section icon={<AlertTriangle size={14} />} title={`Recent errors (${overview.errors.length})`}>
        {overview.errors.length === 0 ? <Empty>No errors logged</Empty>
          : <Tbl head={['When', 'Error', 'App', 'Platform', 'Message']}
              rows={overview.errors.map(e => [
                new Date(e.created_at).toLocaleString(),
                <code style={{ fontSize: 11 }}>{e.error_name}</code>,
                e.app_version || '—', e.platform || '—',
                <span style={{ color: 'var(--text-muted)' }}>{(e.error_message || '').slice(0, 60)}</span>,
              ])} />}
      </Section>

      <Section icon={<Activity size={14} />} title={`Recent events (${overview.events.length})`}>
        {overview.events.length === 0 ? <Empty>No events</Empty>
          : <Tbl head={['When', 'Event', 'App', 'Metadata']}
              rows={overview.events.map(e => [
                new Date(e.created_at).toLocaleString(),
                <code style={{ fontSize: 11 }}>{e.event_name}</code>,
                e.app_version || '—',
                <code style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {Object.keys(e.metadata || {}).length === 0 ? '—' : JSON.stringify(e.metadata).slice(0, 60)}
                </code>,
              ])} />}
      </Section>

      {overview.prefs && (
        <Section icon={<Bell size={14} />} title="Notification preferences">
          <div style={{ padding: 12, fontSize: 13 }}>
            Push enabled: <strong>{overview.prefs.push_enabled ? 'yes' : 'no'}</strong>
            {' · '}
            Muted categories: {overview.prefs.category_mutes.length ? overview.prefs.category_mutes.join(', ') : '—'}
            {overview.prefs.quiet_hours_start != null && overview.prefs.quiet_hours_end != null && (
              <> {' · '} Quiet hours: {overview.prefs.quiet_hours_start}:00–{overview.prefs.quiet_hours_end}:00</>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="data-card">
      <div className="data-card-header">
        <span className="data-card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {icon} {title}
        </span>
      </div>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty-state" style={{ padding: 24 }}><p>{children}</p></div>;
}
function Tbl({ head, rows }: { head: React.ReactNode[]; rows: React.ReactNode[][] }) {
  return (
    <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
      <table className="data-table">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} style={{ fontSize: 12 }}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
