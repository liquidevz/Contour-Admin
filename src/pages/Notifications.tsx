import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bell, Send, Plus, X, RefreshCw, Users, CheckCircle2, AlertTriangle,
  Clock, MousePointerClick, Inbox,
} from 'lucide-react';

interface Stats {
  window_days: number;
  campaigns_sent: number;
  campaigns_pending: number;
  campaigns_failed: number;
  total_delivered: number;
  total_failed: number;
  active_tokens: number;
  active_users: number;
  opens_in_window: number;
  received_in_window: number;
}

interface Campaign {
  id: string;
  created_by: string | null;
  title: string;
  body: string;
  audience: 'all' | 'approved' | 'active_7d' | 'active_30d' | 'user_ids';
  user_ids: string[] | null;
  deep_link: string | null;
  data: Record<string, unknown> | null;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  scheduled_for: string | null;
  sent_at: string | null;
  recipients_count: number;
  delivered_count: number;
  failed_count: number;
  error: string | null;
  created_at: string;
}

type Audience = Campaign['audience'];

const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: 'all',        label: 'Everyone',          hint: 'All users with a registered device' },
  { value: 'approved',   label: 'Approved users',    hint: 'Users past the waitlist' },
  { value: 'active_7d',  label: 'Active in 7 days',  hint: 'Logged any event in the last week' },
  { value: 'active_30d', label: 'Active in 30 days', hint: 'Logged any event in the last month' },
  { value: 'user_ids',   label: 'Specific user IDs', hint: 'Comma-separated UUIDs' },
];

export default function Notifications() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showComposer, setShowComposer] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        supabase.rpc('admin_get_notification_stats',     { days_back: 7 }),
        supabase.rpc('admin_get_notification_campaigns', { lim: 50 }),
      ]);
      setStats((s.data as Stats) || null);
      setCampaigns((c.data as Campaign[]) || []);
    } catch (err) {
      console.error('[Notifications] load failed', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function cancelCampaign(id: string) {
    if (!confirm('Cancel this pending campaign?')) return;
    const { error } = await supabase.rpc('admin_cancel_notification_campaign', { p_id: id });
    if (error) { alert(error.message); return; }
    await load();
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>
              <Bell size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Notifications
            </h1>
            <p>Compose and broadcast push notifications. Rollout happens via the Edge Function worker.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => void load()}>
              <RefreshCw size={14} /> Refresh
            </button>
            <button className="btn btn-primary" onClick={() => setShowComposer(true)}>
              <Plus size={16} /> New campaign
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <StatCard icon={<Users size={16} />}              label="Active devices"  value={stats.active_tokens} />
          <StatCard icon={<Users size={16} />}              label="Active users"    value={stats.active_users} />
          <StatCard icon={<Send size={16} />}               label="Sent (7d)"       value={stats.campaigns_sent} accent="success" />
          <StatCard icon={<Clock size={16} />}              label="Pending"         value={stats.campaigns_pending} />
          <StatCard icon={<Inbox size={16} />}              label="Received (7d)"   value={stats.received_in_window} />
          <StatCard icon={<MousePointerClick size={16} />}  label="Opened (7d)"     value={stats.opens_in_window} />
          <StatCard icon={<CheckCircle2 size={16} />}       label="Delivered (7d)"  value={stats.total_delivered} accent="success" />
          <StatCard icon={<AlertTriangle size={16} />}      label="Failed (7d)"     value={stats.total_failed}
                    accent={stats.total_failed > 0 ? 'danger' : undefined} />
        </div>
      )}

      {/* Campaigns table */}
      <div className="data-card">
        <div className="data-card-header">
          <span className="data-card-title">Recent campaigns</span>
        </div>
        {loading ? (
          <div className="loading-state"><div className="spinner" /></div>
        ) : campaigns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Bell size={24} /></div>
            <h3>No campaigns yet</h3>
            <p>Compose your first push notification to get started.</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Title</th>
                  <th>Audience</th>
                  <th>Recipients</th>
                  <th>Delivered</th>
                  <th>Failed</th>
                  <th>Created</th>
                  <th>Sent</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td><StatusBadge status={c.status} /></td>
                    <td style={{ maxWidth: 240 }}>
                      <div style={{ fontWeight: 600 }}>{c.title}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted, #5a5a6e)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 240,
                        }}
                        title={c.body}
                      >
                        {c.body}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {AUDIENCES.find((a) => a.value === c.audience)?.label || c.audience}
                    </td>
                    <td>{c.recipients_count}</td>
                    <td style={{ color: 'var(--success, #14B8A6)' }}>{c.delivered_count}</td>
                    <td style={{ color: c.failed_count > 0 ? 'var(--danger, #ff5b6b)' : undefined }}>
                      {c.failed_count}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted, #5a5a6e)' }}>
                      {new Date(c.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted, #5a5a6e)' }}>
                      {c.sent_at ? new Date(c.sent_at).toLocaleString() : '—'}
                    </td>
                    <td>
                      {c.status === 'pending' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => void cancelCampaign(c.id)}
                          title="Cancel pending campaign"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showComposer && (
        <Composer
          onClose={() => setShowComposer(false)}
          onSent={async () => { setShowComposer(false); await load(); }}
        />
      )}
    </div>
  );
}

// ─── Composer modal ──────────────────────────────────────────

