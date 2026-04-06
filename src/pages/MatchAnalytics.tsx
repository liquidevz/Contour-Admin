import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Zap, TrendingUp, ThumbsUp, ThumbsDown, Eye, MinusCircle } from 'lucide-react';

export default function MatchAnalytics() {
  const [usage, setUsage] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [usageRes, feedbackRes] = await Promise.all([
      supabase.rpc('admin_get_match_usage', { days_back: 30 }),
      supabase.rpc('admin_get_match_feedback_stats'),
    ]);
    setUsage(usageRes.data || []);
    setFeedback(feedbackRes.data);
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
    <div>
      <div className="page-header">
        <h1>Match Engine Analytics</h1>
        <p>Match engine usage trends and feedback breakdown</p>
      </div>

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
    </div>
  );
}
