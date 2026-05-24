import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Search, Power, Trash2, RotateCw, ExternalLink, ShoppingBag, HandHeart } from 'lucide-react';
import Page from '../components/ui/Page';

const PAGE_SIZE = 20;

interface ListingPageProps {
  type: 'offer' | 'want';
}

export default function ListingsPage({ type }: ListingPageProps) {
  const table = type === 'offer' ? 'user_offers' : 'user_wants';
  const title = type === 'offer' ? 'Offers' : 'Wants';

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { 
    loadItems(); 
  }, [type, page, filter]);

  // Reset page when type changes
  useEffect(() => {
    setPage(0);
    setFilter('all');
    setSearch('');
  }, [type]);

  async function loadItems() {
    setLoading(true);
    setError(null);
    
    let query = supabase.from(table)
      .select(`
        *,
        profiles:user_id (
          display_name,
          username,
          avatar_url
        )
      `, { count: 'exact' });

    if (filter === 'active') query = query.eq('is_active', true);
    else if (filter === 'inactive') query = query.eq('is_active', false);

    const { data, count, error: queryError } = await query
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (queryError) {
      console.error('Query error:', queryError);
      setError(queryError.message);
      setItems([]);
      setTotal(0);
    } else {
      setItems(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }

  async function toggleActive(id: string, currentlyActive: boolean) {
    const { error: updateErr } = await supabase.from(table)
      .update({ is_active: !currentlyActive }).eq('id', id);
    if (updateErr) { alert(updateErr.message); return; }
    // Use the canonical audit helper (migration 030 §4) so RLS, role
    // checks, and metadata shape stay consistent across all admin RPCs.
    await supabase.rpc('admin_audit', {
      p_action: currentlyActive ? `deactivate_${type}` : `reactivate_${type}`,
      p_entity: table,
      p_entity_id: id,
      p_metadata: {},
    });
    setItems(prev => prev.map(item => item.id === id ? { ...item, is_active: !currentlyActive } : item));
  }

  async function deleteItem(id: string) {
    if (!confirm(`Permanently delete this ${type}?`)) return;
    const { error: delErr } = await supabase.from(table).delete().eq('id', id);
    if (delErr) { alert(delErr.message); return; }
    await supabase.rpc('admin_audit', {
      p_action: `delete_${type}`,
      p_entity: table,
      p_entity_id: id,
      p_metadata: {},
    });
    setItems(prev => prev.filter(item => item.id !== id));
    setTotal(t => t - 1);
  }

  const filtered = items.filter(item =>
    !search || (item.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (item.profiles?.display_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Page
      title={title}
      subtitle={`${total} total ${title.toLowerCase()} in the marketplace. Click "View" on any row to see the full listing in context.`}
      icon={type === 'offer' ? <ShoppingBag size={20} /> : <HandHeart size={20} />}
    >

      <div className="data-card">
        <div className="data-card-header">
          <div className="filter-bar">
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                className="input-field"
                placeholder={`Search ${title.toLowerCase()}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 260 }}
              />
            </div>
            <select className="select-field" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-state"><div className="spinner" /></div>
        ) : error ? (
          <div className="empty-state" style={{ color: 'var(--danger)' }}>
            <h3>Error loading {title.toLowerCase()}</h3>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={loadItems} style={{ marginTop: 16 }}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No {title.toLowerCase()} found</h3>
            <p>No marketplace {title.toLowerCase()} match your criteria</p>
          </div>
        ) : (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Owner</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div>
                          <span style={{ fontWeight: 550, color: 'var(--text-primary)' }}>{item.title || '—'}</span>
                          {item.description && (
                            <div className="text-truncate" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {item.description}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <Link to={`/users/${item.user_id}`} className="user-cell"
                          style={{ textDecoration: 'none', color: 'inherit' }}
                          title="Open user detail">
                          <div className="user-cell-avatar">
                            {item.profiles?.avatar_url ? <img src={item.profiles.avatar_url} alt="" /> : (item.profiles?.display_name || '?')[0].toUpperCase()}
                          </div>
                          <span className="user-cell-name" style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {item.profiles?.display_name || 'Unknown'}
                            <ExternalLink size={10} style={{ opacity: 0.5 }} />
                          </span>
                        </Link>
                      </td>
                      <td>
                        {item.category ? <span className="tag-chip">{item.category}</span> : '—'}
                      </td>
                      <td>
                        <span className={`badge ${item.is_active ? 'badge-active' : 'badge-inactive'}`}>
                          {item.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="btn-group">
                          <button
                            className={`btn btn-sm ${item.is_active ? 'btn-danger' : 'btn-success'}`}
                            onClick={() => toggleActive(item.id, item.is_active)}
                            title={item.is_active ? 'Deactivate' : 'Reactivate'}
                          >
                            {item.is_active ? <Power size={14} /> : <RotateCw size={14} />}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteItem(item.id)} title="Delete">
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
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Page {page + 1} of {totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
