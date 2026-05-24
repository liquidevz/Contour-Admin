import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Page from '../components/ui/Page';
import {
  Zap, TrendingUp, ThumbsUp, ThumbsDown, Eye, MinusCircle,
  Scale, Users, Sparkles
} from 'lucide-react';

/**
 * Match Engine Analytics
 *
 * Original cards (feedback breakdown, score analysis, usage trend) +
 * three new patent-effect cards backed by migration 046:
 *   1. Asymmetry reduction  — mean |s_ij − s_ji| over recent top-K results
 *   2. Personalization coverage — % of users with non-empty δ_u + mean |δ|
 *   3. Engine latency / rare-tag recall — Stage B technical effect
 *
 * Screenshot these three cards at filing time → Exhibit B.
 */

interface EngineMetrics {
  runs: number;
  latency_p50: number | null;
  latency_p99: number | null;
  avg_candidates: number | null;
  mean_asymmetry: number | null;
  mean_rare_tag_recall: number | null;
  personalization: {
    total_active_users: number;
    users_with_delta: number;
    coverage_pct: number;
    mean_abs_delta: number;
  };
  corpora: {
    offer_tokens: number;
    want_tokens: number;
    offer_last_built: string | null;
    want_last_built: string | null;
  };
}

export default function MatchAnalytics() {
  const [usage, setUsage] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any>(null);
  const [engine, setEngine] = useState<EngineMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [usageRes, feedbackRes, engineRes] = await Promise.all([
      supabase.rpc('admin_get_match_usage', { days_back: 30 }),
      supabase.rpc('admin_get_match_feedback_stats'),
      supabase.rpc('admin_get_match_engine_metrics', { p_days_back: 7 }),
    ]);
    setUsage(usageRes.data || []);
    setFeedback(feedbackRes.data);
    // engineRes may fail if migration 046 hasn't been applied yet — degrade gracefully.
    if (!engineRes.error) setEngine(engineRes.data as EngineMetrics);
    setLoading(false);
  }

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  const fb = feedback || {};

  const feedbackCards = [
    { label: 'Total Feedback', value: fb.total_feedback ?? 0, icon: TrendingUp, color: 'purple' },
    { label: 'Clicked', value: fb.clicked ?? 0, icon: Eye, color: 'blue' },
    { label: 'Accepted', value: fb.accepted ?? 0, icon: ThumbsUp, color: 'green' },
    { label: 'Rejected', value: fb.rejected ?? 0, icon: ThumbsDown, color: 'red' },
    { label: 'Ignored', value: fb.ignored ?? 0, icon: MinusCircle, color: 'amber' },
  ];

  return (
    <Page
      title="Match Analytics"
      subtitle="How the match engine is performing — acceptance vs. rejection, click-through, and the technical-effect metrics referenced in the patent disclosure."
      icon={<Zap size={20} />}
    >

      <div className="stats-grid">
        {feedbackCards.map(c => (
          <div key={c.label} className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-label">{c.label}</span>
              <div className={`stat-card-icon ${c.color}`}><c.icon size={18} /></div>
            </div>
            <div className="stat-card-value">{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Patent-effect cards (migration 046) ── */}
      {engine && (
        <>
          <div className="section-header" style={{ marginTop: 24, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Bidirectional Engine — Technical Effects</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Last 7 days · backing data for the patent claims. Screenshot these for Exhibit B.
            </p>
          </div>

          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <PatentCard
              icon={Scale}
              label="Mean asymmetry"
              value={engine.mean_asymmetry != null ? Number(engine.mean_asymmetry).toFixed(3) : '—'}
              hint="|s_ij − s_ji| over top-K. Lower = more reciprocal matches (Stage A)."
              color="teal"
            />
            <PatentCard
              icon={Users}
              label="Personalization coverage"
              value={`${engine.personalization.coverage_pct ?? 0}%`}
              hint={`${engine.personalization.users_with_delta}/${engine.personalization.total_active_users} users have δ_u. Mean |δ| = ${engine.personalization.mean_abs_delta ?? 0} (Stage C).`}
              color="purple"
            />
            <PatentCard
              icon={Sparkles}
              label="Rare-tag recall"
              value={engine.mean_rare_tag_recall != null ? Number(engine.mean_rare_tag_recall).toFixed(3) : '—'}
              hint="Recall@10 for tokens with df < τ. Hierarchical IDF effect (Stage B)."
              color="amber"
            />
            <PatentCard
              icon={Zap}
              label="Engine latency"
              value={engine.latency_p50 != null ? `${Math.round(Number(engine.latency_p50))}ms / ${Math.round(Number(engine.latency_p99 ?? 0))}ms` : '—'}
              hint={`p50 / p99 over ${engine.runs} runs. Avg ${engine.avg_candidates ?? '—'} candidates per run.`}
              color="blue"
            />
          </div>
        </>
      )}

      <div className="two-col-grid">
        <div className="data-card" style={{ padding: 22 }}>
          <div className="data-card-title" style={{ marginBottom: 16 }}>Score Analysis</div>
          <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="detail-item">
              <span className="detail-label">Avg Score (Accepted)</span>
              <span className="detail-value" style={{ color: 'var(--status-success)', fontWeight: 600, fontSize: '1.2rem' }}>
                {fb.avg_score_accepted ?? '—'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Avg Score (Rejected)</span>
              <span className="detail-value" style={{ color: 'var(--status-error)', fontWeight: 600, fontSize: '1.2rem' }}>
                {fb.avg_score_rejected ?? '—'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Acceptance Rate</span>
              <span className="detail-value" style={{ fontWeight: 600, fontSize: '1.2rem' }}>
                {fb.total_feedback > 0
                  ? ((fb.accepted / fb.total_feedback) * 100).toFixed(1) + '%'
                  : '—'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Click-through Rate</span>
              <span className="detail-value" style={{ fontWeight: 600, fontSize: '1.2rem' }}>
                {fb.total_feedback > 0
                  ? ((fb.clicked / fb.total_feedback) * 100).toFixed(1) + '%'
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="data-card">
          <div className="data-card-header">
            <span className="data-card-title"><Zap size={16} /> Usage Trend (30 days)</span>
          </div>
          {usage.length === 0 ? (
            <div className="empty-state">
              <h3>No match data yet</h3>
              <p>Match engine hasn't been used in the last 30 days</p>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Runs</th>
                    <th>Avg Results</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((row: any, i: number) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{row.day}</td>
                      <td style={{ fontWeight: 600 }}>{row.match_runs}</td>
                      <td>{row.avg_results}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

function PatentCard({ icon: Icon, label, value, hint, color }: {
  icon: any; label: string; value: string; hint: string; color: string;
}) {
  return (
    <div className="stat-card" style={{ position: 'relative' }}>
      <div className="stat-card-header">
        <span className="stat-card-label">{label}</span>
        <div className={`stat-card-icon ${color}`}><Icon size={18} /></div>
      </div>
      <div className="stat-card-value">{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}
