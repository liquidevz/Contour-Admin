/**
 * DeliveryQueue — cross-campaign view of failed notification deliveries.
 *
 * Admins can select rows and bulk-retry. Also surfaces rows that are
 * already eligible for automatic retry (next_retry_at <= now), so an
 * operator can decide between waiting for the cron and forcing the
 * issue now.
 *
 * Backed by admin_get_failed_deliveries + admin_bulk_retry_deliveries
 * (migration 036).
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Inbox, RefreshCw, RotateCw, AlertTriangle, Clock } from 'lucide-react';

interface FailedRow {
  id:             string;
  campaign_id:    string;
  campaign_title: string | null;
  user_id:        string;
  platform:       string;
  attempt:        number;
  error:          string | null;
  next_retry_at:  string | null;
  queued_at:      string;
  sent_at:        string | null;
}

export default function DeliveryQueue() {
  const [rows, setRows]   = useState<FailedRow[]>([]);
  const [loading, setLd]  = useState(true);
  const [readyOnly, setRO] = useState(false);
  const [selected, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy]   = useState(false);

  async function load() {
    setLd(true);
    const { data, error } = await supabase.rpc('admin_get_failed_deliveries', {
      p_lim: 500, p_ready: readyOnly,
    });
    if (error) console.warn('[DeliveryQueue] load', error);
    setRows((data as FailedRow[]) || []);
    setSel(new Set());
    setLd(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [readyOnly]);

  async function retrySelected() {
    if (selected.size === 0) return;
    if (!confirm(`Re-queue ${selected.size} delivery(s)?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_bulk_retry_deliveries', {
      p_ids: Array.from(selected),
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    alert(`${data ?? 0} delivery(s) re-queued.`);
    await load();
  }

  async function retryAllVisible() {
    if (rows.length === 0) return;
    if (!confirm(`Re-queue all ${rows.length} visible delivery(s)?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_bulk_retry_deliveries', {
      p_ids: rows.map(r => r.id),
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    alert(`${data ?? 0} delivery(s) re-queued.`);
    await load();
  }

  function toggle(id: string) {
    setSel(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === rows.length) setSel(new Set());
    else setSel(new Set(rows.map(r => r.id)));
  }

  // Group by error message for a quick triage hint
  const errorGroups = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = (r.error ?? '(no error)').slice(0, 80);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [rows]);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><Inbox size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Delivery Queue</h1>
            <p>Cross-campaign view of failed pushes. Auto-retry runs via cron (<code>admin_retry_failed_deliveries</code>); use this page to force the issue.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`tab-btn ${readyOnly ? 'active' : ''}`}
              onClick={() => setRO(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6,
                color: readyOnly ? '#F59E0B' : undefined,
                borderColor: readyOnly ? '#F59E0B' : undefined }}
              title="Show only rows whose next_retry_at is in the past">
              <Clock size={14} /> Ready to retry
            </button>
            <button className="btn btn-ghost" onClick={() => void load()}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Triage strip */}
      {errorGroups.length > 0 && (
        <div style={{
          padding: 12, borderRadius: 6, marginBottom: 16,
          background: 'var(--bg-secondary, #11111a)',
          border: '1px solid var(--border, #2a2a35)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Top errors in visible queue
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {errorGroups.map(([msg, count]) => (
              <span key={msg} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', borderRadius: 4,
                background: 'rgba(255,91,107,0.08)',
                border: '1px solid rgba(255,91,107,0.25)',
                color: '#ff5b6b', fontSize: 11, fontFamily: 'monospace',
              }} title={msg}>
                <AlertTriangle size={11} />
                {msg.slice(0, 40)}{msg.length > 40 ? '…' : ''}
                <strong style={{ marginLeft: 4 }}>{count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" disabled={selected.size === 0 || busy}
          onClick={() => void retrySelected()}>
          <RotateCw size={12} /> Retry selected ({selected.size})
        </button>
        <button className="btn btn-ghost btn-sm" disabled={rows.length === 0 || busy}
          onClick={() => void retryAllVisible()}>
          <RotateCw size={12} /> Retry all visible ({rows.length})
        </button>
      </div>

      <div className="data-card">
        {loading ? <div className="loading-state"><div className="spinner" /></div>
          : rows.length === 0
            ? <div className="empty-state">
                <div className="empty-state-icon"><Inbox size={24} /></div>
                <h3>Queue is empty</h3>
                <p>No failed deliveries match the current filters.</p>
              </div>
            : (
              <div className="data-table-wrap" style={{ maxHeight: 640, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 24 }}>
                        <input type="checkbox"
                          checked={selected.size === rows.length && rows.length > 0}
                          onChange={toggleAll} />
                      </th>
                      <th>Campaign</th>
                      <th>User</th>
                      <th>Platform</th>
                      <th>Attempt</th>
                      <th>Error</th>
                      <th>Next retry</th>
                      <th>Queued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const ready = r.next_retry_at != null && new Date(r.next_retry_at) <= new Date();
                      return (
                        <tr key={r.id}>
                          <td onClick={e => e.stopPropagation()}>
                            <input type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggle(r.id)} />
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {r.campaign_title || <code>{r.campaign_id.slice(0, 8)}</code>}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                            {r.user_id.slice(0, 8)}
                          </td>
                          <td style={{ fontSize: 11 }}>{r.platform}</td>
                          <td style={{ fontSize: 11, fontWeight: 600 }}>{r.attempt}</td>
                          <td style={{ fontSize: 11, color: '#ff5b6b', maxWidth: 280,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={r.error || ''}>
                            {r.error || '—'}
                          </td>
                          <td style={{ fontSize: 11 }}>
                            {r.next_retry_at
                              ? <span style={{ color: ready ? '#F59E0B' : 'var(--text-muted)' }}>
                                  {new Date(r.next_retry_at).toLocaleString()}
                                  {ready && ' ← ready'}
                                </span>
                              : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {new Date(r.queued_at).toLocaleString()}
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
  );
}