function Composer({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [title, setTitle]         = useState('');
  const [body, setBody]           = useState('');
  const [audience, setAudience]   = useState<Audience>('all');
  const [userIdsText, setUserIds] = useState('');
  const [deepLink, setDeepLink]   = useState('');
  const [dataText, setDataText]   = useState('');
  const [scheduledFor, setSched]  = useState('');
  const [audienceCount, setCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const userIds = userIdsText
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Live audience count
  useEffect(() => {
    let cancelled = false;
    setCountLoading(true);
    void (async () => {
      const { data, error } = await supabase.rpc('admin_count_notification_audience', {
        p_audience: audience,
        p_user_ids: audience === 'user_ids' ? userIds : null,
      });
      if (cancelled) return;
      if (error) {
        console.warn('[Composer] count failed', error);
        setCount(null);
      } else {
        setCount((data as number) ?? 0);
      }
      setCountLoading(false);
    })();
    return () => { cancelled = true; };
  }, [audience, userIdsText]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.');
      return;
    }

    let parsedData: Record<string, unknown> | null = null;
    if (dataText.trim()) {
      try { parsedData = JSON.parse(dataText); }
      catch { setError('Data must be valid JSON.'); return; }
    }

    if (audience === 'user_ids' && userIds.length === 0) {
      setError('Provide at least one user ID for "Specific user IDs" audience.');
      return;
    }

    setSubmitting(true);
    const { error: rpcErr } = await supabase.rpc('admin_create_notification_campaign', {
      p_title:         title.trim(),
      p_body:          body.trim(),
      p_audience:      audience,
      p_user_ids:      audience === 'user_ids' ? userIds : null,
      p_deep_link:     deepLink.trim() || null,
      p_data:          parsedData,
      p_scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
    });
    setSubmitting(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    onSent();
  }

  const audienceHint = AUDIENCES.find((a) => a.value === audience)?.hint || '';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2>
            <Bell size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            New campaign
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="form-group mb-md">
            <label className="form-label">Title</label>
            <input
              className="input-field"
              placeholder="e.g. New matches waiting"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="form-group mb-md">
            <label className="form-label">Body</label>
            <textarea
              className="input-field"
              placeholder="A short, action-oriented message"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={300}
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="form-group mb-md">
            <label className="form-label">Audience</label>
            <select
              className="input-field"
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #5a5a6e)', marginTop: 6 }}>
              {audienceHint}
            </div>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {countLoading
                ? <span style={{ color: 'var(--text-muted, #5a5a6e)' }}>Counting…</span>
                : audienceCount === null
                  ? <span style={{ color: 'var(--danger, #ff5b6b)' }}>Could not count audience</span>
                  : <span><strong>{audienceCount.toLocaleString()}</strong> devices with this audience will receive it</span>
              }
            </div>
          </div>

          {audience === 'user_ids' && (
            <div className="form-group mb-md">
              <label className="form-label">User IDs (UUIDs, comma or whitespace separated)</label>
              <textarea
                className="input-field"
                placeholder="b3f1…  /  d2c8…"
                value={userIdsText}
                onChange={(e) => setUserIds(e.target.value)}
                rows={2}
                style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              />
            </div>
          )}

          <div className="form-group mb-md">
            <label className="form-label">Deep link (optional)</label>
            <input
              className="input-field"
              placeholder="/chat/abc123 or /(tabs)/matches"
              value={deepLink}
              onChange={(e) => setDeepLink(e.target.value)}
            />
            <div style={{ fontSize: 12, color: 'var(--text-muted, #5a5a6e)', marginTop: 6 }}>
              When users tap the notification, they'll be navigated to this path inside the app.
            </div>
          </div>

          <div className="form-group mb-md">
            <label className="form-label">Custom data (JSON, optional)</label>
            <textarea
              className="input-field"
              placeholder='{"type": "match_update", "match_id": "…"}'
              value={dataText}
              onChange={(e) => setDataText(e.target.value)}
              rows={3}
              style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Schedule for (optional, leave empty to send immediately)</label>
            <input
              className="input-field"
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setSched(e.target.value)}
            />
          </div>

          {error && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: 'rgba(255,91,107,0.08)',
                border: '1px solid var(--danger, #ff5b6b)',
                borderRadius: 6,
                fontSize: 13,
                color: 'var(--danger, #ff5b6b)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={submitting}>
            {submitting
              ? 'Creating…'
              : scheduledFor
                ? <><Clock size={14} /> Schedule</>
                : <><Send size={14} /> Send now</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Small UI bits ──────────────────────────────────────────

function StatCard({
  icon, label, value, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: 'success' | 'danger';
}) {
  const color =
    accent === 'danger'  ? 'var(--danger, #ff5b6b)' :
    accent === 'success' ? 'var(--success, #14B8A6)' :
    'var(--text-primary, #fff)';
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
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--text-muted, #5a5a6e)',
          fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {icon}{label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value.toLocaleString()}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const map: Record<Campaign['status'], { label: string; bg: string; fg: string }> = {
    pending:   { label: 'Pending',   bg: 'rgba(255,200,0,0.12)', fg: '#FFC000' },
    sending:   { label: 'Sending',   bg: 'rgba(124,58,237,0.18)', fg: '#7C3AED' },
    sent:      { label: 'Sent',      bg: 'rgba(20,184,166,0.16)', fg: '#14B8A6' },
    failed:    { label: 'Failed',    bg: 'rgba(255,91,107,0.16)', fg: '#ff5b6b' },
    cancelled: { label: 'Cancelled', bg: 'rgba(120,120,140,0.15)', fg: '#9a9aae' },
  };
  const s = map[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: s.bg,
        color: s.fg,
      }}
    >
      {s.label}
    </span>
  );
}
