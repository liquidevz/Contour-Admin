/**
 * RemoteConfig — runtime config key/value editor.
 *
 * Three reserved keys (seeded in migration 032 §3) drive the app's
 * kill-switch behavior:
 *   maintenance.enabled
 *   maintenance.message
 *   min_supported_version
 *
 * The app's lib/config.ts reads this table on launch and on resume.
 * Cache TTL is 60s — saves here reach devices within that window.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Sliders, RefreshCw, Plus, Trash2, Save, X, AlertTriangle, Lock,
  Power, Zap, RotateCcw,
} from 'lucide-react';

type ValueType = 'boolean' | 'number' | 'string' | 'json';

interface ConfigRow {
  key:          string;
  value:        unknown;
  value_type:   ValueType;
  description:  string | null;
  updated_by:   string | null;
  updated_at:   string;
}

const RESERVED_KEYS = new Set([
  'maintenance.enabled',
  'maintenance.message',
  'min_supported_version',
]);

export default function RemoteConfig() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows]       = useState<ConfigRow[]>([]);
  const [editor, setEditor]   = useState<ConfigRow | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('remote_config')
      .select('*')
      .order('key');
    if (error) console.warn('[RemoteConfig] load', error);
    setRows((data as ConfigRow[]) || []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function remove(key: string) {
    if (RESERVED_KEYS.has(key)) {
      alert('Reserved keys cannot be deleted (they drive app kill switches). Edit the value instead.');
      return;
    }
    if (!confirm(`Delete config key "${key}"?`)) return;
    const { error } = await supabase.rpc('admin_delete_remote_config', { p_key: key });
    if (error) { alert(error.message); return; }
    await load();
  }

  // Reserved keys first, then alphabetical.
  const sorted = [...rows].sort((a, b) => {
    const aR = RESERVED_KEYS.has(a.key) ? 0 : 1;
    const bR = RESERVED_KEYS.has(b.key) ? 0 : 1;
    if (aR !== bR) return aR - bR;
    return a.key.localeCompare(b.key);
  });

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><Sliders size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Remote Config</h1>
            <p>Live runtime config. Devices refresh every 60s and on app foreground.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => void load()}><RefreshCw size={14} /> Refresh</button>
            <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New key</button>
          </div>
        </div>
      </div>

      {/* Reserved keys hint */}
      <div style={{
        padding: 12, borderRadius: 6, marginBottom: 16,
        background: 'rgba(245,158,11,0.06)',
        border: '1px solid rgba(245,158,11,0.25)',
        color: '#F59E0B', fontSize: 13,
        display: 'flex', alignItems: 'flex-start', gap: 8,
      }}>
        <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <strong>Reserved keys</strong> — <code>maintenance.enabled</code>, <code>maintenance.message</code>, and{' '}
          <code>min_supported_version</code> control whether the live app boots. Toggling{' '}
          <code>maintenance.enabled</code> = <code>true</code> blocks every device on next resume.
        </div>
      </div>

      <KillSwitchStrip rows={rows} onChanged={() => void load()} />

      <div className="data-card">
        <div className="data-card-header"><span className="data-card-title">Keys</span></div>
        {loading ? <div className="loading-state"><div className="spinner" /></div>
          : sorted.length === 0 ? <div className="empty-state"><h3>No config keys</h3></div>
          : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Key</th><th>Type</th><th>Value</th>
                    <th>Description</th><th>Updated</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(r => {
                    const reserved = RESERVED_KEYS.has(r.key);
                    return (
                      <tr key={r.key} onClick={() => setEditor(r)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {reserved && <Lock size={11} style={{ verticalAlign: 'middle', marginRight: 4, color: '#F59E0B' }} />}
                          {r.key}
                        </td>
                        <td style={{ fontSize: 12 }}>{r.value_type}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={JSON.stringify(r.value)}>
                          {JSON.stringify(r.value)}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.description || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(r.updated_at).toLocaleString()}</td>
                        <td onClick={e => e.stopPropagation()}>
                          {!reserved && (
                            <button className="btn btn-ghost btn-sm" onClick={() => void remove(r.key)} title="Delete">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {(editor || creating) && (
        <ConfigEditor
          row={editor}
          onClose={() => { setEditor(null); setCreating(false); }}
          onSaved={async () => { setEditor(null); setCreating(false); await load(); }}
        />
      )}
    </div>
  );
}

// ─── Quick action strip for the 3 reserved keys ──────────────

function KillSwitchStrip({ rows, onChanged }: { rows: ConfigRow[]; onChanged: () => void }) {
  const maintenance = rows.find(r => r.key === 'maintenance.enabled')?.value === true;
  const minVersion  = String(rows.find(r => r.key === 'min_supported_version')?.value ?? '1.0.0');

  async function toggleMaintenance() {
    const next = !maintenance;
    if (next && !confirm('Turn ON maintenance mode? Every live app will show a blocking screen on next resume.')) return;
    const { error } = await supabase.rpc('admin_upsert_remote_config', {
      p_key: 'maintenance.enabled',
      p_value: next,
      p_value_type: 'boolean',
      p_description: null,
    });
    if (error) { alert(error.message); return; }
    onChanged();
  }

  async function setMinVersion() {
    const next = prompt(`Set min_supported_version (current: ${minVersion}). Use semver e.g. 1.2.3`, minVersion);
    if (!next) return;
    if (!/^\d+\.\d+\.\d+/.test(next)) { alert('Invalid semver'); return; }
    if (!confirm(`Force every app below v${next} to show the update screen?`)) return;
    const { error } = await supabase.rpc('admin_force_update_min_version', { p_version: next });
    if (error) { alert(error.message); return; }
    onChanged();
  }

  return (
    <div style={{
      display: 'grid', gap: 12, marginBottom: 16,
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    }}>
      <div style={cardStyle(maintenance ? '#ff5b6b' : undefined)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Power size={14} color={maintenance ? '#ff5b6b' : '#9a9aae'} />
          <strong style={{ fontSize: 13 }}>Maintenance mode</strong>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          {maintenance
            ? 'ON — every app shows a blocking screen.'
            : 'OFF — apps are running normally.'}
        </div>
        <button className={`btn btn-sm ${maintenance ? 'btn-ghost' : 'btn-danger'}`}
          onClick={() => void toggleMaintenance()}>
          {maintenance ? 'Turn off' : 'Turn ON maintenance'}
        </button>
      </div>

      <div style={cardStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Zap size={14} color="#F59E0B" />
          <strong style={{ fontSize: 13 }}>Force update</strong>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Current minimum: <code>{minVersion}</code>. Apps below this version must update.
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void setMinVersion()}>
          Set minimum version…
        </button>
      </div>

      <div style={cardStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <RotateCcw size={14} color="#7C3AED" />
          <strong style={{ fontSize: 13 }}>Invalidate cache</strong>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          Broadcast a Realtime invalidation so devices drop a named cache key (tags, categories, etc.).
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void broadcastInvalidation()}>
          Broadcast invalidation…
        </button>
      </div>
    </div>
  );
}

async function broadcastInvalidation() {
  const key = prompt('Cache key to invalidate (e.g. marketplace.tags):');
  if (!key) return;
  const reason = prompt('Optional reason for the audit log:') ?? null;
  const { error } = await supabase.rpc('admin_broadcast_invalidation', {
    p_key: key, p_reason: reason,
  });
  if (error) { alert(error.message); return; }
  alert(`Invalidation broadcast for "${key}".`);
}

function cardStyle(borderColor?: string): React.CSSProperties {
  return {
    background: 'var(--bg-secondary, #11111a)',
    border: `1px solid ${borderColor ?? 'var(--border, #2a2a35)'}`,
    borderRadius: 8, padding: 14,
  };
}

function ConfigEditor({
  row, onClose, onSaved,
}: { row: ConfigRow | null; onClose: () => void; onSaved: () => void }) {
  const isNew = row == null;
  const [key, setKey]             = useState(row?.key ?? '');
  const [valueType, setValueType] = useState<ValueType>(row?.value_type ?? 'string');
  const [valueText, setValueText] = useState(JSON.stringify(row?.value ?? '', null, 2));
  const [description, setDesc]    = useState(row?.description ?? '');
  const [error, setError]         = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);

  async function save() {
    setError(null);
    if (!key.trim()) { setError('Key required'); return; }

    let parsed: unknown;
    try {
      const trimmed = valueText.trim();
      if (valueType === 'string' && !trimmed.startsWith('"')) {
        // accept raw strings for convenience
        parsed = trimmed;
      } else {
        parsed = JSON.parse(trimmed);
      }
    } catch (e) { setError(`Invalid JSON: ${(e as Error).message}`); return; }

    // Type check
    const t = typeof parsed;
    if (valueType === 'boolean' && t !== 'boolean') { setError('Expected boolean'); return; }
    if (valueType === 'number'  && t !== 'number')  { setError('Expected number'); return; }
    if (valueType === 'string'  && t !== 'string')  { setError('Expected string'); return; }

    setSaving(true);
    const { error: rpcErr } = await supabase.rpc('admin_upsert_remote_config', {
      p_key:         key.trim(),
      p_value:       parsed,
      p_value_type:  valueType,
      p_description: description.trim() || null,
    });
    setSaving(false);
    if (rpcErr) { setError(rpcErr.message); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2>{isNew ? 'New config key' : 'Edit config key'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group mb-md">
            <label className="form-label">Key</label>
            <input className="input-field" value={key} onChange={e => setKey(e.target.value)}
              disabled={!isNew} placeholder="e.g. feature.new_chat_ui"
              style={{ fontFamily: 'monospace' }} />
          </div>

          <div className="form-group mb-md">
            <label className="form-label">Type</label>
            <select className="input-field" value={valueType}
              onChange={e => setValueType(e.target.value as ValueType)}>
              <option value="boolean">boolean</option>
              <option value="number">number</option>
              <option value="string">string</option>
              <option value="json">json</option>
            </select>
          </div>

          <div className="form-group mb-md">
            <label className="form-label">Value (JSON)</label>
            <textarea className="input-field" value={valueText}
              onChange={e => setValueText(e.target.value)}
              rows={6} style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              placeholder={valueType === 'boolean' ? 'true' : valueType === 'string' ? '"text"' : '{}'} />
          </div>

          <div className="form-group">
            <label className="form-label">Description (optional)</label>
            <input className="input-field" value={description}
              onChange={e => setDesc(e.target.value)} placeholder="Why this key exists" />
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: 10, background: 'rgba(255,91,107,0.08)',
              border: '1px solid var(--danger, #ff5b6b)', borderRadius: 6, fontSize: 13, color: 'var(--danger, #ff5b6b)' }}>
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
