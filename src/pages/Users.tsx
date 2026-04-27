import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, Eye, Pencil, Ban, Trash2, X, UserPlus, AlertTriangle, Loader2 } from 'lucide-react';

const PAGE_SIZE = 20;

const DEFAULT_NEW_USER = { email: '', password: '', display_name: '', access_status: 'approved' };

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  // Modals
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<any>(null);
  const [banModal, setBanModal] = useState<any>(null);
  const [deleteModal, setDeleteModal] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Form state
  const [newUser, setNewUser] = useState({ ...DEFAULT_NEW_USER });
  const [editUser, setEditUser] = useState({ display_name: '', access_status: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('profiles')
      .select('id, username, display_name, bio, avatar_url, phone, is_public, is_complete, access_status, created_at', { count: 'exact' });

    if (statusFilter !== 'all') query = query.eq('access_status', statusFilter);

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    setUsers(data || []);
    setTotal(count || 0);

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
  }, [statusFilter, page]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filtered = users.filter(u =>
    !search || [u.display_name, u.username, emails[u.id]].filter(Boolean).some(
      v => v.toLowerCase().includes(search.toLowerCase())
    )
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ─── Actions ───────────────────────────────────────────────
  async function handleAddUser() {
    if (!newUser.email || !newUser.password) return;
    setSaving(true); setActionError('');
    const { error } = await supabase.rpc('admin_create_user', {
      user_email: newUser.email,
      user_password: newUser.password,
      user_display_name: newUser.display_name || null,
      user_access_status: newUser.access_status,
    });
    setSaving(false);
    if (error) { setActionError(error.message); return; }
    setAddModal(false);
    setNewUser({ ...DEFAULT_NEW_USER });
    loadUsers();
  }

  async function handleEditUser() {
    if (!editModal) return;
    setSaving(true); setActionError('');
    const { error } = await supabase.rpc('admin_update_user', {
      target_user_id: editModal.id,
      new_display_name: editUser.display_name || null,
      new_access_status: editUser.access_status || null,
      new_email: editUser.email !== emails[editModal.id] ? editUser.email : null,
    });
    setSaving(false);
    if (error) { setActionError(error.message); return; }
    setEditModal(null);
    loadUsers();
  }

  async function handleBanUser() {
    if (!banModal) return;
    setSaving(true); setActionError('');
    const { error } = await supabase.rpc('admin_ban_user', {
      target_user_id: banModal.id,
      ban_reason: 'Banned via admin panel',
    });
    setSaving(false);
    if (error) { setActionError(error.message); return; }
    setBanModal(null);
    loadUsers();
  }

  async function handleHardDelete() {
    if (!deleteModal || deleteConfirmText !== 'DELETE') return;
    setSaving(true); setActionError('');
    const { error } = await supabase.rpc('admin_hard_delete_user', {
      target_user_id: deleteModal.id,
    });
    setSaving(false);
    if (error) { setActionError(error.message); return; }
    setDeleteModal(null);
    setDeleteConfirmText('');
    loadUsers();
  }

  function openEdit(u: any) {
    setEditModal(u);
    setEditUser({ display_name: u.display_name || '', access_status: u.access_status || '', email: emails[u.id] || '' });
    setActionError('');
  }

  // ─── Status badge colour ────────────────────────────────────
  function statusClass(s: string) {
    return s === 'approved' ? 'badge-success' : s === 'pending' ? 'badge-warning' : s === 'banned' ? 'badge-danger' : 'badge-default';
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>All Users</h1>
            <p>{total} total users across the platform</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setAddModal(true); setActionError(''); }}>
            <UserPlus size={16} /> Add User
          </button>
        </div>
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
                <option value="banned">Banned</option>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(user => (
                    <tr key={user.id}>
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
                      <td><span className={`badge ${statusClass(user.access_status)}`}>{user.access_status}</span></td>
                      <td>
                        <div className="flex-center gap-sm">
                          {user.is_complete ? <span className="badge badge-success">Complete</span> : <span className="badge badge-warning">Incomplete</span>}
                          {user.is_public && <span className="badge badge-info">Public</span>}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="flex-center gap-sm" style={{ flexWrap: 'nowrap' }}>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title="View Profile"
                            onClick={() => navigate(`/users/${user.id}`)}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Edit User"
                            onClick={() => openEdit(user)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn btn-warning btn-icon btn-sm"
                            title="Ban User"
                            disabled={user.access_status === 'banned'}
                            onClick={() => { setBanModal(user); setActionError(''); }}
                          >
                            <Ban size={14} />
                          </button>
                          <button
                            className="btn btn-danger btn-icon btn-sm"
                            title="Permanently Delete"
                            onClick={() => { setDeleteModal(user); setDeleteConfirmText(''); setActionError(''); }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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

      {/* ── Add User Modal ─────────────────────────────── */}
      {addModal && (
        <div className="modal-overlay" onClick={() => setAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Plus size={18} /> Add New User</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setAddModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-md">
                <label className="form-label">Email Address *</label>
                <input className="input-field" type="email" placeholder="user@example.com" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-group mb-md">
                <label className="form-label">Password *</label>
                <input className="input-field" type="password" placeholder="Min 6 characters" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
              </div>
              <div className="form-group mb-md">
                <label className="form-label">Display Name</label>
                <input className="input-field" placeholder="Full name" value={newUser.display_name} onChange={e => setNewUser(p => ({ ...p, display_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Access Status</label>
                <select className="select-field" value={newUser.access_status} onChange={e => setNewUser(p => ({ ...p, access_status: e.target.value }))}>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              {actionError && <div className="auth-error" style={{ marginTop: 12 }}><AlertTriangle size={14} />{actionError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddUser} disabled={saving || !newUser.email || !newUser.password}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ─────────────────────────────── */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Pencil size={18} /> Edit User</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-md">
                <label className="form-label">Email Address</label>
                <input className="input-field" type="email" value={editUser.email} onChange={e => setEditUser(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-group mb-md">
                <label className="form-label">Display Name</label>
                <input className="input-field" value={editUser.display_name} onChange={e => setEditUser(p => ({ ...p, display_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Access Status</label>
                <select className="select-field" value={editUser.access_status} onChange={e => setEditUser(p => ({ ...p, access_status: e.target.value }))}>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                  <option value="banned">Banned</option>
                </select>
              </div>
              {actionError && <div className="auth-error" style={{ marginTop: 12 }}><AlertTriangle size={14} />{actionError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleEditUser} disabled={saving}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ban Confirmation ────────────────────────────── */}
      {banModal && (
        <div className="modal-overlay" onClick={() => setBanModal(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Ban size={18} /> Ban User</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setBanModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="confirm-dialog">
                <div className="confirm-icon warn"><Ban size={28} /></div>
                <p>Ban <strong>{banModal.display_name || banModal.username || 'this user'}</strong>?</p>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Their account will be suspended. This is reversible — you can unban them later via Edit.
                </p>
              </div>
              {actionError && <div className="auth-error" style={{ marginTop: 12 }}><AlertTriangle size={14} />{actionError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setBanModal(null)}>Cancel</button>
              <button className="btn btn-warning" onClick={handleBanUser} disabled={saving}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Banning...</> : 'Yes, Ban User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hard Delete Confirmation ─────────────────────── */}
      {deleteModal && (
        <div className="modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Trash2 size={18} /> Permanently Delete</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setDeleteModal(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="confirm-dialog">
                <div className="confirm-icon danger"><AlertTriangle size={28} /></div>
                <p><strong>This action cannot be undone.</strong></p>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                  All data for <strong>{deleteModal.display_name || deleteModal.username || 'this user'}</strong> will be permanently deleted from the database.
                </p>
                <div className="form-group" style={{ marginTop: 16 }}>
                  <label className="form-label" style={{ color: 'var(--danger)' }}>
                    Type <strong>DELETE</strong> to confirm
                  </label>
                  <input
                    className="input-field"
                    placeholder="DELETE"
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    style={{ borderColor: deleteConfirmText === 'DELETE' ? 'var(--danger)' : undefined }}
                  />
                </div>
              </div>
              {actionError && <div className="auth-error" style={{ marginTop: 12 }}><AlertTriangle size={14} />{actionError}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteModal(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={handleHardDelete}
                disabled={saving || deleteConfirmText !== 'DELETE'}
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Deleting...</> : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
