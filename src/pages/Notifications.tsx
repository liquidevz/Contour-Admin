import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bell, Send, Plus, X, RefreshCw, Users, CheckCircle2, AlertTriangle,
  Clock, MousePointerClick, Inbox, Smartphone, Sparkles, AlarmClock,
  Megaphone, Heart, Beaker, Eye, RotateCw, ChevronRight,
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

// ─── Presets ─────────────────────────────────────────────────
// Click-to-fill templates that map to the same `type` keys the mobile app's
// InAppNotificationBanner recognises (message / match / reminder / etc.) so
// previews and in-app banners render with the right icon + accent.
interface Preset {
  id: string;
  label: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  type: string;
  deepLink?: string;
  audience: Audience;
}

const PRESETS: Preset[] = [
  {
    id: 'match',
    label: 'New match',
    icon: <Sparkles size={14} />,
    title: 'You have a new match 🎯',
    body: 'Someone whose wants match your offers just joined. Say hi.',
    type: 'match',
    deepLink: '/(tabs)/matches',
    audience: 'active_7d',
  },
  {
    id: 'reminder',
    label: 'Reminder nudge',
    icon: <AlarmClock size={14} />,
    title: 'Don\'t forget your tasks',
    body: 'You have pending tasks waiting. Open Contour and knock one out.',
    type: 'reminder',
    deepLink: '/tasks',
    audience: 'active_7d',
  },
  {
    id: 'announce',
    label: 'Announcement',
    icon: <Megaphone size={14} />,
    title: 'New in Contour ✨',
    body: 'We just shipped an update. Tap to see what\'s new.',
    type: 'announcement',
    audience: 'approved',
  },
  {
    id: 'reactivation',
    label: 'Win-back',
    icon: <Heart size={14} />,
    title: 'We\'ve missed you',
    body: 'New matches and messages are waiting. Come back and check them out.',
    type: 'announcement',
    deepLink: '/(tabs)',
    audience: 'active_30d',
  },
];

export default function Notifications() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showComposer, setShowComposer] = useState(false);
  const [deliveriesFor, setDeliveriesFor] = useState<Campaign | null>(null);

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
                  <tr key={c.id} onClick={() => setDeliveriesFor(c)}
                    style={{ cursor: 'pointer' }} title="Click to see per-device delivery rows">
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
                    <td onClick={e => e.stopPropagation()}>
                      {c.status === 'pending' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => void cancelCampaign(c.id)}
                          title="Cancel pending campaign"
                        >
                          <X size={14} />
                        </button>
                      )}
                      <ChevronRight size={14} style={{ opacity: 0.5, marginLeft: 4 }} />
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

      {deliveriesFor && (
        <DeliveriesModal
          campaign={deliveriesFor}
          onClose={() => setDeliveriesFor(null)}
        />
      )}
    </div>
  );
}

// ─── Deliveries drill-down ───────────────────────────────────

interface Delivery {
  id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  status: 'queued' | 'sending' | 'delivered' | 'failed' | 'opened' | 'expired';
  attempt: number;
  next_retry_at: string | null;
  provider_receipt_id: string | null;
  error: string | null;
  queued_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
}

function DeliveriesModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [rows, setRows]   = useState<Delivery[]>([]);
  const [loading, setLd]  = useState(true);
  const [filter, setFlt]  = useState<Delivery['status'] | 'all'>('all');

  async function load() {
    setLd(true);
    const { data, error } = await supabase.rpc('admin_get_campaign_deliveries', {
      p_campaign_id: campaign.id, p_lim: 1000,
    });
    if (error) console.warn('[Deliveries] load failed', error);
    setRows((data as Delivery[]) || []);
    setLd(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [campaign.id]);

  async function retry(id: string) {
    const { error } = await supabase.rpc('admin_retry_delivery', { p_id: id });
    if (error) { alert(error.message); return; }
    await load();
  }

  const filtered = filter === 'all' ? rows : rows.filter(r => r.status === filter);
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1; return acc;
  }, {});

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 920 }}>
        <div className="modal-header">
          <h2>
            <Inbox size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Deliveries
            <span style={{ fontSize: 13, color: 'var(--text-muted, #5a5a6e)', marginLeft: 10, fontWeight: 400 }}>
              {campaign.title}
            </span>
          </h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {/* Status filter chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {(['all', 'queued', 'sending', 'delivered', 'failed', 'opened', 'expired'] as const).map(s => {
              const active = filter === s;
              const n = s === 'all' ? rows.length : (counts[s] ?? 0);
              return (
                <button key={s} className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFlt(s)} style={{ fontSize: 11, padding: '4px 10px' }}>
                  {s} <span style={{ opacity: 0.7, marginLeft: 4 }}>{n}</span>
                </button>
              );
            })}
            <button className="btn btn-ghost btn-sm" onClick={() => void load()}
              style={{ marginLeft: 'auto', fontSize: 11 }}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {loading ? <div className="loading-state"><div className="spinner" /></div>
            : filtered.length === 0 ? <div className="empty-state"><h3>No delivery rows</h3>
                <p>Either the campaign has no recipients yet or it predates the deliveries pipeline.</p></div>
            : (
              <div className="data-table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Status</th><th>User</th><th>Platform</th><th>Attempt</th>
                      <th>Sent</th><th>Delivered</th><th>Receipt</th><th>Error</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(d => (
                      <tr key={d.id}>
                        <td><DeliveryBadge status={d.status} /></td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{d.user_id.slice(0, 8)}</td>
                        <td style={{ fontSize: 12 }}>{d.platform}</td>
                        <td style={{ fontSize: 12 }}>{d.attempt}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {d.sent_at ? new Date(d.sent_at).toLocaleTimeString() : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {d.delivered_at ? new Date(d.delivered_at).toLocaleTimeString() : '—'}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}
                          title={d.provider_receipt_id || ''}>
                          {d.provider_receipt_id ? d.provider_receipt_id.slice(0, 8) : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--danger, #ff5b6b)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={d.error || ''}>
                          {d.error || '—'}
                        </td>
                        <td>
                          {d.status === 'failed' && (
                            <button className="btn btn-ghost btn-sm" onClick={() => void retry(d.id)}
                              title="Re-queue this delivery">
                              <RotateCw size={12} />
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
      </div>
    </div>
  );
}

function DeliveryBadge({ status }: { status: Delivery['status'] }) {
  const map: Record<Delivery['status'], { bg: string; fg: string }> = {
    queued:    { bg: 'rgba(120,120,140,0.18)', fg: '#9a9aae' },
    sending:   { bg: 'rgba(124,58,237,0.18)',  fg: '#7C3AED' },
    delivered: { bg: 'rgba(20,184,166,0.16)',  fg: '#14B8A6' },
    failed:    { bg: 'rgba(255,91,107,0.16)',  fg: '#ff5b6b' },
    opened:    { bg: 'rgba(245,158,11,0.18)',  fg: '#F59E0B' },
    expired:   { bg: 'rgba(120,120,140,0.15)', fg: '#666' },
  };
  const s = map[status];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, background: s.bg, color: s.fg,
    }}>{status}</span>
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
  const [testSending, setTestSending] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [presetType, setPresetType] = useState<string>('announcement');
  const [previewOs, setPreviewOs] = useState<'ios' | 'android'>('ios');

  const userIds = userIdsText
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Apply a preset (one click — fills everything).
  function applyPreset(p: Preset) {
    setTitle(p.title);
    setBody(p.body);
    setAudience(p.audience);
    setDeepLink(p.deepLink ?? '');
    setPresetType(p.type);
    // Pre-fill the custom data field with the type tag so the mobile banner
    // picks the right icon when it arrives.
    setDataText(JSON.stringify({ type: p.type }, null, 2));
  }

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
    const { data: campaignId, error: rpcErr } = await supabase.rpc('admin_create_notification_campaign', {
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

    // Immediate sends are now invoked by a DB trigger
    // (notification_campaigns AFTER INSERT → send-notification-campaign).
    // Scheduled sends are drained by cron. No client-side invoke needed.
    onSent();
  }

  // Send a one-off test to the current admin only. Reuses the same campaign
  // pipeline as a real send (so we exercise the exact path) but scopes the
  // audience to just this user's UUID.
  async function sendTest() {
    setError(null);
    if (!title.trim() || !body.trim()) {
      setError('Add a title and body before sending a test.');
      return;
    }
    setTestSending(true);
    try {
      const { data: userResult, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userResult?.user) {
        setError('Could not resolve your admin user id.');
        return;
      }
      let parsedData: Record<string, unknown> | null = null;
      if (dataText.trim()) {
        try { parsedData = JSON.parse(dataText); }
        catch { setError('Custom data must be valid JSON.'); return; }
      }
      const { data: campaignId, error: rpcErr } = await supabase.rpc(
        'admin_create_notification_campaign',
        {
          p_title:         `[TEST] ${title.trim()}`,
          p_body:          body.trim(),
          p_audience:      'user_ids',
          p_user_ids:      [userResult.user.id],
          p_deep_link:     deepLink.trim() || null,
          p_data:          parsedData,
          p_scheduled_for: null,
        },
      );
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      // Test sends ride the same DB-trigger path as real sends.
      void campaignId;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestSending(false);
    }
  }

  const audienceHint = AUDIENCES.find((a) => a.value === audience)?.hint || '';
  const previewTitle = title.trim() || 'Title preview';
  const previewBody = body.trim() || 'Body preview — this is roughly how the message will look on a device.';

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
          {/* Presets row — click to fill all fields */}
          <div className="form-group mb-md">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={12} /> Start from a preset
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => applyPreset(p)}
                  style={{ fontSize: 12, padding: '6px 10px' }}
                >
                  {p.icon}
                  <span style={{ marginLeft: 4 }}>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group mb-md">
            <label className="form-label">Title</label>
            <input
              className="input-field"
              placeholder="e.g. New matches waiting"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #5a5a6e)' }}>
                {title.length}/120 — keep it under 50 for best display
              </span>
            </div>
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

          {/* ── Live preview ─────────────────────────────────────── */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="form-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Eye size={12} /> Preview
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${previewOs === 'ios' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPreviewOs('ios')}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  <Smartphone size={12} /> iOS
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${previewOs === 'android' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPreviewOs('android')}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  <Smartphone size={12} /> Android
                </button>
              </div>
            </div>
            <NotificationPreview
              os={previewOs}
              title={previewTitle}
              body={previewBody}
              type={presetType}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted, #5a5a6e)', marginTop: 6 }}>
              Approximate render — actual styling varies by OS version and user theme.
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting || testSending}>Cancel</button>
          <button
            className="btn btn-ghost"
            onClick={() => void sendTest()}
            disabled={submitting || testSending}
            title="Send a one-off copy to your own admin account"
            style={{ marginRight: 'auto' }}
          >
            {testSending ? <>Sending…</> : <><Beaker size={14} /> Test on me</>}
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={submitting || testSending}>
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

