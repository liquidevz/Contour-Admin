import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Shield, Settings as SettingsIcon, Trash2, Plus, X, ChevronDown, ChevronUp, Search, Loader2, Save, Globe, Mail, Image } from 'lucide-react';

// ─── Permission definitions covering ALL admin panel features ───────────────
export const ALL_PERMISSIONS: { key: string; label: string; category: string }[] = [
  // Users
  { key: 'view_users',        label: 'View Users',           category: 'Users' },
  { key: 'edit_users',        label: 'Edit Users',           category: 'Users' },
  { key: 'ban_users',         label: 'Ban Users',            category: 'Users' },
  { key: 'delete_users',      label: 'Delete Users',         category: 'Users' },
  // Waitlist
  { key: 'view_waitlist',     label: 'View Waitlist',        category: 'Waitlist' },
  { key: 'manage_waitlist',   label: 'Approve / Reject',     category: 'Waitlist' },
  // Marketplace
  { key: 'view_listings',     label: 'View Offers & Wants',  category: 'Marketplace' },
  { key: 'edit_listings',     label: 'Edit Listings',        category: 'Marketplace' },
  { key: 'delete_listings',   label: 'Delete Listings',      category: 'Marketplace' },
  // Reports
  { key: 'view_reports',      label: 'View Reports',         category: 'Reports' },
  { key: 'resolve_reports',   label: 'Resolve Reports',      category: 'Reports' },
  // Messages
  { key: 'view_messages',     label: 'View Messages',        category: 'Messages' },
  { key: 'delete_messages',   label: 'Delete Messages',      category: 'Messages' },
  // Analytics & Intelligence
  { key: 'view_analytics',    label: 'View Analytics',       category: 'Analytics' },
  { key: 'view_match_engine', label: 'View Match Engine',    category: 'Analytics' },
  { key: 'view_audit_log',    label: 'View Audit Log',       category: 'Analytics' },
  // Feature Flags
  { key: 'view_flags',        label: 'View Feature Flags',   category: 'Feature Flags' },
  { key: 'manage_flags',      label: 'Manage Feature Flags', category: 'Feature Flags' },
  // Catalog
  { key: 'view_categories',   label: 'View Categories',      category: 'Catalog' },
  { key: 'manage_categories', label: 'Manage Categories',    category: 'Catalog' },
  { key: 'view_tags',         label: 'View Tags',            category: 'Catalog' },
  { key: 'manage_tags',       label: 'Manage Tags',          category: 'Catalog' },
  { key: 'view_ontology',     label: 'View Ontology',        category: 'Catalog' },
  { key: 'manage_ontology',   label: 'Manage Ontology',      category: 'Catalog' },
  // System
  { key: 'manage_admins',     label: 'Manage Admins',        category: 'System' },
  { key: 'manage_settings',   label: 'Manage Settings',      category: 'System' },
];

// Role presets
const ROLE_PRESETS: Record<string, string[]> = {
  superadmin: ALL_PERMISSIONS.map(p => p.key),
  admin: ALL_PERMISSIONS.filter(p => p.key !== 'delete_users' && p.key !== 'manage_admins' && p.key !== 'manage_settings').map(p => p.key),
  analyst: ['view_users', 'view_waitlist', 'view_listings', 'view_reports', 'view_analytics', 'view_match_engine', 'view_audit_log', 'view_flags', 'view_categories', 'view_tags', 'view_ontology'],
};

const ROLE_COLORS: Record<string, string> = {
  superadmin: '#a78bfa',
  admin: '#60a5fa',
  analyst: '#34d399',
};

// Group permissions by category
const PERM_CATEGORIES = Array.from(new Set(ALL_PERMISSIONS.map(p => p.category)));

