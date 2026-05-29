/**
 * MatchEngine — control console for the bidirectional, personalized
 * TF-IDF match engine introduced in migration 046.
 *
 * Four tabs:
 *   1. Config     — live α/β/γ/λ/η sliders + rollout cohort
 *   2. Corpus     — IDF cache inspector + manual rebuild
 *   3. Forensics  — inspect any user pair (patent exhibit material)
 *   4. Run Log    — recent matches served + p50/p99 latency
 *
 * Backed by admin_get_algo_config / admin_set_algo_config /
 * admin_get_idf_stats / admin_inspect_match / admin_get_match_engine_runs
 * / admin_get_match_engine_metrics.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import Page from '../components/ui/Page';
import {
  SlidersHorizontal, RefreshCw, Save, Sparkles, Search,
  Activity, Database, FlaskConical, AlertCircle, CheckCircle2,
  RotateCcw, Download, Info,
} from 'lucide-react';

type TabId = 'config' | 'corpus' | 'forensics' | 'runlog';

interface ConfigRow {
  key: string;
  value_num: number | null;
  value_text: string | null;
  description: string;
  updated_at: string;
}

interface IdfRow {
  token: string;
  df_leaf: number;
  df_term: number;
  df_domain: number;
  idf: number;
}

interface RunRow {
  id: string;
  user_id: string;
  created_at: string;
  n_candidates: number;
  latency_ms: number;
  asymmetry_mean: number | null;
  top1_user: string | null;
  top1_r: number | null;
}

interface Metrics {
  runs: number;
  latency_p50: number | null;
  latency_p99: number | null;
  avg_candidates: number | null;
  mean_asymmetry: number | null;
  personalization: { total_active_users: number; users_with_delta: number; coverage_pct: number; mean_abs_delta: number };
  corpora: { offer_tokens: number; want_tokens: number; offer_last_built: string | null; want_last_built: string | null };
}

// Logical grouping of the config keys for the Config tab.
// Group titles and labels are deliberately plain-English so a non-engineer
// admin can tune the engine without reading the source code or the patent
// disclosure. The technical symbol (α, β, γ, λ, η, τ, κ, ρ) is shown as a
// secondary hint so engineers can still cross-reference the formulas.
const PARAM_GROUPS: { group: string; subtitle: string; keys: { key: string; label: string; symbol?: string; min: number; max: number; step: number }[] }[] = [
  {
    group: 'How strict to be about reciprocity',
    subtitle: 'Controls how much the engine rewards mutually-good matches vs. one-sided ones.',
    keys: [
      { key: 'alpha', label: 'Reward for the better direction',  symbol: 'α', min: 0, max: 1, step: 0.05 },
      { key: 'beta',  label: 'Reward for the worse direction',   symbol: 'β', min: 0, max: 1, step: 0.05 },
      { key: 'gamma', label: 'Penalty for lopsided matches',     symbol: 'γ', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    group: 'How much to boost rare/niche skills',
    subtitle: 'Controls how the engine treats specific tags ("Cinema 4D") vs. generic ones ("design").',
    keys: [
      { key: 'lambda_term',   label: 'Credit for sharing a canonical meaning', symbol: 'λₜ', min: 0, max: 1,  step: 0.05 },
      { key: 'lambda_domain', label: 'Credit for being in the same domain',    symbol: 'λ_d', min: 0, max: 1,  step: 0.05 },
      { key: 'tau',           label: 'What counts as a "rare" tag (max df)',   symbol: 'τ',  min: 0, max: 20, step: 1 },
      { key: 'kappa',         label: 'How much to boost rare tags',            symbol: 'κ',  min: 1, max: 5,  step: 0.1 },
    ],
  },
  {
    group: 'How fast personalization learns',
    subtitle: 'Controls how aggressively the engine adapts to a user’s feedback (clicks, accepts, ignores).',
    keys: [
      { key: 'eta_accept',  label: 'Boost on accept (Message tapped)',   symbol: 'η_a', min: 0, max: 0.5, step: 0.01 },
      { key: 'eta_clicked', label: 'Boost on click (no chat started)',   symbol: 'η_c', min: 0, max: 0.5, step: 0.01 },
      { key: 'eta_reject',  label: 'Suppression on reject',              symbol: 'η_r', min: 0, max: 0.5, step: 0.01 },
      { key: 'eta_ignore',  label: 'Suppression on ignore (scroll past)', symbol: 'η_i', min: 0, max: 0.5, step: 0.01 },
      { key: 'rho',         label: 'Nightly fade (keep this % each night)', symbol: 'ρ', min: 0, max: 1,   step: 0.01 },
      { key: 'K_coldstart', label: 'Feedback events before personalization kicks in', symbol: 'K', min: 0, max: 30, step: 1 },
    ],
  },
  {
    group: 'Rollout controls',
    subtitle: 'Master kill-switch + how many users see the new engine.',
    keys: [
      { key: 'feature_flag',  label: 'Bidirectional engine', min: 0, max: 1,   step: 1 },
      { key: 'cohort_pct',    label: 'Cohort percentage',    min: 0, max: 100, step: 1 },
      { key: 'top_k_default', label: 'Matches returned per request', min: 1, max: 50, step: 1 },
    ],
  },
  {
    group: 'Candidate-pool filters',
    subtitle: 'Hide already-converted or already-rejected users from the People tab. Turn the chat filter off for demos against a small test set of accounts.',
    keys: [
      { key: 'exclude_existing_chats',      label: 'Hide users you already chat with', min: 0, max: 1,   step: 1 },
      { key: 'exclude_recent_rejects_days', label: 'Days to suppress rejected users',  min: 0, max: 365, step: 1 },
    ],
  },
];

export default function MatchEngine() {
  const [tab, setTab] = useState<TabId>('config');
  const [showHelp, setShowHelp] = useState(false);

  return (
    <Page
      title="Match Engine"
      subtitle="Live controls for the engine that ranks users on the mobile People tab. Every change saves immediately — no redeploy."
      icon={<SlidersHorizontal size={20} />}
      requireRole={['admin', 'superadmin']}
      actions={
        <button className="btn btn-ghost" onClick={() => setShowHelp(s => !s)}>
          <Info size={14} /> {showHelp ? 'Hide help' : 'What is this?'}
        </button>
      }
    >
      {showHelp && (
        <div className="data-card" style={{ padding: 16, marginBottom: 14, borderColor: 'rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.06)' }}>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)' }}>
            This page controls the engine that ranks users on the mobile <strong>Matches → People</strong> tab.
            The engine asks two questions for every pair: "does A's offer fit B's want?" and "does B's offer fit A's want?",
            and combines the two into a single reciprocity score. It also boosts rare/niche skills and personalizes per user
            based on what they click, accept, and ignore.
            <ul style={{ margin: '10px 0 0 18px', padding: 0, color: 'var(--text-secondary)' }}>
              <li><strong>Config</strong> — tune the engine's behavior. Every change is live; no redeploy.</li>
              <li><strong>Corpus</strong> — inspect what tags the engine knows and how rare each one is.</li>
              <li><strong>Forensics</strong> — paste two user IDs to see why they did/didn't match.</li>
              <li><strong>Run Log</strong> — every match request served, with latency and asymmetry. CSV-exportable.</li>
            </ul>
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
              For the full plain-English walkthrough see <code>docs/MATCH_ENGINE_EXPLAINED.md</code> in the main repo.
            </div>
          </div>
        </div>
      )}

      <div className="tabs-bar">
        <button className={`tab-btn ${tab === 'config'    ? 'active' : ''}`} onClick={() => setTab('config')}>
          <SlidersHorizontal size={14} /> Config
        </button>
        <button className={`tab-btn ${tab === 'corpus'    ? 'active' : ''}`} onClick={() => setTab('corpus')}>
          <Database size={14} /> Corpus
        </button>
        <button className={`tab-btn ${tab === 'forensics' ? 'active' : ''}`} onClick={() => setTab('forensics')}>
          <FlaskConical size={14} /> Forensics
        </button>
        <button className={`tab-btn ${tab === 'runlog'    ? 'active' : ''}`} onClick={() => setTab('runlog')}>
          <Activity size={14} /> Run Log
        </button>
      </div>

      {tab === 'config'    && <ConfigTab />}
      {tab === 'corpus'    && <CorpusTab />}
      {tab === 'forensics' && <ForensicsTab />}
      {tab === 'runlog'    && <RunLogTab />}
    </Page>
  );
}

// ============================================================
// Tab 1 — Config
// ============================================================

function ConfigTab() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [dirty, setDirty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc('admin_get_algo_config');
    setRows((data as ConfigRow[]) || []);
    setDirty({});
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const byKey = useMemo(() => Object.fromEntries(rows.map(r => [r.key, r])), [rows]);

  function setVal(key: string, n: number) {
    setDirty(d => ({ ...d, [key]: n }));
  }

  async function save() {
    setSaving(true);
    const updates = Object.entries(dirty);
    for (const [key, value] of updates) {
      await supabase.rpc('admin_set_algo_config', { p_key: key, p_value_num: value });
    }
    setToast(`Saved ${updates.length} param${updates.length === 1 ? '' : 's'}`);
    setTimeout(() => setToast(null), 2400);
    setSaving(false);
    void load();
  }

  async function revertDefaults() {
    if (!confirm('Reset every parameter to seed defaults? This includes feature_flag and cohort_pct, so the new engine will turn OFF for everyone.')) return;
    setReverting(true);
    const { data, error } = await supabase.rpc('admin_reset_algo_config_defaults');
    setReverting(false);
    if (error) {
      setToast(`Revert failed: ${error.message}`);
    } else {
      const n = (data as any)?.rows_reset ?? 0;
      setToast(`Reverted ${n} param${n === 1 ? '' : 's'} to defaults`);
    }
    setTimeout(() => setToast(null), 3000);
    void load();
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  const hasChanges = Object.keys(dirty).length > 0;

  return (
    <div>
      {toast && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, marginBottom: 14,
          background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.3)',
          color: '#14B8A6', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      {PARAM_GROUPS.map(g => (
        <div key={g.group} className="data-card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="data-card-title" style={{ fontSize: 14 }}>{g.group}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{g.subtitle}</div>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {g.keys.map(p => {
              const row = byKey[p.key];
              if (!row) return null;
              const current = dirty[p.key] ?? Number(row.value_num ?? 0);

              // feature_flag is rendered as a proper toggle instead of a slider/number input.
              if (p.key === 'feature_flag') {
                const enabled = current === 1;
                return (
                  <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '260px 1fr auto', gap: 14, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{row.description}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label className="toggle">
                        <input type="checkbox" checked={enabled} onChange={e => setVal(p.key, e.target.checked ? 1 : 0)} />
                        <span className="toggle-slider"></span>
                      </label>
                      <span style={{ fontSize: 12, fontWeight: 600, color: enabled ? '#14B8A6' : 'var(--text-muted)' }}>
                        {enabled ? 'enabled' : 'disabled'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Still requires cohort % &gt; 0
                    </span>
                  </div>
                );
              }

              return (
                <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '260px 1fr 90px', gap: 14, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{p.label}</span>
                      {p.symbol && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', padding: '1px 6px', borderRadius: 4, background: 'var(--bg-secondary, #11111a)', border: '1px solid var(--border, #2a2a35)' }}>
                          {p.symbol}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{row.description}</div>
                  </div>
                  <input
                    type="range"
                    min={p.min} max={p.max} step={p.step}
                    value={current}
                    onChange={e => setVal(p.key, Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <input
                    className="input-field"
                    type="number"
                    min={p.min} max={p.max} step={p.step}
                    value={current}
                    onChange={e => setVal(p.key, Number(e.target.value))}
                    style={{ width: 90, padding: '6px 8px', textAlign: 'center' }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={!hasChanges || saving} onClick={save}>
          <Save size={14} /> {saving ? 'Saving…' : `Save${hasChanges ? ` (${Object.keys(dirty).length})` : ''}`}
        </button>
        <button className="btn btn-ghost" disabled={!hasChanges} onClick={() => setDirty({})}>
          Discard local edits
        </button>
        <button className="btn btn-ghost" onClick={() => void load()}>
          <RefreshCw size={14} /> Reload
        </button>
        <button className="btn btn-danger" disabled={reverting} onClick={revertDefaults} style={{ marginLeft: 'auto' }}>
          <RotateCcw size={14} /> {reverting ? 'Reverting…' : 'Revert to defaults'}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Tab 2 — Corpus
// ============================================================

function CorpusTab() {
  const [side, setSide] = useState<'offer' | 'want'>('offer');
  const [rows, setRows] = useState<IdfRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    const [idfRes, mRes] = await Promise.all([
      supabase.rpc('admin_get_idf_stats', { p_side: side, p_limit: 50 }),
      supabase.rpc('admin_get_match_engine_metrics', { p_days_back: 7 }),
    ]);
    if (idfRes.error) setErr(idfRes.error.message);
    setRows((idfRes.data as IdfRow[]) || []);
    setMetrics((mRes.data as Metrics) || null);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [side]);

  async function rebuild() {
    setRebuilding(true);
    const { error } = await supabase.rpc('admin_rebuild_idf_now');
    if (error) setErr(error.message);
    setRebuilding(false);
    await load();
  }

  const corpora = metrics?.corpora;

  return (
    <div>
      <div className="two-col-grid" style={{ marginBottom: 14 }}>
        <CorpusCard title="Offer-side IDF"
                    tokens={corpora?.offer_tokens ?? 0}
                    lastBuilt={corpora?.offer_last_built ?? null} />
        <CorpusCard title="Want-side IDF"
                    tokens={corpora?.want_tokens ?? 0}
                    lastBuilt={corpora?.want_last_built ?? null} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={rebuild} disabled={rebuilding}>
          <Sparkles size={14} /> {rebuilding ? 'Rebuilding…' : 'Rebuild IDF now'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Auto-runs every 6h via pg_cron.
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <select className="input-field" value={side} onChange={e => setSide(e.target.value as 'offer' | 'want')}
                  style={{ width: 160, padding: '6px 10px' }}>
            <option value="offer">Offer corpus</option>
            <option value="want">Want corpus</option>
          </select>
        </div>
      </div>

      {err && (
        <div style={{ padding: 12, borderRadius: 6, marginBottom: 14,
                      background: 'rgba(255,91,107,0.08)', border: '1px solid rgba(255,91,107,0.25)',
                      color: '#ff5b6b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} /> {err}
        </div>
      )}

      <div className="data-card">
        <div className="data-card-header">
          <span className="data-card-title">Top 50 rarest tokens ({side})</span>
        </div>
        {loading ? <div className="loading-state"><div className="spinner" /></div>
          : rows.length === 0 ? <div className="empty-state"><h3>No corpus yet</h3><p>Click "Rebuild IDF now" to populate.</p></div>
          : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Token</th><th>df_leaf</th><th>df_term</th><th>df_domain</th><th>IDF</th></tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.token}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.token}</td>
                      <td>{r.df_leaf}</td>
                      <td>{r.df_term}</td>
                      <td>{r.df_domain}</td>
                      <td style={{ fontWeight: 600 }}>{Number(r.idf).toFixed(3)}</td>
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

function CorpusCard({ title, tokens, lastBuilt }: { title: string; tokens: number; lastBuilt: string | null }) {
  return (
    <div className="data-card" style={{ padding: 18 }}>
      <div className="data-card-title" style={{ fontSize: 13, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', gap: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tokens</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{tokens.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Last build</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {lastBuilt ? new Date(lastBuilt).toLocaleString() : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tab 3 — Forensics
// ============================================================

interface UserOption {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

function ForensicsTab() {
  const [userA, setUserA] = useState('');
  const [userB, setUserB] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  
  // User search state
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [showDropdownA, setShowDropdownA] = useState(false);
  const [showDropdownB, setShowDropdownB] = useState(false);

  // Load users on mount
  useEffect(() => {
    async function loadUsers() {
      setLoadingUsers(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .order('created_at', { ascending: false })
        .limit(100);
      setUsers((data as UserOption[]) || []);
      setLoadingUsers(false);
    }
    void loadUsers();
  }, []);

  // Filter users based on search
  const filteredUsersA = users.filter(u => {
    const name = u.display_name || u.username || '';
    return name.toLowerCase().includes(searchA.toLowerCase());
  });

  const filteredUsersB = users.filter(u => {
    const name = u.display_name || u.username || '';
    return name.toLowerCase().includes(searchB.toLowerCase());
  });

  function selectUserA(user: UserOption) {
    setUserA(user.id);
    setSearchA(user.display_name || user.username || user.id);
    setShowDropdownA(false);
  }

  function selectUserB(user: UserOption) {
    setUserB(user.id);
    setSearchB(user.display_name || user.username || user.id);
    setShowDropdownB(false);
  }

  async function inspect() {
    if (!userA.trim() || !userB.trim()) return;
    setBusy(true); setErr(null); setResult(null);
    const { data, error } = await supabase.rpc('admin_inspect_match', {
      p_user_a: userA.trim(),
      p_user_b: userB.trim(),
    });
    if (error) setErr(error.message);
    setResult(data);
    setBusy(false);
  }

  return (
    <div>
      <div className="data-card" style={{ padding: 18, marginBottom: 14, overflow: 'visible' }}>
        <div className="data-card-title" style={{ marginBottom: 12, fontSize: 14 }}>
          Inspect any user pair
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'end', position: 'relative' }}>
          <div style={{ position: 'relative', zIndex: 100 }}>
            <label className="form-label">User A</label>
            <input 
              className="input-field" 
              placeholder="Search users..." 
              value={searchA} 
              onChange={e => {
                setSearchA(e.target.value);
                setShowDropdownA(true);
              }}
              onFocus={() => setShowDropdownA(true)}
              onBlur={() => setTimeout(() => setShowDropdownA(false), 200)}
            />
            {showDropdownA && filteredUsersA.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                maxHeight: 240,
                overflowY: 'auto',
                background: '#1a1a24',
                border: '1px solid #2a2a35',
                borderRadius: 6,
                marginTop: 4,
                zIndex: 9999,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                {filteredUsersA.slice(0, 10).map(user => (
                  <div
                    key={user.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectUserA(user);
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      borderBottom: '1px solid #2a2a35',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#11111a'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#11111a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 600,
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}>
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        (user.display_name || user.username || '?')[0].toUpperCase()
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e5e5' }}>
                        {user.display_name || 'Unnamed'}
                      </div>
                      <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        @{user.username || '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ position: 'relative', zIndex: 99 }}>
            <label className="form-label">User B</label>
            <input 
              className="input-field" 
              placeholder="Search users..." 
              value={searchB} 
              onChange={e => {
                setSearchB(e.target.value);
                setShowDropdownB(true);
              }}
              onFocus={() => setShowDropdownB(true)}
              onBlur={() => setTimeout(() => setShowDropdownB(false), 200)}
            />
            {showDropdownB && filteredUsersB.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                maxHeight: 240,
                overflowY: 'auto',
                background: '#1a1a24',
                border: '1px solid #2a2a35',
                borderRadius: 6,
                marginTop: 4,
                zIndex: 9999,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                {filteredUsersB.slice(0, 10).map(user => (
                  <div
                    key={user.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectUserB(user);
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      borderBottom: '1px solid #2a2a35',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#11111a'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#11111a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 600,
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}>
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        (user.display_name || user.username || '?')[0].toUpperCase()
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e5e5' }}>
                        {user.display_name || 'Unnamed'}
                      </div>
                      <div style={{ fontSize: 11, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        @{user.username || '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={inspect} disabled={busy || !userA || !userB}>
            <Search size={14} /> {busy ? 'Inspecting…' : 'Inspect'}
          </button>
        </div>
        {loadingUsers && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Loading users...
          </div>
        )}
      </div>

      {err && (
        <div style={{ padding: 12, borderRadius: 6, marginBottom: 14,
                      background: 'rgba(255,91,107,0.08)', border: '1px solid rgba(255,91,107,0.25)',
                      color: '#ff5b6b', fontSize: 13 }}>{err}</div>
      )}

      {result && (
        <div className="data-card" style={{ padding: 18 }}>
          <div className="data-card-title" style={{ marginBottom: 14, fontSize: 14 }}>Forensic breakdown</div>
          <div className="detail-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <Stat label="s_ij (A → B)"   value={result.s_ij?.toString() ?? '—'} />
            <Stat label="s_ji (B → A)"   value={result.s_ji?.toString() ?? '—'} />
            <Stat label="Asymmetry"      value={result.asymmetry?.toString() ?? '—'} />
            <Stat label="Reciprocity R"  value={result.reciprocity?.toString() ?? '—'} accent />
          </div>

          <div style={{ marginTop: 18, padding: 12, background: 'var(--bg-secondary, #11111a)',
                        border: '1px solid var(--border, #2a2a35)', borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Common tokens ({result.common_tokens?.length ?? 0})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(result.common_tokens || []).map((t: string) => (
                <span key={t} style={{ padding: '2px 8px', borderRadius: 999, background: 'rgba(59,130,246,0.15)',
                                       color: '#60a5fa', fontSize: 11, fontFamily: 'monospace' }}>{t}</span>
              ))}
              {(!result.common_tokens || result.common_tokens.length === 0) && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(none)</span>
              )}
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Stat label="A δ-tokens" value={String(result.personalization?.a_delta_tokens ?? 0)} />
            <Stat label="B δ-tokens" value={String(result.personalization?.b_delta_tokens ?? 0)} />
          </div>

          <details style={{ marginTop: 14 }}>
            <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>config snapshot</summary>
            <pre style={{ fontSize: 11, padding: 10, background: 'var(--bg-secondary, #11111a)',
                          border: '1px solid var(--border, #2a2a35)', borderRadius: 6, marginTop: 8, overflow: 'auto' }}>
{JSON.stringify(result.config_snapshot, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Tab 4 — Run Log
// ============================================================

function RunLogTab() {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [r, m] = await Promise.all([
      supabase.rpc('admin_get_match_engine_runs', { p_limit: 100 }),
      supabase.rpc('admin_get_match_engine_metrics', { p_days_back: 7 }),
    ]);
    setRows((r.data as RunRow[]) || []);
    setMetrics((m.data as Metrics) || null);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function exportCsv(daysBack: number) {
    setExporting(true);
    setExportErr(null);
    const { data, error } = await supabase.rpc('admin_export_run_log_csv', { p_days_back: daysBack });
    if (error) {
      setExportErr(error.message);
      setExporting(false);
      return;
    }
    const rows = (data as any[]) || [];
    if (rows.length === 0) {
      setExportErr('No rows in the requested window.');
      setExporting(false);
      return;
    }
    // Build CSV: header from first row's keys, then values quoted.
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => escape((r as any)[h])).join(',')),
    ].join('\n');
    // Trigger download in the browser.
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().replace(/[:.]/g, '-');
    a.href     = url;
    a.download = `match_engine_run_log_${daysBack}d_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  return (
    <div>
      <div style={{
        display: 'grid', gap: 12, marginBottom: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      }}>
        <Stat label="Runs (7d)"        value={String(metrics?.runs ?? 0)} />
        <Stat label="p50 latency (ms)" value={metrics?.latency_p50 != null ? String(Math.round(Number(metrics.latency_p50))) : '—'} />
        <Stat label="p99 latency (ms)" value={metrics?.latency_p99 != null ? String(Math.round(Number(metrics.latency_p99))) : '—'} />
        <Stat label="Avg candidates"   value={metrics?.avg_candidates != null ? String(metrics.avg_candidates) : '—'} />
        <Stat label="Mean asymmetry"   value={metrics?.mean_asymmetry != null ? String(metrics.mean_asymmetry) : '—'} accent />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={exporting} onClick={() => void exportCsv(7)}>
          <Download size={14} /> {exporting ? 'Exporting…' : 'Export 7d CSV'}
        </button>
        <button className="btn btn-ghost" disabled={exporting} onClick={() => void exportCsv(30)}>
          <Download size={14} /> Export 30d CSV
        </button>
        <button className="btn btn-ghost" disabled={exporting} onClick={() => void exportCsv(90)}>
          <Download size={14} /> Export 90d CSV
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Flat per-run rows for Exhibit B / patent filing.
        </span>
      </div>

      {exportErr && (
        <div style={{ padding: 10, borderRadius: 6, marginBottom: 14,
                      background: 'rgba(255,91,107,0.08)', border: '1px solid rgba(255,91,107,0.25)',
                      color: '#ff5b6b', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={12} /> {exportErr}
        </div>
      )}

      <div className="data-card">
        <div className="data-card-header"><span className="data-card-title">Recent runs (latest 100)</span></div>
        {rows.length === 0
          ? <div className="empty-state"><h3>No runs yet</h3><p>The new engine hasn't served any requests yet. Flip <code>feature_flag</code> in the Config tab.</p></div>
          : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Candidates</th>
                    <th>Latency</th>
                    <th>Asymmetry</th>
                    <th>Top1 user</th>
                    <th>Top1 R</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.user_id?.slice(0, 8)}…</td>
                      <td>{r.n_candidates}</td>
                      <td>{r.latency_ms} ms</td>
                      <td>{r.asymmetry_mean != null ? Number(r.asymmetry_mean).toFixed(3) : '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.top1_user?.slice(0, 8) ?? '—'}</td>
                      <td style={{ fontWeight: 600 }}>{r.top1_r != null ? Number(r.top1_r).toFixed(3) : '—'}</td>
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-secondary, #11111a)',
      border: '1px solid var(--border, #2a2a35)',
      borderRadius: 8, padding: 14,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ? '#14B8A6' : 'var(--text-primary, #fff)' }}>
        {value}
      </div>
    </div>
  );
}