// ─── Notification preview ────────────────────────────────────
// Approximate iOS / Android notification card. Not pixel-perfect, but close
// enough that a composer can sanity-check truncation, line breaks, and
// title/body emphasis before sending to thousands of devices.

function NotificationPreview({
  os, title, body, type,
}: {
  os: 'ios' | 'android';
  title: string;
  body: string;
  type: string;
}) {
  // Use the same color/icon palette the mobile InAppNotificationBanner uses
  // so the admin's mental model matches what users see in-app.
  const accent = useMemo(() => {
    switch (type) {
      case 'message':      return { bg: '#7C3AED', fg: '#fff' };
      case 'match':        return { bg: '#0D9488', fg: '#fff' };
      case 'reminder':
      case 'task':         return { bg: '#F59E0B', fg: '#fff' };
      case 'transaction':  return { bg: '#10B981', fg: '#fff' };
      default:             return { bg: '#3B82F6', fg: '#fff' };
    }
  }, [type]);

  if (os === 'ios') {
    return (
      <div
        style={{
          background: 'linear-gradient(180deg, #1F1F25 0%, #14141A 100%)',
          borderRadius: 14,
          padding: 16,
          border: '1px solid var(--border, #2a2a35)',
        }}
      >
        {/* iOS lockscreen-ish card */}
        <div
          style={{
            background: 'rgba(255,255,255,0.92)',
            color: '#000',
            borderRadius: 14,
            padding: 12,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: accent.bg,
              color: accent.fg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            <Bell size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#555' }}>CONTOUR</span>
              <span style={{ fontSize: 11, color: '#888' }}>now</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: '18px', marginBottom: 2 }}>
              {title}
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: '18px',
                color: '#222',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {body}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Android — flat material card
  return (
    <div
      style={{
        background: '#0E0F14',
        borderRadius: 8,
        padding: 16,
        border: '1px solid var(--border, #2a2a35)',
      }}
    >
      <div
        style={{
          background: '#1E1F26',
          color: '#E8E8EE',
          borderRadius: 4,
          padding: '10px 12px',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          borderLeft: `4px solid ${accent.bg}`,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            background: accent.bg,
            color: accent.fg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          <Bell size={12} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#A0A0B0' }}>Contour</span>
            <span style={{ fontSize: 10, color: '#666' }}>·  now</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
            {title}
          </div>
          <div
            style={{
              fontSize: 12,
              lineHeight: '16px',
              color: '#CFCFD8',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
