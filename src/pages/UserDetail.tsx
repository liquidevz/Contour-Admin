import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, UserCheck, UserX, Ban, Mail, Phone } from 'lucide-react';

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [activeTab, setActiveTab] = useState('profile');
  const [tabData, setTabData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);

  useEffect(() => { if (id) loadProfile(id); }, [id]);
  useEffect(() => { if (id) loadTabData(activeTab); }, [activeTab, id]);

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
  ];

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

      {activeTab === 'profile' ? (
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
