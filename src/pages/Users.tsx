import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Filter } from 'lucide-react';

const PAGE_SIZE = 20;

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  useEffect(() => { loadUsers(); }, [statusFilter, page]);

  async function loadUsers() {
    setLoading(true);
    let query = supabase.from('profiles')
      .select('id, username, display_name, bio, avatar_url, phone, is_public, is_complete, access_status, created_at', { count: 'exact' });

    if (statusFilter !== 'all') query = query.eq('access_status', statusFilter);

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    setUsers(data || []);
    setTotal(count || 0);

    // Fetch emails
    if (data && data.length > 0) {
      const { data: emailData } = await supabase.rpc('admin_get_user_emails', {
        user_ids: data.map((u: any) => u.id)
      });
      if (emailData) {
        const map: Record<string, string> = {};
        emailData.forEach((e: any) => { map[e.user_id] = e.email; });
        setEmails(map);
      }
    }
    setLoading(false);
  }

  const filtered = users.filter(u =>
    !search || [u.display_name, u.username, emails[u.id]].filter(Boolean).some(
      v => v.toLowerCase().includes(search.toLowerCase())
    )
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="page-header">
        <h1>All Users</h1>
        <p>{total} total users across the platform</p>
      </div>

      <div className="data-card">
        <div className="data-card-header">
          <div className="filter-bar">
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                className="input-field"
                placeholder="Search by name, username, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 280 }}
              />
            </div>
            <div className="flex-center gap-sm">
              <Filter size={14} style={{ color: 'var(--text-muted)' }} />
              <select className="select-field" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-state"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No users found</h3>
            <p>Try adjusting your search or filters</p>
          </div>
        ) : (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Profile</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(user => (
                    <tr key={user.id} className="clickable-row" onClick={() => navigate(`/users/${user.id}`)}>
                      <td>
                        <div className="user-cell">
                          <div className="user-cell-avatar">
                            {user.avatar_url ? <img src={user.avatar_url} alt="" /> : (user.display_name || user.username || '?')[0].toUpperCase()}
                          </div>
                          <div className="user-cell-info">
                            <span className="user-cell-name">{user.display_name || 'Unnamed'}</span>
                            <span className="user-cell-sub">@{user.username || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{emails[user.id] || '—'}</td>
                      <td><span className={`badge badge-${user.access_status}`}>{user.access_status}</span></td>
                      <td>
                        <div className="flex-center gap-sm">
                          {user.is_complete ? <span className="badge badge-success">Complete</span> : <span className="badge badge-warning">Incomplete</span>}
                          {user.is_public && <span className="badge badge-info">Public</span>}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  Page {page + 1} of {totalPages}
                </span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
