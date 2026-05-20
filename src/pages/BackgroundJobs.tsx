/**
 * BackgroundJobs — pg_cron job monitor.
 *
 * Reads cron.job + the latest cron.job_run_details row per job
 * (via admin_get_cron_jobs) so an operator can see whether the
 * scheduled jobs are firing — drain-scheduled-campaigns,
 * retry-failed-deliveries, reconcile-push-receipts (see migration
 * 031 §5). Failed runs surface their return_message inline.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Cog, RefreshCw, CheckCircle2, AlertTriangle, Pause } from 'lucide-react';

interface Job {
  jobid:         number;
  jobname:       string | null;
  schedule:      string;
  command:       string;
  active:        boolean;
  last_run_at:   string | null;
  last_status:   string | null;
  last_duration: string | null;
  last_message:  string | null;
}

export default function BackgroundJobs() {
  const [rows, setRows]   = useState<Job[]>([]);
  const [loading, setLd]  = useState(true);
  const [err, setErr]     = useState<string | null>(null);

  async function load() {
    setLd(true);
    setErr(null);
    const { data, error } = await supabase.rpc('admin_get_cron_jobs');
    if (error) setErr(error.message);
    setRows((data as Job[]) || []);
    setLd(false);
  }
  useEffect(() => { void load(); }, []);

  const counts = rows.reduce((acc, r) => {
    const k = (r.last_status ?? 'never').toLowerCase();
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><Cog size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Background Jobs</h1>
            <p>pg_cron jobs and their last run. Recommended cadence is in migration 031 §5.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Status strip */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      }}>
        <Stat label="Jobs" value={rows.length} />
        <Stat label="Succeeded" value={counts.succeeded ?? 0} accent="#14B8A6" />
        <Stat label="Failed" value={counts.failed ?? 0} accent={counts.failed ? '#ff5b6b' : undefined} />
        <Stat label="Never run" value={counts.never ?? 0} accent="#9a9aae" />
      </div>

      {err && (
        <div style={{
          padding: 12, borderRadius: 6, marginBottom: 16,
          background: 'rgba(255,91,107,0.08)',
          border: '1px solid rgba(255,91,107,0.25)',
          color: '#ff5b6b', fontSize: 13,
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <AlertTriangle size={14} style={{ marginTop: 2 }} />
          <div>
            <strong>{err}</strong>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
              If pg_cron is not enabled on your project, no jobs will appear here.
              The retry / drain / reconcile cadence can also run from external cron — see migration 031 §5.
            </div>
          </div>
        </div>
      )}

      <div className="data-card">
        {loading ? <div className="loading-state"><div className="spinner" /></div>
          : rows.length === 0
            ? <div className="empty-state">
                <div className="empty-state-icon"><Cog size={24} /></div>
                <h3>No cron jobs registered</h3>
                <p>Register the recommended jobs via migration 031 §5 to enable retries + receipt reconciliation.</p>
              </div>
            : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>State</th>
                      <th>Job</th>
                      <th>Schedule</th>
                      <th>Last status</th>
                      <th>Last run</th>
                      <th>Duration</th>
                      <th>Last message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(j => (
                      <tr key={j.jobid}>
                        <td>
                          {!j.active ? <Badge color="#9a9aae"><Pause size={11} /> paused</Badge>
                            : j.last_status === 'succeeded' ? <Badge color="#14B8A6"><CheckCircle2 size={11} /> active</Badge>
                            : j.last_status === 'failed'    ? <Badge color="#ff5b6b"><AlertTriangle size={11} /> failing</Badge>
                            : <Badge color="#9a9aae">idle</Badge>}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>
                          {j.jobname || `job#${j.jobid}`}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{j.schedule}</td>
                        <td style={{ fontSize: 12, color: j.last_status === 'failed' ? '#ff5b6b' : undefined }}>
                          {j.last_status || '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {j.last_run_at ? new Date(j.last_run_at).toLocaleString() : '—'}
                        </td>
                        <td style={{ fontSize: 11 }}>{j.last_duration || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 320,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={j.last_message || ''}>
                          {j.last_message || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      background: 'var(--bg-secondary, #11111a)',
      border: '1px solid var(--border, #2a2a35)',
      borderRadius: 8, padding: 14,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? 'var(--text-primary, #fff)' }}>
        {value}
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: `${color}22`, color,
    }}>{children}</span>
  );
}
