/**
 * AdminSessions — who's signed into the admin panel.
 *
 * Heartbeat: AdminLayout calls admin_session_touch() on mount, every
 * 5 minutes, and on visibility return. A session is "active" if it
 * has no ended_at and was touched within 30 minutes.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, RefreshCw, Circle } from 'lucide-react';

interface Session {
  id:          string;
  admin_id:    string;
  admin_email: string | null;
  admin_role:  string | null;
  user_agent:  string | null;
  started_at:  string;
  last_seen:   string;
  ended_at:    string | null;
}

const ACTIVE_WINDOW_MS = 30 * 60_000;

export default function AdminSessions() {
  const [rows, setRows]       = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyActive, setOA]   = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_get_admin_sessions', {
      p_lim: 200, p_only_active: onlyActive,
    });
    if (error) console.warn('[AdminSessions] load', error);
    setRows((data as Session[]) || []);
    setLoading(false);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [onlyActive]);

  const isActive = (s: Session) =>
    !s.ended_at && Date.now() - new Date(s.last_seen).getTime() < ACTIVE_WINDOW_MS;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><Users size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Admin Sessions</h1>
            <p>Live signal of who is operating the admin panel. Heartbeat every 5 minutes.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`tab-btn ${onlyActive ? 'active' : ''}`}
              onClick={() => setOA(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6,
                color: onlyActive ? '#14B8A6' : undefined,
                borderColor: onlyActive ? '#14B8A6' : undefined }}>
              <Circle size={10} fill={onlyActive ? '#14B8A6' : 'transparent'} /> Active only
            </button>
            <button className="btn btn-ghost" onClick={() => void load()}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="data-card">
        <div className="data-card-header">
          <span className="data-card-title">Sessions</span>
        </div>
        {loading ? <div className="loading-state"><div className="spinner" /></div>
          : rows.length === 0 ? <div className="empty-state"><h3>No sessions</h3></div>
          : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>State</th>
                    <th>Admin</th>
                    <th>Role</th>
                    <th>User Agent</th>
                    <th>Started</th>
                    <th>Last seen</th>
                    <th>Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(s => {
                    const active = isActive(s);
                    return (
                      <tr key={s.id}>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: active ? 'rgba(20,184,166,0.16)' : 'rgba(120,120,140,0.15)',
                            color: active ? '#14B8A6' : '#9a9aae',
                          }}>
                            <Circle size={8} fill="currentColor" /> {active ? 'active' : 'idle'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{s.admin_email || s.admin_id.slice(0, 8)}</td>
                        <td style={{ fontSize: 12 }}>{s.admin_role || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 320,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={s.user_agent || ''}>
                          {s.user_agent || '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(s.started_at).toLocaleString()}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(s.last_seen).toLocaleString()}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {s.ended_at ? new Date(s.ended_at).toLocaleString() : '—'}
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
