import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BarChart3, AlertTriangle, Activity, Search as SearchIcon, TrendingUp } from 'lucide-react';

export default function Analytics() {
  const [activeTab, setActiveTab] = useState<'events' | 'errors' | 'performance' | 'search'>('events');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => { loadTab(activeTab); }, [activeTab]);

  async function loadTab(tab: string) {
    setLoading(true);
    let result: any = {};

    switch (tab) {
      case 'events': {
        const [dau, topEvents] = await Promise.all([
          supabase.rpc('admin_get_dau', { days_back: 30 }),
          supabase.rpc('admin_get_top_events', { days_back: 7, lim: 20 }),
        ]);
        result = { dau: dau.data || [], topEvents: topEvents.data || [] };
        break;
      }
      case 'errors': {
        const [summary, recent] = await Promise.all([
          supabase.rpc('admin_get_error_summary', { days_back: 7 }),
          supabase.rpc('admin_get_recent_errors', { lim: 30 }),
        ]);
        result = { summary: summary.data || [], recent: recent.data || [] };
        break;
      }
      case 'performance': {
        const { data: perf } = await supabase.rpc('admin_get_perf_summary', { days_back: 7 });
        result = { perf: perf || [] };
        break;
      }
      case 'search': {
        const { data: searchData } = await supabase.rpc('admin_get_search_analytics', { days_back: 7 });
        result = { search: searchData || [] };
        break;
      }
    }

    setData(result);
    setLoading(false);
  }

  const tabs = [
    { key: 'events', label: 'Events', icon: Activity },
    { key: 'errors', label: 'Errors', icon: AlertTriangle },
    { key: 'performance', label: 'Performance', icon: TrendingUp },
    { key: 'search', label: 'Search', icon: SearchIcon },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Platform usage, errors, performance, and search analytics</p>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.key} className={`tab-btn ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key as any)}>
            <span className="flex-center gap-sm"><t.icon size={14} /> {t.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : activeTab === 'events' ? (
        <div className="two-col-grid">
          {/* DAU */}
          <div className="data-card">
            <div className="data-card-header">
              <span className="data-card-title">Daily Active Users (30d)</span>
            </div>
            {data?.dau?.length === 0 ? (
              <div className="empty-state"><h3>No event data</h3></div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Active Users</th></tr></thead>
                  <tbody>
                    {data?.dau?.map((row: any, i: number) => (
                      <tr key={i}>
                        <td style={{ whiteSpace: 'nowrap' }}>{row.day}</td>
                        <td style={{ fontWeight: 600 }}>{row.active_users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top Events */}
          <div className="data-card">
            <div className="data-card-header">
              <span className="data-card-title">Top Events (7d)</span>
            </div>
            {data?.topEvents?.length === 0 ? (
              <div className="empty-state"><h3>No events</h3></div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Event</th><th>Count</th><th>Unique Users</th></tr></thead>
                  <tbody>
                    {data?.topEvents?.map((row: any, i: number) => (
                      <tr key={i}>
                        <td className="mono" style={{ fontWeight: 550 }}>{row.event_name}</td>
                        <td style={{ fontWeight: 600 }}>{row.event_count}</td>
                        <td>{row.unique_users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'errors' ? (
        <div>
          {/* Error Summary */}
          <div className="data-card mb-md">
            <div className="data-card-header">
              <span className="data-card-title"><AlertTriangle size={16} /> Error Summary (7d)</span>
            </div>
            {data?.summary?.length === 0 ? (
              <div className="empty-state"><h3>No errors — great!</h3><p>No errors recorded in the last 7 days</p></div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Error Name</th><th>Occurrences</th><th>Affected Users</th><th>Latest</th></tr></thead>
                  <tbody>
                    {data?.summary?.map((row: any, i: number) => (
                      <tr key={i}>
                        <td className="mono" style={{ fontWeight: 550, color: 'var(--status-error)' }}>{row.error_name}</td>
                        <td style={{ fontWeight: 600 }}>{row.occurrences}</td>
                        <td>{row.affected_users}</td>
                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                          {new Date(row.latest).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Errors */}
          <div className="data-card">
            <div className="data-card-header">
              <span className="data-card-title">Recent Errors</span>
              <span className="data-card-count">{data?.recent?.length || 0}</span>
            </div>
            {data?.recent?.length > 0 && (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Error</th><th>Message</th><th>Platform</th><th>Version</th><th>Time</th></tr></thead>
                  <tbody>
                    {data?.recent?.slice(0, 20).map((row: any) => (
                      <tr key={row.id}>
                        <td className="mono" style={{ fontWeight: 550, color: 'var(--status-error)' }}>{row.error_name}</td>
                        <td className="text-truncate" style={{ maxWidth: 250 }}>{row.error_message}</td>
                        <td><span className="tag-chip">{row.platform || '—'}</span></td>
                        <td className="mono" style={{ fontSize: '0.78rem' }}>{row.app_version || '—'}</td>
                        <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'performance' ? (
        <div className="data-card">
          <div className="data-card-header">
            <span className="data-card-title"><TrendingUp size={16} /> API Performance (7d)</span>
          </div>
          {data?.perf?.length === 0 ? (
            <div className="empty-state"><h3>No performance data</h3><p>No API calls recorded</p></div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Endpoint</th><th>Avg (ms)</th><th>P95 (ms)</th><th>Total Calls</th><th>Error Rate</th></tr></thead>
                <tbody>
                  {data?.perf?.map((row: any, i: number) => (
                    <tr key={i}>
                      <td className="mono" style={{ fontWeight: 550 }}>{row.endpoint}</td>
                      <td style={{ fontWeight: 600 }}>{row.avg_ms}</td>
                      <td>{row.p95_ms}</td>
                      <td>{row.total_calls}</td>
                      <td>
                        <span className={`badge ${+row.error_rate > 5 ? 'badge-error' : +row.error_rate > 1 ? 'badge-warning' : 'badge-success'}`}>
                          {row.error_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="data-card">
          <div className="data-card-header">
            <span className="data-card-title"><SearchIcon size={16} /> Search Analytics (7d)</span>
          </div>
          {data?.search?.length === 0 ? (
            <div className="empty-state"><h3>No search data</h3><p>No searches recorded</p></div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Searches</th><th>Avg Results</th><th>Zero-Result %</th><th>Avg Time (ms)</th></tr></thead>
                <tbody>
                  {data?.search?.map((row: any, i: number) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{row.day}</td>
                      <td style={{ fontWeight: 600 }}>{row.total_searches}</td>
                      <td>{row.avg_results}</td>
                      <td>
                        <span className={`badge ${+row.zero_result_pct > 30 ? 'badge-error' : +row.zero_result_pct > 10 ? 'badge-warning' : 'badge-success'}`}>
                          {row.zero_result_pct}%
                        </span>
                      </td>
                      <td>{row.avg_time_ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
