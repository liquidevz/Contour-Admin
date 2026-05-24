import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Page from '../components/ui/Page';
import {
  CloudDownload,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Hourglass,
  Layers,
} from 'lucide-react';

/**
 * Stallion is hosted at https://stallion.cli.rocks/ — releases are pushed
 * from the CLI ( `npx stallion release ...` ) and the dashboard there owns
 * rollout gating.  This page is the *consumer-side* view: how that rollout
 * is actually performing on devices, using the ota.* events that the app
 * emits on every check / download / apply / failure.
 */

interface Summary {
  window_days: number;
  checks: number;
  available_seen: number;
  downloaded: number;
  applied: number;
  deferred: number;
  failed: number;
  unique_users_applied: number;
}

interface VersionRow {
  app_version: string;
  applied: number;
  available_seen: number;
  failed: number;
  unique_users: number;
}

interface FailureRow {
  id: string;
  user_id: string | null;
  app_version: string | null;
  platform: string | null;
  stage: string | null;
  error: string | null;
  provider: string | null;
  created_at: string;
}

const STALLION_DASHBOARD =
  (import.meta as unknown as { env?: { VITE_STALLION_DASHBOARD?: string } }).env
    ?.VITE_STALLION_DASHBOARD || 'https://stallion.cli.rocks/';

