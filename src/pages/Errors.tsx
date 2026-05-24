/**
 * Errors — grouped error monitor backed by app_error_logs.
 *
 * Two views in one page: a grouped header (counts by error_name) and
 * a drill-down list of recent occurrences for the selected group.
 * Use this to triage app crashes / silent failures without leaving
 * the admin panel.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  AlertTriangle, RefreshCw, X, ChevronRight, Users, Clock,
} from 'lucide-react';
import Page from '../components/ui/Page';

interface ErrorGroup {
  error_name:     string;
  occurrences:    number;
  affected_users: number;
  last_seen:      string;
  first_seen:     string;
  sample_message: string | null;
}

interface ErrorOccurrence {
  id:            string;
  user_id:       string | null;
  session_id:    string | null;
  device_id:     string | null;
  error_message: string | null;
  stack_trace:   string | null;
  metadata:      Record<string, unknown>;
  app_version:   string | null;
  build_number:  string | null;
  platform:      string | null;
  created_at:    string;
}

export default function Errors() {
  const [days, setDays]       = useState(7);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups]   = useState<ErrorGroup[]>([]);
  const [selected, setSelected] = useState<ErrorGroup | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_get_error_groups', {
      p_days_back: days, p_lim: 200,
    });
    if (error) console.warn('[Errors] load', error);
    setGroups((data as ErrorGroup[]) || []);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [days]);

  return (
    <Page
      title="Errors"
      subtitle="Crashes and silent failures from the mobile app, grouped by error name. Click any row to inspect individual occurrences and stack traces."
      icon={<AlertTriangle size={20} />}
      actions={
        <>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="select-field">
            <option value={1}>Last 24h</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="btn btn-ghost" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </>
      }
    >

      <div className="data-card">
        <div className="data-card-header">
          <span className="data-card-title">Error groups</span>
        </div>
        {loading ? <div className="loading-state"><div className="spinner" /></div>
          : groups.length === 0
            ? <div className="empty-state">
                <div className="empty-state-icon"><AlertTriangle size={24} /></div>
                <h3>No errors in this window</h3>
                <p>The app is quiet, or telemetry is disabled.</p>
              </div>
            : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Error</th>
                      <th><Users size={11} style={{ verticalAlign: 'middle' }} /> Users</th>
                      <th>Occurrences</th>
                      <th><Clock size={11} style={{ verticalAlign: 'middle' }} /> Last seen</th>
                      <th>Sample</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => (
                      <tr key={g.error_name} onClick={() => setSelected(g)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>
                          {g.error_name}
                        </td>
                        <td>{g.affected_users}</td>
                        <td style={{ fontWeight: 600 }}>{g.occurrences}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(g.last_seen).toLocaleString()}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 320,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={g.sample_message || ''}>
                          {g.sample_message || '—'}
                        </td>
                        <td><ChevronRight size={14} style={{ opacity: 0.5 }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>

      {selected && (
        <OccurrencesModal group={selected} onClose={() => setSelected(null)} />
      )}
    </Page>
  );
}

function OccurrencesModal({ group, onClose }: { group: ErrorGroup; onClose: () => void }) {
  const [rows, setRows]   = useState<ErrorOccurrence[]>([]);
  const [loading, setLd]  = useState(true);
  const [expanded, setEx] = useState<string | null>(null);

  async function load() {
    setLd(true);
    const { data, error } = await supabase.rpc('admin_get_error_occurrences', {
      p_error_name: group.error_name, p_lim: 200,
    });
    if (error) console.warn('[Errors] occurrences', error);
    setRows((data as ErrorOccurrence[]) || []);
    setLd(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [group.error_name]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 920 }}>
        <div className="modal-header">
          <h2>
            <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            <span style={{ fontFamily: 'monospace' }}>{group.error_name}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 10, fontWeight: 400 }}>
              {group.occurrences} occurrences · {group.affected_users} users
            </span>
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {loading ? <div className="loading-state"><div className="spinner" /></div>
            : rows.length === 0
              ? <div className="empty-state"><h3>No occurrences</h3></div>
              : (
                <div className="data-table-wrap" style={{ maxHeight: 540, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>When</th><th>User</th><th>Session</th>
                        <th>App</th><th>Platform</th><th>Message</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <>
                          <tr key={r.id} onClick={() => setEx(expanded === r.id ? null : r.id)}
                            style={{ cursor: 'pointer' }}>
                            <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {new Date(r.created_at).toLocaleString()}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                              {r.user_id ? r.user_id.slice(0, 8) : '—'}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                              {r.session_id ? r.session_id.slice(0, 8) : '—'}
                            </td>
                            <td style={{ fontSize: 11 }}>
                              {r.app_version}{r.build_number ? ` (${r.build_number})` : ''}
                            </td>
                            <td style={{ fontSize: 11 }}>{r.platform || '—'}</td>
                            <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 280,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.error_message || '—'}
                            </td>
                            <td>
                              <ChevronRight size={14} style={{
                                opacity: 0.5,
                                transform: expanded === r.id ? 'rotate(90deg)' : 'none',
                                transition: 'transform 0.15s',
                              }} />
                            </td>
                          </tr>
                          {expanded === r.id && (
                            <tr key={`${r.id}-detail`}>
                              <td colSpan={7} style={{ background: 'var(--bg-primary, #0a0a0f)', padding: 12 }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Stack trace</div>
                                <pre style={{
                                  fontSize: 11, color: 'var(--text-primary)', maxHeight: 240,
                                  overflow: 'auto', padding: 8, borderRadius: 4,
                                  background: 'var(--bg-secondary, #11111a)',
                                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                }}>
                                  {r.stack_trace || '(no stack trace)'}
                                </pre>
                                {Object.keys(r.metadata || {}).length > 0 && (
                                  <>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '10px 0 6px' }}>Metadata</div>
                                    <pre style={{
                                      fontSize: 11, color: 'var(--text-primary)', maxHeight: 200,
                                      overflow: 'auto', padding: 8, borderRadius: 4,
                                      background: 'var(--bg-secondary, #11111a)',
                                    }}>
                                      {JSON.stringify(r.metadata, null, 2)}
                                    </pre>
                                  </>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
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
