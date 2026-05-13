import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, RefreshCw, Search as SearchIcon, X } from 'lucide-react';

interface EventRow {
  id: string;
  user_id: string | null;
  event_name: string;
  metadata: Record<string, unknown>;
  app_version: string | null;
  platform: string | null;
  created_at: string;
}

interface TopEvent {
  event_name: string;
  event_count: number;
  unique_users: number;
}

export default function Events() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [topEvents, setTopEvents] = useState<TopEvent[]>([]);
  const [filterName, setFilterName] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [recent, top] = await Promise.all([
        supabase.rpc('admin_get_recent_events', {
          lim: 200,
          filter_name: filterName || null,
          filter_user: filterUser || null,
        }),
        supabase.rpc('admin_get_top_events', { days_back: 7, lim: 25 }),
      ]);
      setEvents((recent.data as EventRow[]) || []);
      setTopEvents((top.data as TopEvent[]) || []);
    } catch (err) {
      console.error('[Events] load failed', err);
    } finally {
      setLoading(false);
    }
  }

  // Load whenever filters change
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterName, filterUser]);

  // Quick-filter list of distinct event names (from top events)
  const eventNameOptions = useMemo(
    () => topEvents.map((t) => t.event_name),
    [topEvents],
  );

  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(
      (e) =>
        e.event_name.toLowerCase().includes(q) ||
        (e.user_id || '').toLowerCase().includes(q) ||
        JSON.stringify(e.metadata || {})
          .toLowerCase()
          .includes(q),
    );
  }, [events, search]);

  return (
    <div>
      <div className="page-header">
        <h1>
          <Activity size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Events
        </h1>
        <p>Live product analytics — every user action flows here.</p>
      </div>

      {/* ── Filter bar ── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 220 }}>
          <SearchIcon
            size={14}
            style={{
              position: 'absolute',
              left: 10,
              top: 11,
              color: 'var(--text-muted, #5a5a6e)',
            }}
          />
          <input
            type="text"
            placeholder="Search by name, user id, metadata…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 30px',
              borderRadius: 6,
              border: '1px solid var(--border, #2a2a35)',
              background: 'var(--bg-secondary, #11111a)',
              color: 'var(--text-primary, #fff)',
              fontSize: 13,
            }}
          />
        </div>

        <select
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--border, #2a2a35)',
            background: 'var(--bg-secondary, #11111a)',
            color: 'var(--text-primary, #fff)',
            fontSize: 13,
            minWidth: 200,
          }}
        >
          <option value="">All event names</option>
          {eventNameOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="User id (uuid)"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--border, #2a2a35)',
            background: 'var(--bg-secondary, #11111a)',
            color: 'var(--text-primary, #fff)',
            fontSize: 13,
            minWidth: 220,
          }}
        />

        {(filterName || filterUser || search) && (
          <button
            className="tab-btn"
            onClick={() => {
              setFilterName('');
              setFilterUser('');
              setSearch('');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <X size={14} /> Clear
          </button>
        )}

        <button
          className="tab-btn"
          onClick={() => void load()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="two-col-grid">
        {/* Top events */}
        <div className="data-card">
          <div className="data-card-header">
            <span className="data-card-title">Top events (last 7 days)</span>
          </div>
          {loading && topEvents.length === 0 ? (
            <div className="loading-state">
              <div className="spinner" />
            </div>
          ) : topEvents.length === 0 ? (
            <div className="empty-state">
              <h3>No event data yet</h3>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Count</th>
                    <th>Users</th>
                  </tr>
                </thead>
                <tbody>
                  {topEvents.map((row) => (
                    <tr
                      key={row.event_name}
                      onClick={() => setFilterName(row.event_name)}
                      style={{ cursor: 'pointer' }}
                      title="Click to filter recent events by this name"
                    >
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {row.event_name}
                      </td>
                      <td style={{ fontWeight: 600 }}>{row.event_count}</td>
                      <td>{row.unique_users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent events */}
        <div className="data-card">
          <div className="data-card-header">
            <span className="data-card-title">
              Recent events{' '}
              <span style={{ color: 'var(--text-muted, #5a5a6e)', fontWeight: 400 }}>
                ({filteredEvents.length})
              </span>
            </span>
          </div>
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="empty-state">
              <h3>No events match these filters</h3>
            </div>
          ) : (
            <div className="data-table-wrap" style={{ maxHeight: 600, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Event</th>
                    <th>User</th>
                    <th>Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((e) => (
                    <tr key={e.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-muted, #5a5a6e)' }}>
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {e.event_name}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {e.user_id ? e.user_id.slice(0, 8) : '—'}
                      </td>
                      <td>
                        <code style={{ fontSize: 11, color: 'var(--text-muted, #8a8a9e)' }}>
                          {Object.keys(e.metadata || {}).length === 0
                            ? '—'
                            : JSON.stringify(e.metadata).slice(0, 80)}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
