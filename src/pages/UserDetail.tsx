import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  ArrowLeft, UserCheck, UserX, Mail, Phone, AlertTriangle, 
  Bell, Activity, ShieldOff, Download, Eye, EyeOff, Calendar, 
  Smartphone, User
} from 'lucide-react';

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [email, setEmail] = useState('');
  const [activeTab, setActiveTab] = useState('profile');
  const [tabData, setTabData] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [overview, setOverview] = useState<Record<string, any> | null>(null);

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

  const impStorageKey = id ? `imp:${id}` : '';
  const [impSessionId, setImp] = useState(
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
    let result: Record<string, any>[] = [];

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
    setProfile((p) => ({ ...p, access_status: status }));
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;
  if (!profile) return <div className="empty-state"><h3>User not found</h3><button className="btn btn-primary" onClick={() => navigate('/users')}><ArrowLeft size={14} /> Back</button></div>;

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
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/users')}>
          <ArrowLeft size={20} />
        </button>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 700,
          color: 'white',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            (profile.display_name || profile.username || '?')[0].toUpperCase()
          )}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, marginBottom: 4 }}>
            {profile.display_name || 'Unnamed User'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)' }}>@{profile.username || '—'}</span>
            <span className={`badge badge-${profile.access_status}`}>{profile.access_status}</span>
            {profile.is_complete && <span className="badge badge-success">Complete</span>}
            {profile.is_public && <span className="badge badge-info">Public</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          {isBanned ? (
            <button className="btn btn-ghost btn-sm" onClick={() => void unbanUser()}>
              <UserCheck size={14} /> Unban
            </button>
          ) : (
            <button className="btn btn-warning btn-sm" onClick={() => void banUser()}>
              <ShieldOff size={14} /> Ban
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => void exportUser()}>
            <Download size={14} /> Export
          </button>
          {impSessionId ? (
            <button className="btn btn-ghost btn-sm" onClick={() => void endImpersonation()}>
              <EyeOff size={14} /> End view-as
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => void startImpersonation()}>
              <Eye size={14} /> View as
            </button>
          )}
        </div>
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
            {profile.banned_reason ? ` — "${profile.banned_reason}"` : ''}
          </div>
        </div>
      )}

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'platform' ? (
        tabLoading ? <div className="loading-state"><div className="spinner" /></div>
          : !overview ? <div className="empty-state"><h3>No platform data</h3></div>
          : <PlatformPanel overview={overview as any} />
      ) : activeTab === 'profile' ? (
        <div className="data-card" style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 }}>
            <InfoCard icon={<User size={16} />} label="Display Name" value={profile.display_name || '—'} />
            <InfoCard icon={<User size={16} />} label="Username" value={`@${profile.username || '—'}`} />
            <InfoCard icon={<Mail size={16} />} label="Email" value={email || '—'} />
            <InfoCard icon={<Phone size={16} />} label="Phone" value={profile.phone || '—'} />
            <InfoCard icon={<Calendar size={16} />} label="Joined" value={new Date(profile.created_at).toLocaleDateString()} />
            <InfoCard icon={<Activity size={16} />} label="Last Updated" value={new Date(profile.updated_at || profile.created_at).toLocaleDateString()} />
          </div>
          {profile.bio && (
            <div style={{ marginTop: 24 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Bio</h4>
              <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 14, lineHeight: 1.7 }}>
                {profile.bio}
              </div>
            </div>
          )}
          <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>User ID</h4>
            <code style={{ fontSize: 12, fontFamily: 'monospace' }}>{profile.id}</code>
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
          <div className="data-card-header">
            <span className="data-card-title">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} ({tabData.length})</span>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {Object.keys(tabData[0]).filter(k => k !== 'id').map(k => (
                    <th key={k}>{k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabData.map((row, i) => (
                  <tr key={row.id || i}>
                    {Object.entries(row).filter(([k]) => k !== 'id').map(([k, v]) => (
                      <td key={k} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v === null || v === undefined ? '—'
                          : typeof v === 'boolean' ? (v ? <span className="badge badge-success">Yes</span> : <span className="badge badge-default">No</span>)
                          : k.includes('date') || k.includes('at') ? new Date(String(v)).toLocaleString()
                          : typeof v === 'object' ? <code style={{ fontSize: 11 }}>{JSON.stringify(v).slice(0, 50)}</code>
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

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: 'var(--text-muted)', fontSize: 12 }}>
        {icon}
        <span style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function PlatformPanel({ overview }: { overview: { tokens: any[]; sessions: any[]; pushes: any[]; errors: any[]; events: any[]; prefs?: any } }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Section icon={<Smartphone size={14} />} title={`Devices & push tokens (${overview.tokens?.length ?? 0})`}>
        {(overview.tokens?.length ?? 0) === 0 ? <Empty>No registered push tokens</Empty>
          : <Tbl head={['Platform', 'Device', 'App', 'First seen', 'Last used']}
              rows={(overview.tokens ?? []).map((t: any) => [
                t.platform,
                t.device_id ? <code style={{ fontSize: 11 }}>{t.device_id.slice(0, 14)}</code> : '—',
                t.app_version || '—',
                new Date(t.created_at).toLocaleString(),
                new Date(t.last_used).toLocaleString(),
              ])} />}
      </Section>

      <Section icon={<Activity size={14} />} title={`Recent sessions (${overview.sessions?.length ?? 0})`}>
        {(overview.sessions?.length ?? 0) === 0 ? <Empty>No sessions in last 30 days</Empty>
          : <Tbl head={['Session', 'Started', 'Last event', 'Events', 'App', 'Platform']}
              rows={(overview.sessions ?? []).map((s: any) => [
                <code style={{ fontSize: 11 }}>{s.session_id.slice(0, 8)}</code>,
                new Date(s.started_at).toLocaleString(),
                new Date(s.last_event_at).toLocaleString(),
                s.event_count, s.app_version || '—', s.platform || '—',
              ])} />}
      </Section>

      <Section icon={<Bell size={14} />} title={`Recent pushes (${overview.pushes?.length ?? 0})`}>
        {(overview.pushes?.length ?? 0) === 0 ? <Empty>No push history</Empty>
          : <Tbl head={['Campaign', 'Platform', 'Status', 'Sent', 'Delivered', 'Error']}
              rows={(overview.pushes ?? []).map((p: any) => [
                p.campaign_title || <code style={{ fontSize: 11 }}>{p.campaign_id.slice(0, 8)}</code>,
                p.platform, p.status,
                p.sent_at ? new Date(p.sent_at).toLocaleTimeString() : '—',
                p.delivered_at ? new Date(p.delivered_at).toLocaleTimeString() : '—',
                p.error ? <span style={{ color: '#ff5b6b' }}>{p.error.slice(0, 40)}</span> : '—',
              ])} />}
      </Section>

      <Section icon={<AlertTriangle size={14} />} title={`Recent errors (${overview.errors?.length ?? 0})`}>
        {(overview.errors?.length ?? 0) === 0 ? <Empty>No errors logged</Empty>
          : <Tbl head={['When', 'Error', 'App', 'Platform', 'Message']}
              rows={(overview.errors ?? []).map((e: any) => [
                new Date(e.created_at).toLocaleString(),
                <code style={{ fontSize: 11 }}>{e.error_name}</code>,
                e.app_version || '—', e.platform || '—',
                <span style={{ color: 'var(--text-muted)' }}>{(e.error_message || '').slice(0, 60)}</span>,
              ])} />}
      </Section>

      <Section icon={<Activity size={14} />} title={`Recent events (${overview.events?.length ?? 0})`}>
        {(overview.events?.length ?? 0) === 0 ? <Empty>No events</Empty>
          : <Tbl head={['When', 'Event', 'App', 'Metadata']}
              rows={(overview.events ?? []).map((e: any) => [
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
            Muted categories: {overview.prefs.category_mutes?.length ? overview.prefs.category_mutes.join(', ') : '—'}
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
