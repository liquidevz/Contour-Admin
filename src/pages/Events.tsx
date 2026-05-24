import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, RefreshCw, Search as SearchIcon, X, AlertTriangle, Gauge, Compass, Radio } from 'lucide-react';
import Page from '../components/ui/Page';

type Kind = 'event' | 'error' | 'perf' | 'search';
const KINDS: Kind[] = ['event', 'error', 'perf', 'search'];

interface UnifiedRow {
  kind:         Kind;
  id:           string;
  event_id:     string | null;
  user_id:      string | null;
  session_id:   string | null;
  device_id:    string | null;
  name:         string;
  metadata:     Record<string, unknown>;
  app_version:  string | null;
  build_number: string | null;
  platform:     string | null;
  created_at:   string;
}

interface TopEvent { event_name: string; event_count: number; unique_users: number; }

const KIND_META: Record<Kind, { label: string; icon: React.ReactNode; color: string }> = {
  event:  { label: 'Event',  icon: <Activity size={12} />,      color: '#7C3AED' },
  error:  { label: 'Error',  icon: <AlertTriangle size={12} />, color: '#ff5b6b' },
  perf:   { label: 'Perf',   icon: <Gauge size={12} />,         color: '#F59E0B' },
  search: { label: 'Search', icon: <Compass size={12} />,       color: '#14B8A6' },
};

