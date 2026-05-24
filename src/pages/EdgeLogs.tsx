/**
 * EdgeLogs — structured logs from Supabase Edge Functions.
 *
 * Backed by edge_logs (migration 033 §1). Edge fns call public.log_edge()
 * via service role. This page is the queryable consumer.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Terminal, RefreshCw, AlertTriangle, Info, X } from 'lucide-react';
import Page from '../components/ui/Page';

type Level = 'debug' | 'info' | 'warn' | 'error';

interface Row {
  id:          number;
  fn:          string;
  level:       Level;
  message:     string;
  metadata:    Record<string, unknown>;
  request_id:  string | null;
  duration_ms: number | null;
  created_at:  string;
}

const LEVEL_COLOR: Record<Level, string> = {
  debug: '#9a9aae', info: '#7C3AED', warn: '#F59E0B', error: '#ff5b6b',
};

export default function EdgeLogs() {
  const [rows, setRows]   = useState<Row[]>([]);
  const [loading, setLd]  = useState(true);
  const [fn, setFn]       = useState<string>('');
  const [level, setLevel] = useState<Level | ''>('');
  const [detail, setDet]  = useState<Row | null>(null);

  async function load() {
    setLd(true);
    const { data, error } = await supabase.rpc('admin_get_edge_logs', {
      p_fn: fn || null, p_level: level || null, p_lim: 300,
    });
    if (error) console.warn('[EdgeLogs] load', error);
    setRows((data as Row[]) || []);
    setLd(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [fn, level]);

  const fns = Array.from(new Set(rows.map(r => r.fn))).sort();

  return (
    <Page
      title="Edge Logs"
      subtitle="Server-side logs from our Edge Functions. Filter by function, level, or text to triage what the backend is doing."
      icon={<Terminal size={20} />}
      actions={
        <button className="btn btn-ghost" onClick={() => void load()}>
          <RefreshCw size={14} /> Refresh
        </button>
      }
    >

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={fn} onChange={e => setFn(e.target.value)} style={selectStyle}>
          <option value="">All functions</option>
          {fns.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={level} onChange={e => setLevel(e.target.value as Level | '')} style={selectStyle}>
          <option value="">All levels</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </div>

      <div className="data-card">
        {loading ? <div className="loading-state"><div className="spinner" /></div>
          : rows.length === 0
            ? <div className="empty-state">
                <div className="empty-state-icon"><Info size={24} /></div>
                <h3>No edge logs yet</h3>
                <p>Edge functions call <code>log_edge()</code> via service role to populate this page.</p>
              </div>
            : (
              <div className="data-table-wrap" style={{ maxHeight: 640, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>When</th><th>Level</th><th>Function</th>
                      <th>Message</th><th>Dur</th><th>Request</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} onClick={() => setDet(r)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(r.created_at).toLocaleTimeString()}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: `${LEVEL_COLOR[r.level]}22`, color: LEVEL_COLOR[r.level],
                          }}>
                            {r.level === 'error' ? <AlertTriangle size={11} /> : <Info size={11} />} {r.level}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.fn}</td>
                        <td style={{ fontSize: 12, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={r.message}>
                          {r.message}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {r.duration_ms != null ? `${r.duration_ms}ms` : '—'}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>
                          {r.request_id ? r.request_id.slice(0, 8) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDet(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2>
                <span style={{ color: LEVEL_COLOR[detail.level], marginRight: 8 }}>{detail.level}</span>
                <code>{detail.fn}</code>
              </h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setDet(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {new Date(detail.created_at).toLocaleString()}{detail.request_id ? ` · req ${detail.request_id}` : ''}
              </div>
              <div style={{ fontSize: 14, marginBottom: 12 }}>{detail.message}</div>
              {Object.keys(detail.metadata || {}).length > 0 && (
                <pre style={{
                  fontSize: 12, padding: 10, borderRadius: 4,
                  background: 'var(--bg-secondary, #11111a)',
                  maxHeight: 360, overflow: 'auto',
                }}>
                  {JSON.stringify(detail.metadata, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 6,
  border: '1px solid var(--border, #2a2a35)',
  background: 'var(--bg-secondary, #11111a)',
  color: 'var(--text-primary, #fff)', fontSize: 13, minWidth: 200,
};
