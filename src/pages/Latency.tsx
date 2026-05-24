/**
 * Latency — P50 / P95 / P99 per app endpoint.
 *
 * Backed by admin_get_perf_percentiles (migration 037 §2). Data
 * source is app_performance_logs — anything the app calls
 * `logPerformance(endpoint, durationMs)` on shows up here.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Gauge, RefreshCw, AlertTriangle } from 'lucide-react';
import Page from '../components/ui/Page';

interface Row {
  endpoint:      string;
  call_count:    number;
  success_count: number;
  p50_ms:        number | null;
  p95_ms:        number | null;
  p99_ms:        number | null;
  max_ms:        number | null;
  slow_count:    number;
}

export default function Latency() {
  const [hours, setHours] = useState(24);
  const [rows, setRows]   = useState<Row[]>([]);
  const [loading, setLd]  = useState(true);

  async function load() {
    setLd(true);
    const { data, error } = await supabase.rpc('admin_get_perf_percentiles', {
      p_hours: hours, p_lim: 200,
    });
    if (error) console.warn('[Latency] load', error);
    setRows((data as Row[]) || []);
    setLd(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [hours]);

  const totals = useMemo(() => {
    const calls = rows.reduce((s, r) => s + Number(r.call_count), 0);
    const slow  = rows.reduce((s, r) => s + Number(r.slow_count), 0);
    const succ  = rows.reduce((s, r) => s + Number(r.success_count), 0);
    return { calls, slow, succ, errorRate: calls ? 1 - succ / calls : 0 };
  }, [rows]);

  const max = useMemo(() => {
    return rows.reduce((m, r) => Math.max(m, Number(r.p95_ms ?? 0)), 0);
  }, [rows]);

  return (
    <Page
      title="Latency"
      subtitle="How fast each endpoint responds for our users. P95 and P99 are the experience of slow users — those are what to watch."
      icon={<Gauge size={20} />}
      actions={
        <>
          {[1, 6, 24, 72, 168].map(h => (
            <button key={h}
              className={`tab-btn ${hours === h ? 'active' : ''}`}
              onClick={() => setHours(h)}>
              {h < 24 ? `${h}h` : `${Math.round(h/24)}d`}
            </button>
          ))}
          <button className="btn btn-ghost" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </>
      }
    >
      {/* Summary strip */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      }}>
        <Stat label="Total calls" value={totals.calls.toLocaleString()} />
        <Stat label="Slow (>1s)"  value={totals.slow.toLocaleString()}
          accent={totals.slow > 0 ? '#F59E0B' : undefined} />
        <Stat label="Endpoints"   value={String(rows.length)} />
        <Stat label="Error rate"
          value={`${(totals.errorRate * 100).toFixed(2)}%`}
          accent={totals.errorRate > 0.01 ? '#ff5b6b' : '#14B8A6'} />
      </div>

      <div className="data-card">
        {loading ? <div className="loading-state"><div className="spinner" /></div>
          : rows.length === 0
            ? <div className="empty-state">
                <div className="empty-state-icon"><Gauge size={24} /></div>
                <h3>No performance data</h3>
                <p>Have the app call <code>logPerformance(endpoint, durationMs)</code> to populate this view.</p>
              </div>
            : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Calls</th>
                      <th>P50</th>
                      <th>P95</th>
                      <th>P99</th>
                      <th>Max</th>
                      <th>Slow</th>
                      <th>Errors</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const p95 = Number(r.p95_ms ?? 0);
                      const barWidth = max > 0 ? Math.max((p95 / max) * 100, 2) : 0;
                      const errorRate = r.call_count > 0 ? 1 - r.success_count / r.call_count : 0;
                      return (
                        <tr key={r.endpoint}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.endpoint}</td>
                          <td>{r.call_count}</td>
                          <td>{fmt(r.p50_ms)}</td>
                          <td style={{ fontWeight: 600,
                            color: p95 > 1000 ? '#ff5b6b' : p95 > 500 ? '#F59E0B' : undefined }}>
                            {fmt(r.p95_ms)}
                          </td>
                          <td>{fmt(r.p99_ms)}</td>
                          <td>{fmt(r.max_ms)}</td>
                          <td style={{ color: r.slow_count > 0 ? '#F59E0B' : undefined }}>
                            {r.slow_count}
                          </td>
                          <td style={{ color: errorRate > 0.01 ? '#ff5b6b' : undefined }}>
                            {(errorRate * 100).toFixed(2)}%
                          </td>
                          <td style={{ minWidth: 100 }}>
                            <div style={{
                              height: 6, borderRadius: 3,
                              background: 'var(--bg-secondary, #11111a)', overflow: 'hidden',
                            }}>
                              <div style={{
                                height: '100%', width: `${barWidth}%`,
                                background: p95 > 1000 ? '#ff5b6b' : p95 > 500 ? '#F59E0B' : 'var(--accent, #7C3AED)',
                                transition: 'width 0.4s ease',
                              }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </Page>
  );
}

function fmt(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      background: 'var(--bg-secondary, #11111a)',
      border: '1px solid var(--border, #2a2a35)',
      borderRadius: 8, padding: 14,
    }}>
      <div style={{
        fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {label === 'Slow (>1s)' && <AlertTriangle size={11} />}
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? 'var(--text-primary, #fff)' }}>
        {value}
      </div>
    </div>
  );
}