export default function Events() {
  const [loading, setLoading]       = useState(true);
  const [rows, setRows]             = useState<UnifiedRow[]>([]);
  const [topEvents, setTopEvents]   = useState<TopEvent[]>([]);
  const [filterKind, setFilterKind] = useState<Kind | ''>('');
  const [filterName, setFilterName] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterSession, setSession] = useState('');
  const [search, setSearch]         = useState('');
  const [live, setLive]             = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [recent, top] = await Promise.all([
        supabase.rpc('admin_get_all_events', {
          p_lim:        300,
          p_kind:       filterKind || null,
          p_name:       filterName || null,
          p_user_id:    filterUser || null,
          p_session_id: filterSession || null,
          p_since:      null,
        }),
        supabase.rpc('admin_get_top_events', { days_back: 7, lim: 25 }),
      ]);
      if (recent.error) console.warn('[Events] recent rpc error', recent.error);
      setRows((recent.data as UnifiedRow[]) || []);
      setTopEvents((top.data as TopEvent[]) || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [filterKind, filterName, filterUser, filterSession]);

  // Realtime tail: subscribe to inserts on user_events. RLS still applies
  // server-side — admins see everyone's, others only their own. We only
  // wire 'event' kind here; errors/perf/search realtime is a follow-up.
  useEffect(() => {
    if (!live) return;
    const channel = supabase
      .channel('events-tail')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_events' },
        (payload) => {
          const r = payload.new as Record<string, unknown>;
          const incoming: UnifiedRow = {
            kind:         'event',
            id:           String(r.id),
            event_id:     (r.event_id as string) ?? null,
            user_id:      (r.user_id as string) ?? null,
            session_id:   (r.session_id as string) ?? null,
            device_id:    (r.device_id as string) ?? null,
            name:         String(r.event_name ?? ''),
            metadata:     (r.metadata as Record<string, unknown>) ?? {},
            app_version:  (r.app_version as string) ?? null,
            build_number: (r.build_number as string) ?? null,
            platform:     (r.platform as string) ?? null,
            created_at:   String(r.created_at),
          };
          // Respect active filters client-side so the tail doesn't
          // contradict the visible scope.
          if (filterKind && filterKind !== 'event') return;
          if (filterName    && incoming.name       !== filterName) return;
          if (filterUser    && incoming.user_id    !== filterUser) return;
          if (filterSession && incoming.session_id !== filterSession) return;
          setRows(prev => [incoming, ...prev].slice(0, 300));
        })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [live, filterKind, filterName, filterUser, filterSession]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.user_id    || '').toLowerCase().includes(q) ||
      (r.session_id || '').toLowerCase().includes(q) ||
      (r.device_id  || '').toLowerCase().includes(q) ||
      JSON.stringify(r.metadata || {}).toLowerCase().includes(q),
    );
  }, [rows, search]);

  const hasFilters = filterKind || filterName || filterUser || filterSession || search;

  return (
    <Page
      title="Events"
      subtitle="Unified telemetry across user events, app errors, performance traces, and search analytics. One feed, four lenses."
      icon={<Activity size={20} />}
    >

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 220 }}>
          <SearchIcon size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted, #5a5a6e)' }} />
          <input
            type="text" placeholder="Search name / user / session / metadata…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 6, border: '1px solid var(--border, #2a2a35)', background: 'var(--bg-secondary, #11111a)', color: 'var(--text-primary, #fff)', fontSize: 13 }}
          />
        </div>

        <select value={filterKind} onChange={e => setFilterKind(e.target.value as Kind | '')}
          style={selectStyle}>
          <option value="">All kinds</option>
          {KINDS.map(k => <option key={k} value={k}>{KIND_META[k].label}</option>)}
        </select>

        <input type="text" placeholder="Event name (exact)" value={filterName}
          onChange={e => setFilterName(e.target.value)} style={{ ...selectStyle, minWidth: 200 }} />

        <input type="text" placeholder="User UUID" value={filterUser}
          onChange={e => setFilterUser(e.target.value)} style={{ ...selectStyle, minWidth: 220, fontFamily: 'monospace', fontSize: 12 }} />

        <input type="text" placeholder="Session UUID" value={filterSession}
          onChange={e => setSession(e.target.value)} style={{ ...selectStyle, minWidth: 220, fontFamily: 'monospace', fontSize: 12 }} />

        {hasFilters && (
          <button className="tab-btn" onClick={() => { setFilterKind(''); setFilterName(''); setFilterUser(''); setSession(''); setSearch(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <X size={14} /> Clear
          </button>
        )}

        <button className="tab-btn" onClick={() => void load()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Refresh
        </button>

        <button
          className={`tab-btn ${live ? 'active' : ''}`}
          onClick={() => setLive(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6,
            color: live ? '#14B8A6' : undefined,
            borderColor: live ? '#14B8A6' : undefined }}
          title="Stream new events live via Supabase Realtime">
          <Radio size={14} /> {live ? 'Live' : 'Go live'}
        </button>
      </div>

      <div className="two-col-grid">
        <div className="data-card">
          <div className="data-card-header"><span className="data-card-title">Top events (7d)</span></div>
          {loading && topEvents.length === 0 ? <div className="loading-state"><div className="spinner" /></div>
            : topEvents.length === 0 ? <div className="empty-state"><h3>No event data yet</h3></div>
            : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Event</th><th>Count</th><th>Users</th></tr></thead>
                  <tbody>
                    {topEvents.map(t => (
                      <tr key={t.event_name} onClick={() => { setFilterKind('event'); setFilterName(t.event_name); }}
                        style={{ cursor: 'pointer' }} title="Filter recent by this name">
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.event_name}</td>
                        <td style={{ fontWeight: 600 }}>{t.event_count}</td>
                        <td>{t.unique_users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>

        <div className="data-card">
          <div className="data-card-header">
            <span className="data-card-title">
              Recent telemetry <span style={{ color: 'var(--text-muted, #5a5a6e)', fontWeight: 400 }}>({filtered.length})</span>
            </span>
          </div>
          {loading ? <div className="loading-state"><div className="spinner" /></div>
            : filtered.length === 0 ? <div className="empty-state"><h3>No rows match these filters</h3></div>
            : (
              <div className="data-table-wrap" style={{ maxHeight: 600, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>When</th><th>Kind</th><th>Name</th>
                      <th>User</th><th>Session</th><th>Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const m = KIND_META[r.kind];
                      return (
                        <tr key={`${r.kind}:${r.id}`}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-muted, #5a5a6e)' }}>
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                          <td>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                              background: `${m.color}22`, color: m.color,
                            }}>{m.icon}{m.label}</span>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.name}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 11 }}
                            onClick={() => r.user_id && setFilterUser(r.user_id)}
                            title={r.user_id || ''}>
                            {r.user_id ? r.user_id.slice(0, 8) : '—'}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 11, cursor: r.session_id ? 'pointer' : 'default' }}
                            onClick={() => r.session_id && setSession(r.session_id)}
                            title={r.session_id || ''}>
                            {r.session_id ? r.session_id.slice(0, 8) : '—'}
                          </td>
                          <td>
                            <code style={{ fontSize: 11, color: 'var(--text-muted, #8a8a9e)' }}>
                              {Object.keys(r.metadata || {}).length === 0 ? '—' : JSON.stringify(r.metadata).slice(0, 80)}
                            </code>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>
    </Page>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 6,
  border: '1px solid var(--border, #2a2a35)',
  background: 'var(--bg-secondary, #11111a)',
  color: 'var(--text-primary, #fff)', fontSize: 13,
};
