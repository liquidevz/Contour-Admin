import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Edit2, X, ChevronRight, Layers } from 'lucide-react';

export default function Categories() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState<null | 'category' | 'subcategory' | 'intent'>(null);
  const [modalParentId, setModalParentId] = useState<string>('');
  const [modalValue, setModalValue] = useState('');
  const [editing, setEditing] = useState<{ id: string; table: string; value: string } | null>(null);

  useEffect(() => { loadCategories(); }, []);

  async function loadCategories() {
    const { data } = await supabase.from('marketplace_categories')
      .select('*, marketplace_subcategories(*), marketplace_category_intents(*)')
      .order('name');
    setCategories(data || []);
    setLoading(false);
  }

  async function createItem() {
    if (!modalValue.trim()) return;
    if (showModal === 'category') {
      await supabase.from('marketplace_categories').insert({ name: modalValue.trim() });
    } else if (showModal === 'subcategory') {
      await supabase.from('marketplace_subcategories').insert({
        category_id: modalParentId, name: modalValue.trim(), normalized_name: modalValue.trim().toLowerCase().replace(/\s+/g, '_')
      });
    } else if (showModal === 'intent') {
      await supabase.from('marketplace_category_intents').insert({
        category_id: modalParentId, intent: modalValue.trim()
      });
    }
    setShowModal(null);
    setModalValue('');
    loadCategories();
  }

  async function deleteItem(table: string, id: string) {
    if (!confirm('Delete this item?')) return;
    await supabase.from(table).delete().eq('id', id);
    loadCategories();
  }

  async function saveEdit() {
    if (!editing) return;
    const field = editing.table === 'marketplace_category_intents' ? 'intent' : 'name';
    await supabase.from(editing.table).update({ [field]: editing.value }).eq('id', editing.id);
    setEditing(null);
    loadCategories();
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Categories</h1>
            <p>{categories.length} marketplace categories</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowModal('category'); setModalParentId(''); }}>
            <Plus size={16} /> Add Category
          </button>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(showModal || editing) && (
        <div className="modal-overlay" onClick={() => { setShowModal(null); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Edit' : 'Create'} {showModal || 'Item'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => { setShowModal(null); setEditing(null); }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{showModal === 'intent' ? 'Intent' : 'Name'}</label>
                <input
                  className="input-field"
                  value={editing ? editing.value : modalValue}
                  onChange={e => editing ? setEditing({ ...editing, value: e.target.value }) : setModalValue(e.target.value)}
                  placeholder={showModal === 'intent' ? 'e.g. Find a developer...' : 'Enter name...'}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setShowModal(null); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={editing ? saveEdit : createItem}>
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="data-card">
          <div className="empty-state">
            <div className="empty-state-icon"><Layers size={24} /></div>
            <h3>No categories yet</h3>
            <p>Create your first marketplace category</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {categories.map(cat => (
            <div key={cat.id} className="data-card">
              <div className="data-card-header" style={{ cursor: 'pointer' }} onClick={() => toggleExpand(cat.id)}>
                <div className="flex-center gap-sm">
                  <ChevronRight size={16} style={{ transform: expanded.has(cat.id) ? 'rotate(90deg)' : 'none', transition: 'var(--transition-fast)', color: 'var(--text-muted)' }} />
                  <span className="data-card-title">{cat.name}</span>
                  <span className="data-card-count">{cat.marketplace_subcategories?.length || 0} subs</span>
                  <span className="data-card-count">{cat.marketplace_category_intents?.length || 0} intents</span>
                </div>
                <div className="btn-group" onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: cat.id, table: 'marketplace_categories', value: cat.name })}>
                    <Edit2 size={13} />
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteItem('marketplace_categories', cat.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {expanded.has(cat.id) && (
                <div style={{ padding: '0 22px 18px' }}>
                  {/* Subcategories */}
                  <div style={{ marginBottom: 16 }}>
                    <div className="flex-center gap-sm mb-md" style={{ justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subcategories</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setShowModal('subcategory'); setModalParentId(cat.id); }}>
                        <Plus size={13} /> Add
                      </button>
                    </div>
                    {cat.marketplace_subcategories?.length > 0 ? (
                      <div className="tags-row">
                        {cat.marketplace_subcategories.map((sub: any) => (
                          <span key={sub.id} className="tag-chip">
                            {sub.name}
                            <button className="tag-chip-remove" onClick={() => deleteItem('marketplace_subcategories', sub.id)}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No subcategories</span>
                    )}
                  </div>

                  {/* Intents */}
                  <div>
                    <div className="flex-center gap-sm mb-md" style={{ justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intents</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setShowModal('intent'); setModalParentId(cat.id); }}>
                        <Plus size={13} /> Add
                      </button>
                    </div>
                    {cat.marketplace_category_intents?.length > 0 ? (
                      <div className="tags-row">
                        {cat.marketplace_category_intents.map((intent: any) => (
                          <span key={intent.id} className="tag-chip">
                            {intent.intent}
                            <button className="tag-chip-remove" onClick={() => deleteItem('marketplace_category_intents', intent.id)}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No intents</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
