/**
 * Tags — marketplace & profile tag management with relations.
 *
 * Each row exposes: usage counts (profiles / offers / wants), ontology
 * presence (canonical vs. synonym, parent_domain), and IDF stats from
 * the match engine corpus tables.
 *
 * Backed by RPCs in migration 049_tag_relations.sql:
 *   admin_list_tags_with_relations(p_kind)
 *   admin_get_tag_relation_detail(p_tag_name)
 *   admin_promote_tag_to_ontology(name, domain, synonyms)
 *   admin_refresh_tag_usage_counts()
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Plus, Trash2, X, Tag, ChevronDown, ChevronRight, Sparkles,
  Layers, RefreshCw, ExternalLink, SlidersHorizontal,
} from 'lucide-react';
import Page from '../components/ui/Page';
import Help from '../components/ui/Help';
import EmptyState from '../components/ui/EmptyState';

type Kind = 'marketplace' | 'profile';

interface TagRow {
  id: string;
  name: string;
  normalized_name: string;
  category: string | null;
  tag_type: string | null;
  is_active: boolean;
  profile_count: number;
  offer_count: number;
  want_count: number;
  in_ontology: boolean;
  is_canonical: boolean;
  parent_domain: string | null;
  idf_offer: number | null;
  idf_want: number | null;
}

interface TagDetail {
  tag_name: string;
  normalized: string;
  usage: { offer_count: number; want_count: number; profile_count: number };
  ontology: null | {
    is_canonical: boolean;
    canonical_term: string;
    parent_domain: string;
    synonyms: string[];
  };
  idf: { idf_offer: number | null; df_leaf_offer: number | null; idf_want: number | null; df_leaf_want: number | null };
  samples: {
    profiles: Array<{ profile_id: string; display_name: string | null; username: string | null; avatar_url: string | null }>;
    offers: Array<{ id: string; title: string; user_id: string; category: string | null; last_active_at: string | null }>;
    wants: Array<{ id: string; title: string; user_id: string; category: string | null; last_active_at: string | null }>;
  };
}

const DOMAIN_PRESETS = [
  'technology', 'design', 'business', 'marketing', 'finance',
  'education', 'real_estate', 'health', 'legal', 'creative',
];

export default function Tags() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>('marketplace');
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unused' | 'unmapped' | 'mapped'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, TagDetail | 'loading' | undefined>>({});

  const [showCreate, setShowCreate] = useState(false);
  const [newTag, setNewTag] = useState({ name: '', category: '', tag_type: 'offer' });

  const [promote, setPromote] = useState<{ name: string; domain: string; synonyms: string } | null>(null);

  useEffect(() => { void load(); }, [kind]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_tags_with_relations', { p_kind: kind });
    if (error) console.warn('[Tags] list failed', error);
    setRows((data as TagRow[]) || []);
    setLoading(false);
  }

  async function refreshCounts() {
    setRefreshing(true);
    const { error } = await supabase.rpc('admin_refresh_tag_usage_counts');
    if (error) console.warn('[Tags] refresh failed', error);
    await load();
    setRefreshing(false);
  }

  async function loadDetail(row: TagRow) {
    if (detail[row.id] && detail[row.id] !== 'loading') return;
    setDetail(d => ({ ...d, [row.id]: 'loading' }));
    const { data, error } = await supabase.rpc('admin_get_tag_relation_detail', { p_tag_name: row.name });
    if (error) {
      console.warn('[Tags] detail failed', error);
      setDetail(d => ({ ...d, [row.id]: undefined }));
      return;
    }
    setDetail(d => ({ ...d, [row.id]: data as TagDetail }));
  }

  function toggleExpand(row: TagRow) {
    if (expandedId === row.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.id);
    void loadDetail(row);
  }

  async function createTag() {
    if (!newTag.name.trim()) return;
    const normalized = newTag.name.trim().toLowerCase().replace(/\s+/g, '_');
    if (kind === 'marketplace') {
      await supabase.from('marketplace_tags').insert({
        name: newTag.name.trim(),
        normalized_name: normalized,
        category: newTag.category || null,
      });
    } else {
      await supabase.from('tags').insert({
        name: newTag.name.trim(),
        normalized_name: normalized,
        tag_type: newTag.tag_type,
      });
    }
    setShowCreate(false);
    setNewTag({ name: '', category: '', tag_type: 'offer' });
    await load();
  }

  async function deleteTag(row: TagRow) {
    const usage = row.offer_count + row.want_count + row.profile_count;
    if (usage > 0) {
      if (!confirm(
        `"${row.name}" is currently used in ${usage} place${usage === 1 ? '' : 's'} ` +
        `(${row.offer_count} offers, ${row.want_count} wants, ${row.profile_count} profiles). ` +
        `Delete anyway? Existing references will become orphans.`
      )) return;
    } else if (!confirm(`Delete "${row.name}"?`)) {
      return;
    }
    const table = kind === 'marketplace' ? 'marketplace_tags' : 'tags';
    await supabase.from(table).delete().eq('id', row.id);
    await load();
  }

  async function toggleActive(row: TagRow) {
    const table = kind === 'marketplace' ? 'marketplace_tags' : 'tags';
    await supabase.from(table).update({ is_active: !row.is_active }).eq('id', row.id);
    await load();
  }

  async function submitPromote() {
    if (!promote) return;
    if (!promote.domain.trim()) {
      alert('parent domain is required');
      return;
    }
    const synonymsArr = promote.synonyms
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const { error } = await supabase.rpc('admin_promote_tag_to_ontology', {
      p_tag_name:      promote.name,
      p_parent_domain: promote.domain.trim(),
      p_synonyms:      synonymsArr,
    });
    if (error) {
      alert(`Promote failed: ${error.message}`);
      return;
    }
    setPromote(null);
    await load();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (filter === 'unused' && (r.offer_count + r.want_count + r.profile_count) > 0) return false;
      if (filter === 'unmapped' && r.in_ontology) return false;
      if (filter === 'mapped' && !r.in_ontology) return false;
      return true;
    });
  }, [rows, search, filter]);

  return (
    <Page
      title="Tags"
      subtitle="Tags are the labels people attach to their offers, wants, and profiles. This page shows how each tag is being used across the app and whether the match engine knows about it."
      icon={<Tag size={20} />}
      actions={
        <>
          <button className="btn btn-ghost" onClick={refreshCounts} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh counts'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Tag
          </button>
        </>
      }
    >
      <div className="tabs-bar">
        <button
          className={`tab-btn ${kind === 'marketplace' ? 'active' : ''}`}
          onClick={() => { setKind('marketplace'); setExpandedId(null); }}
        >
          Marketplace Tags ({kind === 'marketplace' ? rows.length : '…'})
        </button>
        <button
          className={`tab-btn ${kind === 'profile' ? 'active' : ''}`}
          onClick={() => { setKind('profile'); setExpandedId(null); }}
        >
          Profile Tags ({kind === 'profile' ? rows.length : '…'})
        </button>
      </div>

      <div className="data-card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          className="input-field"
          placeholder="Search tags…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <select className="select-field" value={filter} onChange={e => setFilter(e.target.value as any)} style={{ width: 200 }}>
          <option value="all">All</option>
          <option value="unused">Unused (zero references)</option>
          <option value="unmapped">Unmapped (not in ontology)</option>
          <option value="mapped">Mapped (in ontology)</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : (
        <div className="data-card">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Tag}
              title={rows.length === 0 ? 'No tags yet' : 'No matches for your filters'}
              body={rows.length === 0
                ? `Create your first ${kind} tag. Marketplace tags are what people pick when posting offers and wants; profile tags describe people (roles, skills, designations).`
                : 'Try clearing the search or switching the filter.'}
              size="sm"
            />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    <th>Name</th>
                    <th>{kind === 'marketplace' ? 'Category' : 'Type'}</th>
                    <th>Usage</th>
                    <th>Ontology</th>
                    <th>IDF (Offer / Want)</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => {
                    const expanded = expandedId === row.id;
                    const total = row.offer_count + row.want_count + row.profile_count;
                    const d = detail[row.id];

                    return (
                      <>
                        <tr key={row.id} style={{ cursor: 'pointer' }} onClick={() => toggleExpand(row)}>
                          <td>
                            {expanded
                              ? <ChevronDown size={14} style={{ opacity: 0.7 }} />
                              : <ChevronRight size={14} style={{ opacity: 0.7 }} />}
                          </td>
                          <td style={{ fontWeight: 550, color: 'var(--text-primary)' }}>{row.name}</td>
                          <td>
                            <span className="tag-chip">
                              {kind === 'marketplace' ? (row.category || '—') : (row.tag_type || '—')}
                            </span>
                          </td>
                          <td>
                            <UsageBar offer={row.offer_count} want={row.want_count} profile={row.profile_count} total={total} />
                          </td>
                          <td>
                            {row.in_ontology
                              ? <span className="tag-chip" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--status-success)' }}>
                                  {row.is_canonical ? '● canonical' : '○ synonym'}
                                  {row.parent_domain ? ` · ${row.parent_domain}` : ''}
                                </span>
                              : <span className="tag-chip" style={{ background: 'rgba(244,114,182,0.12)', color: 'var(--status-warning)' }}>
                                  not mapped
                                </span>}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                            {row.idf_offer != null ? row.idf_offer : '—'}
                            {' / '}
                            {row.idf_want != null ? row.idf_want : '—'}
                          </td>
                          <td>
                            <label className="toggle" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={row.is_active !== false}
                                onChange={() => toggleActive(row)}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {!row.in_ontology && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  title="Promote to ontology"
                                  onClick={() => setPromote({ name: row.name, domain: '', synonyms: '' })}
                                >
                                  <Sparkles size={14} />
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Inspect in Match Engine"
                                onClick={() => navigate(`/match-engine?token=${encodeURIComponent(row.name)}`)}
                              >
                                <SlidersHorizontal size={14} />
                              </button>
                              <button className="btn btn-danger btn-sm" title="Delete" onClick={() => deleteTag(row)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {expanded && (
                          <tr key={`${row.id}-detail`} className="row-detail">
                            <td colSpan={8} style={{ background: 'var(--bg-secondary, rgba(255,255,255,0.02))', padding: 0 }}>
                              {d === 'loading' || !d
                                ? <div style={{ padding: 16, opacity: 0.7 }}><span className="spinner spinner-sm" /> Loading…</div>
                                : <Detail d={d} navigate={navigate} />}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create {kind === 'marketplace' ? 'Marketplace' : 'Profile'} Tag</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-md">
                <label className="form-label">Name</label>
                <input
                  className="input-field"
                  placeholder="Tag name"
                  value={newTag.name}
                  onChange={e => setNewTag(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>
              {kind === 'marketplace' ? (
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input
                    className="input-field"
                    placeholder="e.g. Tech, Design…"
                    value={newTag.category}
                    onChange={e => setNewTag(p => ({ ...p, category: e.target.value }))}
                  />
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
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createTag}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Promote-to-ontology modal */}
      {promote && (
        <div className="modal-overlay" onClick={() => setPromote(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Promote “{promote.name}” to Ontology</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setPromote(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                Adds <strong>{promote.name}</strong> as a canonical term in <code>skill_ontology</code>.
                The match engine's hierarchical IDF (Stage B) will start using it on the next corpus rebuild.
              </p>
              <div className="form-group mb-md">
                <label className="form-label">Parent domain</label>
                <select
                  className="select-field"
                  value={promote.domain}
                  onChange={e => setPromote(p => p ? ({ ...p, domain: e.target.value }) : p)}
                >
                  <option value="">— choose —</option>
                  {DOMAIN_PRESETS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Synonyms <span style={{ opacity: 0.6, fontWeight: 400 }}>(comma-separated)</span></label>
                <input
                  className="input-field"
                  placeholder="e.g. swift, ios, iphone"
                  value={promote.synonyms}
                  onChange={e => setPromote(p => p ? ({ ...p, synonyms: e.target.value }) : p)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPromote(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitPromote}>Promote</button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}


// Suppress unused-import warning until Help is wired into the detail rendering
void Help;


function UsageBar({ offer, want, profile, total }: { offer: number; want: number; profile: number; total: number }) {
  if (total === 0) {
    return <span style={{ opacity: 0.5, fontSize: 12 }}>unused</span>;
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
      <span title={`${profile} profiles`} style={{ color: 'var(--text-secondary)' }}>👤 {profile}</span>
      <span title={`${offer} offers`}     style={{ color: 'var(--text-secondary)' }}>🛒 {offer}</span>
      <span title={`${want} wants`}       style={{ color: 'var(--text-secondary)' }}>🎯 {want}</span>
    </div>
  );
}


function Detail({ d, navigate }: { d: TagDetail; navigate: (p: string) => void }) {
  return (
    <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
      {/* Ontology */}
      <div className="data-card" style={{ padding: 14 }}>
        <div className="data-card-title" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Layers size={14} /> Ontology
        </div>
        {d.ontology ? (
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 6 }}>
              <span style={{ opacity: 0.6 }}>Status:</span>{' '}
              <strong>{d.ontology.is_canonical ? 'Canonical term' : 'Synonym'}</strong>
              {!d.ontology.is_canonical && (
                <span style={{ opacity: 0.6 }}> of <code>{d.ontology.canonical_term}</code></span>
              )}
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ opacity: 0.6 }}>Domain:</span>{' '}
              <span className="tag-chip">{d.ontology.parent_domain}</span>
            </div>
            {d.ontology.synonyms?.length > 0 && (
              <div>
                <span style={{ opacity: 0.6 }}>Synonyms:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {d.ontology.synonyms.slice(0, 12).map(s => (
                    <span key={s} className="tag-chip" style={{ fontSize: 11 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Not present in the match-engine ontology. This tag's text is still tokenized at the leaf level, but no
            synonym expansion or domain rarity smoothing applies. Promote to activate Stage B.
          </div>
        )}
      </div>

      {/* IDF stats */}
      <div className="data-card" style={{ padding: 14 }}>
        <div className="data-card-title" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <SlidersHorizontal size={14} /> Match-Engine IDF
        </div>
        <div style={{ fontSize: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat label="IDF (offer corpus)" value={d.idf.idf_offer} />
          <Stat label="df_leaf (offer)"    value={d.idf.df_leaf_offer} />
          <Stat label="IDF (want corpus)"  value={d.idf.idf_want} />
          <Stat label="df_leaf (want)"     value={d.idf.df_leaf_want} />
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/match-engine?token=${encodeURIComponent(d.tag_name)}`)}
          >
            <SlidersHorizontal size={12} /> Open in Match Engine
          </button>
        </div>
      </div>

      {/* Sample usage */}
      <div className="data-card" style={{ padding: 14 }}>
        <div className="data-card-title" style={{ marginBottom: 10 }}>Recent usage</div>

        {d.samples.profiles.length === 0 && d.samples.offers.length === 0 && d.samples.wants.length === 0 && (
          <div style={{ fontSize: 13, opacity: 0.6 }}>No active references.</div>
        )}

        {d.samples.profiles.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.6, marginBottom: 4 }}>Profiles</div>
            {d.samples.profiles.map(p => (
              <a
                key={p.profile_id}
                style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}
                onClick={e => { e.preventDefault(); navigate(`/users/${p.profile_id}`); }}
                href={`/users/${p.profile_id}`}
              >
                {p.display_name || p.username || p.profile_id.slice(0, 8)} <ExternalLink size={10} style={{ opacity: 0.5 }} />
              </a>
            ))}
          </div>
        )}

        {d.samples.offers.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.6, marginBottom: 4 }}>Offers</div>
            {d.samples.offers.map(o => (
              <a
                key={o.id}
                style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}
                onClick={e => { e.preventDefault(); navigate(`/offers?q=${encodeURIComponent(d.tag_name)}`); }}
                href={`/offers?q=${encodeURIComponent(d.tag_name)}`}
              >
                {o.title || o.id.slice(0, 8)} <ExternalLink size={10} style={{ opacity: 0.5 }} />
              </a>
            ))}
          </div>
        )}

        {d.samples.wants.length > 0 && (
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.6, marginBottom: 4 }}>Wants</div>
            {d.samples.wants.map(w => (
              <a
                key={w.id}
                style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}
                onClick={e => { e.preventDefault(); navigate(`/wants?q=${encodeURIComponent(d.tag_name)}`); }}
                href={`/wants?q=${encodeURIComponent(d.tag_name)}`}
              >
                {w.title || w.id.slice(0, 8)} <ExternalLink size={10} style={{ opacity: 0.5 }} />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
        {value == null ? '—' : value}
      </div>
    </div>
  );
}