export default function OtaReleases() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byVersion, setByVersion] = useState<VersionRow[]>([]);
  const [failures, setFailures] = useState<FailureRow[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [sum, ver, fail] = await Promise.all([
        supabase.rpc('admin_get_ota_summary', { days_back: days }),
        supabase.rpc('admin_get_ota_by_version', { days_back: 30 }),
        supabase.rpc('admin_get_ota_failures', { lim: 50 }),
      ]);
      setSummary((sum.data as Summary) || null);
      setByVersion((ver.data as VersionRow[]) || []);
      setFailures((fail.data as FailureRow[]) || []);
    } catch (err) {
      console.error('[OtaReleases] load failed', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const adoption = summary && summary.available_seen > 0
    ? (summary.applied / summary.available_seen) * 100
    : 0;

  return (
    <Page
      title="OTA Releases"
      subtitle="Stallion-powered over-the-air JS bundle releases. New bundles ship to users without an app-store update — track adoption and failures here."
      icon={<CloudDownload size={20} />}
    >

      {/* ── Window picker + dashboard link ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {[1, 7, 14, 30].map((d) => (
          <button
            key={d}
            className={`tab-btn ${days === d ? 'active' : ''}`}
            onClick={() => setDays(d)}
          >
            {d === 1 ? '24h' : `${d}d`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          className="tab-btn"
          onClick={() => void load()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <a
          href={STALLION_DASHBOARD}
          target="_blank"
          rel="noreferrer"
          className="tab-btn"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <ExternalLink size={14} /> Stallion dashboard
        </a>
      </div>

      {loading && !summary ? (
        <div className="loading-state">
          <div className="spinner" />
        </div>
      ) : !summary ? (
        <div className="empty-state">
          <h3>No OTA events yet</h3>
          <p>
            Once your app is in production, every check / download / apply / failure flows here.
          </p>
        </div>
      ) : (
        <>
          {/* ── Summary cards ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <StatCard
              icon={<Hourglass size={16} />}
              label="Checks"
              value={summary.checks}
            />
            <StatCard
              icon={<CloudDownload size={16} />}
              label="Updates seen"
              value={summary.available_seen}
            />
            <StatCard
              icon={<CheckCircle2 size={16} />}
              label="Applied"
              value={summary.applied}
              accent="success"
            />
            <StatCard
              icon={<Hourglass size={16} />}
              label="Deferred"
              value={summary.deferred}
            />
            <StatCard
              icon={<AlertTriangle size={16} />}
              label="Failed"
              value={summary.failed}
              accent={summary.failed > 0 ? 'danger' : undefined}
            />
            <StatCard
              icon={<CheckCircle2 size={16} />}
              label="Unique users updated"
              value={summary.unique_users_applied}
            />
          </div>

          {/* Adoption bar */}
          <div className="data-card" style={{ marginBottom: 16 }}>
            <div className="data-card-header">
              <span className="data-card-title">Adoption rate</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted, #5a5a6e)' }}>
                {summary.applied}/{summary.available_seen} devices applied
              </span>
            </div>
            <div style={{ padding: 16 }}>
              <div
                style={{
                  height: 14,
                  borderRadius: 7,
                  background: 'var(--bg-secondary, #11111a)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(adoption, 1)}%`,
                    background:
                      adoption >= 80
                        ? 'linear-gradient(90deg, #B8F73C, #14B8A6)'
                        : 'var(--accent, #7C3AED)',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
              <div style={{ marginTop: 8, fontSize: 13 }}>
                <strong>{adoption.toFixed(1)}%</strong>{' '}
                <span style={{ color: 'var(--text-muted, #5a5a6e)' }}>
                  of devices that saw the update have applied it
                </span>
              </div>
            </div>
          </div>

          <div className="two-col-grid">
            {/* By-version table */}
            <div className="data-card">
              <div className="data-card-header">
                <span className="data-card-title">
                  <Layers size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  By app version (30d)
                </span>
              </div>
              {byVersion.length === 0 ? (
                <div className="empty-state">
                  <h3>No version data yet</h3>
                </div>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Applied</th>
                        <th>Seen</th>
                        <th>Failed</th>
                        <th>Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byVersion.map((row) => (
                        <tr key={row.app_version}>
                          <td style={{ fontFamily: 'monospace' }}>{row.app_version}</td>
                          <td style={{ fontWeight: 600 }}>{row.applied}</td>
                          <td>{row.available_seen}</td>
                          <td
                            style={{
                              color:
                                row.failed > 0 ? 'var(--danger, #ff5b6b)' : undefined,
                            }}
                          >
                            {row.failed}
                          </td>
                          <td>{row.unique_users}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent failures */}
            <div className="data-card">
              <div className="data-card-header">
                <span className="data-card-title">
                  <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  Recent failures
                </span>
              </div>
              {failures.length === 0 ? (
                <div className="empty-state">
                  <h3>No failures recorded 🎉</h3>
                </div>
              ) : (
                <div className="data-table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Version</th>
                        <th>Stage</th>
                        <th>Provider</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failures.map((f) => (
                        <tr key={f.id}>
                          <td
                            style={{
                              whiteSpace: 'nowrap',
                              fontSize: 11,
                              color: 'var(--text-muted, #5a5a6e)',
                            }}
                          >
                            {new Date(f.created_at).toLocaleString()}
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                            {f.app_version || '—'}
                          </td>
                          <td>{f.stage || '—'}</td>
                          <td>{f.provider || '—'}</td>
                          <td
                            style={{
                              fontSize: 11,
                              color: 'var(--text-muted, #8a8a9e)',
                              maxWidth: 220,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={f.error || ''}
                          >
                            {f.error || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <ReleaseHealth />
    </Page>
  );
}

// ─── Release Health (OP-01) ──────────────────────────────────
// Joins app_version across user_events + app_error_logs over the
// last 30 days so a bad release stands out by error rate even if
// the OTA-specific tables don't have a clean release-id link.

interface ReleaseHealthRow {
  app_version: string;
  events:      number;
  users:       number;
  errors:      number;
  error_rate:  number;
  first_seen:  string;
  last_seen:   string;
}

function ReleaseHealth() {
  const [rows, setRows]  = useState<ReleaseHealthRow[]>([]);
  const [loading, setLd] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc('admin_get_release_health', {
        p_days_back: 30, p_lim: 50,
      });
      if (error) console.warn('[ReleaseHealth] load', error);
      setRows((data as ReleaseHealthRow[]) || []);
      setLd(false);
    })();
  }, []);

  return (
    <div className="data-card" style={{ marginTop: 16 }}>
      <div className="data-card-header">
        <span className="data-card-title">Release health — last 30 days</span>
      </div>
      {loading ? <div className="loading-state"><div className="spinner" /></div>
        : rows.length === 0 ? <div className="empty-state"><h3>No version data</h3></div>
        : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>App version</th>
                  <th>Events</th>
                  <th>Users</th>
                  <th>Errors</th>
                  <th>Error rate</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const rate = Number(r.error_rate) * 100;
                  const hot = rate > 5;
                  return (
                    <tr key={r.app_version}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{r.app_version}</td>
                      <td>{r.events}</td>
                      <td>{r.users}</td>
                      <td style={{ color: r.errors > 0 ? '#F59E0B' : undefined }}>{r.errors}</td>
                      <td style={{ color: hot ? '#ff5b6b' : rate > 1 ? '#F59E0B' : '#14B8A6', fontWeight: 600 }}>
                        {rate.toFixed(2)}%
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(r.last_seen).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: 'success' | 'danger';
}) {
  const color =
    accent === 'danger'
      ? 'var(--danger, #ff5b6b)'
      : accent === 'success'
        ? 'var(--success, #14B8A6)'
        : 'var(--text-primary, #fff)';
  return (
    <div
      style={{
        background: 'var(--bg-secondary, #11111a)',
        border: '1px solid var(--border, #2a2a35)',
        borderRadius: 8,
        padding: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--text-muted, #5a5a6e)',
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value.toLocaleString()}</div>
    </div>
  );
}
