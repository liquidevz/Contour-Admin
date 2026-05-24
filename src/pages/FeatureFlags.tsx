import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ToggleLeft, Plus, Trash2, X, SlidersHorizontal, ExternalLink } from 'lucide-react';
import Page from '../components/ui/Page';

interface MatchEngineFlag {
  feature_flag: number;
  cohort_pct: number;
  engine_version: string | null;
}

export default function FeatureFlags() {
  const [flags, setFlags] = useState<any[]>([]);
  const [matchFlag, setMatchFlag] = useState<MatchEngineFlag | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newFlag, setNewFlag] = useState({ key: '', description: '', rollout_percentage: 100 });

  useEffect(() => { loadFlags(); }, []);

  async function loadFlags() {
    const [flagsRes, configRes] = await Promise.all([
      supabase.from('feature_flags')
        .select('*, feature_flag_overrides(id, user_id)')
        .order('created_at', { ascending: false }),
      supabase.rpc('admin_get_algo_config'),
    ]);
    setFlags(flagsRes.data || []);
    if (!configRes.error && Array.isArray(configRes.data)) {
      const byKey = Object.fromEntries(configRes.data.map((r: any) => [r.key, r]));
      setMatchFlag({
        feature_flag: Number(byKey.feature_flag?.value_num ?? 0),
        cohort_pct:   Number(byKey.cohort_pct?.value_num ?? 0),
        engine_version: byKey.engine_version?.value_text ?? null,
      });
    }
    setLoading(false);
  }

  async function createFlag() {
    if (!newFlag.key.trim()) return;
    await supabase.from('feature_flags').insert({
      key: newFlag.key.trim(),
      description: newFlag.description.trim(),
      is_enabled: false,
      rollout_percentage: newFlag.rollout_percentage,
    });
    setShowCreate(false);
    setNewFlag({ key: '', description: '', rollout_percentage: 100 });
    loadFlags();
  }

  async function toggleFlag(flagId: string, enabled: boolean) {
    await supabase.from('feature_flags').update({ is_enabled: enabled }).eq('id', flagId);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('admin_audit_logs').insert({
      admin_id: user.id, action: enabled ? 'enable_flag' : 'disable_flag',
      entity: 'feature_flags', entity_id: flagId,
    });
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, is_enabled: enabled } : f));
  }

  async function updateRollout(flagId: string, pct: number) {
    await supabase.from('feature_flags').update({ rollout_percentage: pct }).eq('id', flagId);
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, rollout_percentage: pct } : f));
  }

  async function deleteFlag(flagId: string) {
    if (!confirm('Delete this feature flag?')) return;
    await supabase.from('feature_flags').delete().eq('id', flagId);
    setFlags(prev => prev.filter(f => f.id !== flagId));
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  return (
    <Page
      title="Feature Flags"
      subtitle={`${flags.length} feature flags configured. Each flag turns a feature on or off for some or all users without needing a redeploy — handy for staged rollouts and quick rollbacks.`}
      icon={<ToggleLeft size={20} />}
      requireRole={['admin', 'superadmin']}
      actions={
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Flag
        </button>
      }
    >

      {matchFlag && (
        <div className="data-card" style={{
          padding: 14, marginBottom: 16,
          border: '1px solid rgba(99,102,241,0.35)',
          background: 'rgba(99,102,241,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SlidersHorizontal size={18} style={{ color: '#818cf8' }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Match Engine — Bidirectional (mirrored from match_algo_config)
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {matchFlag.engine_version || '—'} · this flag is owned by the Match Engine page (canonical editor).
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>State</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: matchFlag.feature_flag ? '#14B8A6' : 'var(--text-muted)' }}>
                  {matchFlag.feature_flag ? 'enabled' : 'disabled'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Cohort</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{matchFlag.cohort_pct}%</div>
              </div>
              <Link to="/match-engine" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                Open Match Engine <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Feature Flag</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-md">
                <label className="form-label">Key</label>
                <input className="input-field" placeholder="feature_key_name" value={newFlag.key} onChange={e => setNewFlag(p => ({ ...p, key: e.target.value }))} />
              </div>
              <div className="form-group mb-md">
                <label className="form-label">Description</label>
                <input className="input-field" placeholder="What does this flag control?" value={newFlag.description} onChange={e => setNewFlag(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Rollout Percentage</label>
                <input className="input-field" type="number" min={0} max={100} value={newFlag.rollout_percentage} onChange={e => setNewFlag(p => ({ ...p, rollout_percentage: +e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createFlag}>Create</button>
            </div>
          </div>
        </div>
      )}

      <div className="data-card">
        {flags.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><ToggleLeft size={24} /></div>
            <h3>No feature flags</h3>
            <p>Create your first feature flag to get started</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Rollout %</th>
                  <th>Overrides</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {flags.map(flag => (
                  <tr key={flag.id}>
                    <td>
                      <span className="mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{flag.key}</span>
                    </td>
                    <td className="text-truncate" style={{ maxWidth: 220 }}>
                      {flag.description || '—'}
                    </td>
                    <td>
                      <label className="toggle">
                        <input type="checkbox" checked={flag.is_enabled} onChange={(e) => toggleFlag(flag.id, e.target.checked)} />
                        <span className="toggle-slider"></span>
                      </label>
                    </td>
                    <td>
                      <input
                        className="input-field"
                        type="number"
                        min={0} max={100}
                        value={flag.rollout_percentage}
                        onChange={(e) => updateRollout(flag.id, +e.target.value)}
                        style={{ width: 72, padding: '6px 8px', textAlign: 'center' }}
                      />
                    </td>
                    <td>
                      <span className="badge badge-info">
                        {flag.feature_flag_overrides?.length || 0}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteFlag(flag.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Page>
  );
}
