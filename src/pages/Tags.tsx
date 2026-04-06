import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, X, Tag } from 'lucide-react';

export default function Tags() {
  const [activeTab, setActiveTab] = useState<'marketplace' | 'profile'>('marketplace');
  const [marketplaceTags, setMarketplaceTags] = useState<any[]>([]);
  const [profileTags, setProfileTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTag, setNewTag] = useState({ name: '', category: '', tag_type: 'offer' });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [m, p] = await Promise.all([
      supabase.from('marketplace_tags').select('*').order('name'),
      supabase.from('tags').select('*').order('name'),
    ]);
    setMarketplaceTags(m.data || []);
    setProfileTags(p.data || []);
    setLoading(false);
  }

  async function createTag() {
    if (!newTag.name.trim()) return;
    const normalized = newTag.name.trim().toLowerCase().replace(/\s+/g, '_');
    if (activeTab === 'marketplace') {
      await supabase.from('marketplace_tags').insert({ name: newTag.name.trim(), normalized_name: normalized, category: newTag.category || null });
    } else {
      await supabase.from('tags').insert({ name: newTag.name.trim(), normalized_name: normalized, tag_type: newTag.tag_type });
    }
    setShowModal(false);
    setNewTag({ name: '', category: '', tag_type: 'offer' });
    loadAll();
  }

  async function deleteTag(table: string, id: string) {
    if (!confirm('Delete this tag?')) return;
    await supabase.from(table).delete().eq('id', id);
    loadAll();
  }

  async function toggleActive(table: string, id: string, current: boolean) {
    await supabase.from(table).update({ is_active: !current }).eq('id', id);
    loadAll();
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  const tags = activeTab === 'marketplace' ? marketplaceTags : profileTags;
  const table = activeTab === 'marketplace' ? 'marketplace_tags' : 'tags';

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Tags</h1>
            <p>Manage marketplace and profile tags</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> New Tag
          </button>
        </div>
      </div>

      <div className="tabs-bar">
        <button className={`tab-btn ${activeTab === 'marketplace' ? 'active' : ''}`} onClick={() => setActiveTab('marketplace')}>
          Marketplace Tags ({marketplaceTags.length})
        </button>
        <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          Profile Tags ({profileTags.length})
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create {activeTab === 'marketplace' ? 'Marketplace' : 'Profile'} Tag</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-md">
                <label className="form-label">Name</label>
                <input className="input-field" placeholder="Tag name" value={newTag.name} onChange={e => setNewTag(p => ({ ...p, name: e.target.value }))} autoFocus />
              </div>
              {activeTab === 'marketplace' ? (
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input className="input-field" placeholder="e.g. Tech, Design..." value={newTag.category} onChange={e => setNewTag(p => ({ ...p, category: e.target.value }))} />
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Tag Type</label>
                  <select className="select-field" value={newTag.tag_type} onChange={e => setNewTag(p => ({ ...p, tag_type: e.target.value }))}>
                    <option value="offer">Offer</option>
                    <option value="want">Want</option>
                    <option value="role">Role</option>
                    <option value="designation">Designation</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createTag}>Create</button>
            </div>
          </div>
        </div>
      )}

      <div className="data-card">
        {tags.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Tag size={24} /></div>
            <h3>No tags</h3>
            <p>Create your first {activeTab} tag</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  {activeTab === 'marketplace' ? <th>Category</th> : <th>Type</th>}
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag: any) => (
                  <tr key={tag.id}>
                    <td style={{ fontWeight: 550, color: 'var(--text-primary)' }}>{tag.name}</td>
                    <td>
                      <span className="tag-chip">{activeTab === 'marketplace' ? (tag.category || '—') : tag.tag_type}</span>
                    </td>
                    <td>
                      <label className="toggle">
                        <input type="checkbox" checked={tag.is_active !== false} onChange={() => toggleActive(table, tag.id, tag.is_active !== false)} />
                        <span className="toggle-slider"></span>
                      </label>
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteTag(table, tag.id)}>
                        <Trash2 size={14} />
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
