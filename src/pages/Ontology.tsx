import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, X, Layers } from 'lucide-react';

export default function Ontology() {
  const [activeTab, setActiveTab] = useState<'skills' | 'siblings'>('skills');
  const [skills, setSkills] = useState<any[]>([]);
  const [siblings, setSiblings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newSkill, setNewSkill] = useState({ term: '', synonyms: '', parent_domain: '' });
  const [newSibling, setNewSibling] = useState({ category_a: '', category_b: '', similarity: 0.8 });

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [s, sib] = await Promise.all([
      supabase.from('skill_ontology').select('*').order('term'),
      supabase.from('category_siblings').select('*').order('category_a'),
    ]);
    setSkills(s.data || []);
    setSiblings(sib.data || []);
    setLoading(false);
  }

  async function createItem() {
    if (activeTab === 'skills') {
      if (!newSkill.term.trim()) return;
      await supabase.from('skill_ontology').insert({
        term: newSkill.term.trim(),
        synonyms: newSkill.synonyms.split(',').map(s => s.trim()).filter(Boolean),
        parent_domain: newSkill.parent_domain.trim() || null,
      });
      setNewSkill({ term: '', synonyms: '', parent_domain: '' });
    } else {
      if (!newSibling.category_a.trim() || !newSibling.category_b.trim()) return;
      await supabase.from('category_siblings').insert({
        category_a: newSibling.category_a.trim(),
        category_b: newSibling.category_b.trim(),
        similarity: newSibling.similarity,
      });
      setNewSibling({ category_a: '', category_b: '', similarity: 0.8 });
    }
    setShowModal(false);
    loadAll();
  }

  async function deleteItem(table: string, id: string) {
    if (!confirm('Delete this item?')) return;
    await supabase.from(table).delete().eq('id', id);
    loadAll();
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Ontology</h1>
            <p>Manage skill synonyms and category relationships</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add {activeTab === 'skills' ? 'Skill' : 'Sibling'}
          </button>
        </div>
      </div>

      <div className="tabs-bar">
        <button className={`tab-btn ${activeTab === 'skills' ? 'active' : ''}`} onClick={() => setActiveTab('skills')}>
          Skill Ontology ({skills.length})
        </button>
        <button className={`tab-btn ${activeTab === 'siblings' ? 'active' : ''}`} onClick={() => setActiveTab('siblings')}>
          Category Siblings ({siblings.length})
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add {activeTab === 'skills' ? 'Skill' : 'Category Sibling'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {activeTab === 'skills' ? (
                <>
                  <div className="form-group mb-md">
                    <label className="form-label">Term</label>
                    <input className="input-field" placeholder="e.g. React" value={newSkill.term} onChange={e => setNewSkill(p => ({ ...p, term: e.target.value }))} autoFocus />
                  </div>
                  <div className="form-group mb-md">
                    <label className="form-label">Synonyms (comma-separated)</label>
                    <input className="input-field" placeholder="ReactJS, React.js" value={newSkill.synonyms} onChange={e => setNewSkill(p => ({ ...p, synonyms: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Parent Domain</label>
                    <input className="input-field" placeholder="e.g. Frontend" value={newSkill.parent_domain} onChange={e => setNewSkill(p => ({ ...p, parent_domain: e.target.value }))} />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group mb-md">
                    <label className="form-label">Category A</label>
                    <input className="input-field" placeholder="e.g. Tech" value={newSibling.category_a} onChange={e => setNewSibling(p => ({ ...p, category_a: e.target.value }))} autoFocus />
                  </div>
                  <div className="form-group mb-md">
                    <label className="form-label">Category B</label>
                    <input className="input-field" placeholder="e.g. IT" value={newSibling.category_b} onChange={e => setNewSibling(p => ({ ...p, category_b: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Similarity (0-1)</label>
                    <input className="input-field" type="number" step="0.1" min={0} max={1} value={newSibling.similarity} onChange={e => setNewSibling(p => ({ ...p, similarity: +e.target.value }))} />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createItem}>Create</button>
            </div>
          </div>
        </div>
      )}

      <div className="data-card">
        {activeTab === 'skills' ? (
          skills.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Layers size={24} /></div>
              <h3>No skills defined</h3>
              <p>Add skill ontology entries for better matching</p>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Term</th><th>Synonyms</th><th>Domain</th><th>Actions</th></tr></thead>
                <tbody>
                  {skills.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 550, color: 'var(--text-primary)' }}>{s.term}</td>
                      <td>
                        <div className="tags-row">
                          {(s.synonyms || []).map((syn: string, i: number) => (
                            <span key={i} className="tag-chip">{syn}</span>
                          ))}
                          {(!s.synonyms || s.synonyms.length === 0) && '—'}
                        </div>
                      </td>
                      <td>{s.parent_domain || '—'}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteItem('skill_ontology', s.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          siblings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Layers size={24} /></div>
              <h3>No siblings defined</h3>
              <p>Add category sibling relationships</p>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Category A</th><th>Category B</th><th>Similarity</th><th>Actions</th></tr></thead>
                <tbody>
                  {siblings.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 550 }}>{s.category_a}</td>
                      <td style={{ fontWeight: 550 }}>{s.category_b}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--bg-active)', overflow: 'hidden' }}>
                            <div style={{ width: `${(s.similarity || 0) * 100}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: '0.8rem' }}>{s.similarity}</span>
                        </div>
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteItem('category_siblings', s.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