export default function SettingsPage() {
  const { role } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'admins'>('general');

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage general configuration and admin access</p>
      </div>

      <div className="tabs-bar" style={{ marginBottom: 24 }}>
        <button className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
          <SettingsIcon size={14} /> General
        </button>
        {(role === 'superadmin' || role === 'admin') && (
          <button className={`tab-btn ${activeTab === 'admins' ? 'active' : ''}`} onClick={() => setActiveTab('admins')}>
            <Shield size={14} /> Admin Management
          </button>
        )}
      </div>

      {activeTab === 'general' && <GeneralSettings />}
      {activeTab === 'admins' && <AdminManagement />}
    </div>
  );
}

// ─── General Settings Tab ───────────────────────────────────────────────────
function GeneralSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    const { data } = await supabase.from('app_settings').select('*').order('key');
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((s: any) => { map[s.key] = s.value ?? ''; });
      setSettings(map);
      setOriginal(map);
      setMeta(data);
    }
    setLoading(false);
  }

  async function saveSettings() {
    setSaving(true);
    const updates = meta
      .filter(m => settings[m.key] !== original[m.key])
      .map(m => supabase.from('app_settings').update({ value: settings[m.key], updated_at: new Date().toISOString() }).eq('key', m.key));
    await Promise.all(updates);
    setOriginal({ ...settings });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const isDirty = JSON.stringify(settings) !== JSON.stringify(original);

  const ICONS: Record<string, any> = {
    site_name: Globe, site_logo_url: Image, contact_email: Mail,
    support_url: Globe, privacy_url: Globe, terms_url: Globe,
  };

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  const grouped: Record<string, any[]> = {
    'Brand': meta.filter(m => ['site_name', 'site_logo_url', 'contact_email'].includes(m.key)),
    'Links': meta.filter(m => ['support_url', 'privacy_url', 'terms_url'].includes(m.key)),
    'Access Control': meta.filter(m => ['maintenance_mode', 'allow_new_signups'].includes(m.key)),
    'Content': meta.filter(m => ['welcome_message', 'max_file_size_mb'].includes(m.key)),
  };

  return (
    <div>
      {Object.entries(grouped).map(([groupLabel, items]) => (
        items.length === 0 ? null :
        <div className="data-card" key={groupLabel} style={{ marginBottom: 20 }}>
          <div className="data-card-header">
            <span className="data-card-title">{groupLabel}</span>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {items.map(setting => {
              const Icon = ICONS[setting.key];
              return (
                <div key={setting.key} className="setting-row">
                  <div className="setting-info">
                    {Icon && <Icon size={15} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />}
                    <div>
                      <div className="setting-label">{setting.label}</div>
                      <div className="setting-desc">{setting.description}</div>
                    </div>
                  </div>
                  <div className="setting-control">
                    {setting.type === 'boolean' ? (
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={settings[setting.key] === 'true'}
                          onChange={e => setSettings(p => ({ ...p, [setting.key]: e.target.checked ? 'true' : 'false' }))}
                        />
                        <span className="toggle-slider" />
                      </label>
                    ) : (
                      <input
                        className="input-field"
                        type={setting.type === 'email' ? 'email' : setting.type === 'url' ? 'url' : 'text'}
                        value={settings[setting.key] ?? ''}
                        onChange={e => setSettings(p => ({ ...p, [setting.key]: e.target.value }))}
                        style={{ minWidth: 280 }}
                        placeholder={setting.type === 'url' ? 'https://' : ''}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button className="btn btn-ghost" onClick={() => setSettings({ ...original })} disabled={!isDirty || saving}>
          Discard
        </button>
        <button className="btn btn-primary" onClick={saveSettings} disabled={!isDirty || saving}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : saved ? '✓ Saved!' : <><Save size={14} /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}

// ─── Admin Management Tab ───────────────────────────────────────────────────
function AdminManagement() {
  const { role: myRole } = useAuth();
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newRole, setNewRole] = useState('admin');
  const [saving, setSaving] = useState(false);
  const [expandedAdminId, setExpandedAdminId] = useState<string | null>(null);
  const [permSaving, setPermSaving] = useState<string | null>(null);

  useEffect(() => { loadAdmins(); }, []);

  async function loadAdmins() {
    const { data } = await supabase.from('admins').select('*').order('created_at', { ascending: false });
    setAdmins(data || []);
    setLoading(false);
  }

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    const { data } = await supabase.rpc('admin_search_profiles', { search_query: q, result_limit: 8 });
    setSearchResults(data || []);
    setSearchLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchUsers(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchUsers]);

  async function addAdmin() {
    if (!selectedUser) return;
    setSaving(true);
    const perms = ROLE_PRESETS[newRole] || [];
    await supabase.from('admins').upsert({
      id: selectedUser.user_id,
      email: selectedUser.email,
      display_name: selectedUser.display_name,
      role: newRole,
      permissions: perms,
    });
    setSaving(false);
    setShowAdd(false);
    setSelectedUser(null);
    setSearchQuery('');
    setSearchResults([]);
    setNewRole('admin');
    loadAdmins();
  }

  async function removeAdmin(adminId: string) {
    if (!confirm('Remove this admin? They will lose all admin access.')) return;
    await supabase.from('admins').delete().eq('id', adminId);
    setAdmins(prev => prev.filter(a => a.id !== adminId));
  }

  async function updateAdminRole(adminId: string, newR: string) {
    const perms = ROLE_PRESETS[newR] || [];
    await supabase.from('admins').update({ role: newR, permissions: perms }).eq('id', adminId);
    setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, role: newR, permissions: perms } : a));
  }

  async function togglePermission(adminId: string, permKey: string, currentPerms: string[]) {
    setPermSaving(adminId + permKey);
    const newPerms = currentPerms.includes(permKey)
      ? currentPerms.filter(p => p !== permKey)
      : [...currentPerms, permKey];
    await supabase.from('admins').update({ permissions: newPerms }).eq('id', adminId);
    setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, permissions: newPerms } : a));
    setPermSaving(null);
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  if (myRole !== 'superadmin') {
    return (
      <div className="data-card">
        <div className="empty-state">
          <div className="empty-state-icon"><Shield size={24} /></div>
          <h3>Superadmin Required</h3>
          <p>Only superadmins can manage admin roles and permissions</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add Admin
        </button>
      </div>

      {/* Add Admin Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Plus size={18} /> Add Admin</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* User Search */}
              <div className="form-group mb-md">
                <label className="form-label">Search User by Name or Email</label>
                <div style={{ position: 'relative' }}>
                  <div className="search-box">
                    <Search size={14} className="search-icon" />
                    <input
                      className="input-field"
                      placeholder="Type name or email..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setSelectedUser(null); }}
                      autoFocus
                    />
                  </div>
                  {(searchResults.length > 0 || searchLoading) && !selectedUser && (
                    <div className="search-dropdown">
                      {searchLoading
                        ? <div className="search-dropdown-item"><Loader2 size={14} className="animate-spin" /> Searching...</div>
                        : searchResults.map(u => (
                          <div
                            key={u.user_id}
                            className="search-dropdown-item"
                            onClick={() => { setSelectedUser(u); setSearchQuery(u.display_name || u.email); setSearchResults([]); }}
                          >
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{u.display_name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.email}</div>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
                {selectedUser && (
                  <div className="selected-user-chip">
                    <span>✓ {selectedUser.display_name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{selectedUser.email}</span>
                    <button className="btn btn-ghost btn-icon" style={{ padding: 2 }} onClick={() => { setSelectedUser(null); setSearchQuery(''); }}>
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Role */}
              <div className="form-group mb-md">
                <label className="form-label">Role</label>
                <select className="select-field" value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="superadmin">Superadmin — Full access to everything</option>
                  <option value="admin">Admin — Manage users, listings, content</option>
                  <option value="analyst">Analyst — Read-only analytics access</option>
                </select>
              </div>

              {/* Permission Preview */}
              <div>
                <label className="form-label" style={{ marginBottom: 8 }}>Permissions for this role</label>
                <div className="perm-preview-grid">
                  {ALL_PERMISSIONS.map(p => (
                    <div key={p.key} className={`perm-preview-chip ${ROLE_PRESETS[newRole]?.includes(p.key) ? 'active' : 'inactive'}`}>
                      {ROLE_PRESETS[newRole]?.includes(p.key) ? '✓' : '✗'} {p.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={addAdmin} disabled={!selectedUser || saving}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Adding...</> : 'Add Admin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {admins.length === 0 ? (
          <div className="data-card">
            <div className="empty-state">
              <h3>No admins configured</h3>
              <p>Add admins to grant access to this panel</p>
            </div>
          </div>
        ) : admins.map(admin => {
          const perms: string[] = Array.isArray(admin.permissions) ? admin.permissions : [];
          const isExpanded = expandedAdminId === admin.id;

          return (
            <div className="data-card" key={admin.id} style={{ padding: 0 }}>
              {/* Admin Row */}
              <div className="admin-row">
                <div className="user-cell">
                  <div className="user-cell-avatar" style={{ background: ROLE_COLORS[admin.role] + '22', color: ROLE_COLORS[admin.role] }}>
                    {(admin.display_name || admin.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="user-cell-info">
                    <span className="user-cell-name">{admin.display_name || '—'}</span>
                    <span className="user-cell-sub">{admin.email}</span>
                  </div>
                </div>

                <div className="flex-center gap-sm" style={{ flexWrap: 'wrap' }}>
                  <span className="badge" style={{ background: ROLE_COLORS[admin.role] + '22', color: ROLE_COLORS[admin.role] }}>
                    {admin.role}
                  </span>
                  <select
                    className="select-field"
                    value={admin.role}
                    onChange={e => updateAdminRole(admin.id, e.target.value)}
                    style={{ width: 'auto', padding: '4px 28px 4px 8px', fontSize: '0.8rem' }}
                  >
                    <option value="superadmin">Superadmin</option>
                    <option value="admin">Admin</option>
                    <option value="analyst">Analyst</option>
                  </select>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setExpandedAdminId(isExpanded ? null : admin.id)}
                    style={{ fontSize: '0.78rem' }}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    Permissions ({perms.length}/{ALL_PERMISSIONS.length})
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => removeAdmin(admin.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Expandable Permissions Panel */}
              {isExpanded && (
                <div className="perm-panel">
                  {PERM_CATEGORIES.map(category => {
                    const catPerms = ALL_PERMISSIONS.filter(p => p.category === category);
                    return (
                      <div key={category} className="perm-category">
                        <div className="perm-category-label">{category}</div>
                        <div className="perm-grid">
                          {catPerms.map(perm => {
                            const active = perms.includes(perm.key);
                            const isSaving = permSaving === admin.id + perm.key;
                            return (
                              <label key={perm.key} className={`perm-toggle ${active ? 'active' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={active}
                                  disabled={isSaving}
                                  onChange={() => togglePermission(admin.id, perm.key, perms)}
                                />
                                <span className="perm-toggle-box">
                                  {isSaving ? <Loader2 size={10} className="animate-spin" /> : active ? '✓' : ''}
                                </span>
                                <span className="perm-toggle-label">{perm.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {perms.length} of {ALL_PERMISSIONS.length} permissions enabled
                    </span>
                    <div className="flex-center gap-sm">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          const newPerms = perms.length === ALL_PERMISSIONS.length ? [] : ALL_PERMISSIONS.map(p => p.key);
                          await supabase.from('admins').update({ permissions: newPerms }).eq('id', admin.id);
                          setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, permissions: newPerms } : a));
                        }}
                      >
                        {perms.length === ALL_PERMISSIONS.length ? 'Remove All' : 'Grant All'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
