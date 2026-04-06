import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { UserCheck, UserX, CheckSquare, Search, Clock } from 'lucide-react';

export default function Waitlist() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => { loadPending(); }, []);

  async function loadPending() {
    setLoading(true);
    const { data } = await supabase.from('profiles')
      .select('id, username, display_name, bio, avatar_url, phone, is_public, is_complete, access_status, created_at')
      .eq('access_status', 'pending')
      .order('created_at', { ascending: true });
    setUsers(data || []);
    setLoading(false);
  }

  async function approveUser(userId: string) {
    setActionLoading(userId);
    await supabase.from('profiles').update({ access_status: 'approved' }).eq('id', userId);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('admin_audit_logs').insert({ admin_id: user.id, action: 'approve_user', entity: 'profiles', entity_id: userId });
    setUsers(prev => prev.filter(u => u.id !== userId));
    setActionLoading(null);
  }

  async function rejectUser(userId: string) {
    setActionLoading(userId);
    await supabase.from('profiles').update({ access_status: 'rejected' }).eq('id', userId);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('admin_audit_logs').insert({ admin_id: user.id, action: 'reject_user', entity: 'profiles', entity_id: userId });
    setUsers(prev => prev.filter(u => u.id !== userId));
    setActionLoading(null);
  }

  async function bulkApprove() {
    if (selected.size === 0) return;
    setActionLoading('bulk');
    const ids = Array.from(selected);
    await supabase.from('profiles').update({ access_status: 'approved' }).in('id', ids);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('admin_audit_logs').insert(ids.map(id => ({ admin_id: user.id, action: 'bulk_approve', entity: 'profiles', entity_id: id })));
    setUsers(prev => prev.filter(u => !selected.has(u.id)));
    setSelected(new Set());
    setActionLoading(null);
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(u => u.id)));
  };

  const filtered = users.filter(u =>
    !search || (u.display_name || u.username || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Waitlist</h1>
            <p>{users.length} pending {users.length === 1 ? 'user' : 'users'} awaiting approval</p>
          </div>
          {selected.size > 0 && (
            <button className="btn btn-success" onClick={bulkApprove} disabled={actionLoading === 'bulk'}>
              <CheckSquare size={16} />
              Approve Selected ({selected.size})
            </button>
          )}
        </div>
      </div>

      <div className="data-card">
        <div className="data-card-header">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              className="input-field"
              placeholder="Search pending users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 280 }}
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Clock size={24} /></div>
            <h3>No pending users</h3>
            <p>All waitlist requests have been processed</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <div className="checkbox-wrap">
                      <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                    </div>
                  </th>
                  <th>User</th>
                  <th>Bio</th>
                  <th>Profile</th>
                  <th>Applied</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className="checkbox-wrap">
                        <input type="checkbox" checked={selected.has(user.id)} onChange={() => toggleSelect(user.id)} />
                      </div>
                    </td>
                    <td>
                      <div className="user-cell clickable-row" onClick={() => navigate(`/users/${user.id}`)}>
                        <div className="user-cell-avatar">
                          {user.avatar_url ? <img src={user.avatar_url} alt="" /> : (user.display_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="user-cell-info">
                          <span className="user-cell-name">{user.display_name || 'Unnamed'}</span>
                          <span className="user-cell-sub">@{user.username || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="text-truncate" style={{ display: 'block' }}>
                        {user.bio || '—'}
                      </span>
                    </td>
                    <td>
                      <div className="flex-center gap-sm">
                        {user.is_complete ? (
                          <span className="badge badge-success">Complete</span>
                        ) : (
                          <span className="badge badge-warning">Incomplete</span>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="btn-group">
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => approveUser(user.id)}
                          disabled={actionLoading === user.id}
                        >
                          <UserCheck size={14} /> Approve
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => rejectUser(user.id)}
                          disabled={actionLoading === user.id}
                        >
                          <UserX size={14} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
