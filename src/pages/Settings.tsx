import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Settings as SettingsIcon, Shield, Trash2, Plus, X } from 'lucide-react';

export default function SettingsPage() {
  const { role } = useAuth();
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState('admin');

  useEffect(() => { if (role === 'superadmin') loadRoles(); else setLoading(false); }, [role]);

  async function loadRoles() {
    const { data } = await supabase.from('user_roles').select('*');
    setRoles(data || []);
    setLoading(false);
  }

  async function addRole() {
    if (!newUserId.trim()) return;
    await supabase.from('user_roles').upsert({ user_id: newUserId.trim(), role: newRole });
    setShowAdd(false);
    setNewUserId('');
    loadRoles();
  }

  async function removeRole(userId: string) {
    if (!confirm('Remove this role assignment?')) return;
    await supabase.from('user_roles').delete().eq('user_id', userId);
    setRoles(prev => prev.filter(r => r.user_id !== userId));
  }

  async function updateRole(userId: string, newR: string) {
    await supabase.from('user_roles').update({ role: newR }).eq('user_id', userId);
    setRoles(prev => prev.map(r => r.user_id === userId ? { ...r, role: newR } : r));
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  if (role !== 'superadmin') {
    return (
      <div>
        <div className="page-header">
          <h1>Settings</h1>
        </div>
        <div className="data-card">
          <div className="empty-state">
            <div className="empty-state-icon"><Shield size={24} /></div>
            <h3>Superadmin Required</h3>
            <p>Only superadmins can manage roles</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Settings</h1>
            <p>Manage admin roles and system configuration</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add Role
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Admin Role</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-md">
                <label className="form-label">User ID (UUID)</label>
                <input className="input-field mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={newUserId} onChange={e => setNewUserId(e.target.value)} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="select-field" value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                  <option value="moderator">Moderator</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addRole}>Assign</button>
            </div>
          </div>
        </div>
      )}

      <div className="data-card">
        <div className="data-card-header">
          <span className="data-card-title"><SettingsIcon size={16} /> Role Assignments</span>
          <span className="data-card-count">{roles.length}</span>
        </div>
        {roles.length === 0 ? (
          <div className="empty-state">
            <h3>No roles assigned</h3>
            <p>Add user roles to grant admin access</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map(r => (
                  <tr key={r.user_id}>
                    <td className="mono" style={{ fontSize: '0.8rem' }}>{r.user_id}</td>
                    <td>
                      <select
                        className="select-field"
                        value={r.role}
                        onChange={e => updateRole(r.user_id, e.target.value)}
                        style={{ width: 'auto', padding: '5px 30px 5px 10px' }}
                      >
                        <option value="admin">Admin</option>
                        <option value="superadmin">Superadmin</option>
                        <option value="moderator">Moderator</option>
                      </select>
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => removeRole(r.user_id)}>
                        <Trash2 size={14} /> Remove
                      </button>
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
