import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { GitBranch, Users, UserCheck, Sparkles, Award } from 'lucide-react';

interface FunnelData {
  window_days: number;
  signups: number;
  tour_started: number;
  tour_completed: number;
  tour_skipped: number;
  profile_complete: number;
  has_offer: number;
  has_want: number;
}

interface CompletionBucket {
  bucket: string;
  user_count: number;
}

export default function OnboardingFunnel() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [buckets, setBuckets] = useState<CompletionBucket[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [f, b] = await Promise.all([
        supabase.rpc('admin_get_onboarding_funnel', { days_back: days }),
        supabase.rpc('admin_get_profile_completion_buckets'),
      ]);
      setFunnel((f.data as FunnelData) || null);
      setBuckets((b.data as CompletionBucket[]) || []);
    } catch (err) {
      console.error('[OnboardingFunnel] load failed', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const stages = funnel
    ? [
        { key: 'signups', label: 'Signed up', value: funnel.signups, icon: Users },
        {
          key: 'tour_started',
          label: 'Tour started',
          value: funnel.tour_started,
          icon: GitBranch,
        },
        {
          key: 'tour_completed',
          label: 'Tour completed',
          value: funnel.tour_completed,
          icon: UserCheck,
        },
        {
          key: 'has_offer',
          label: 'Added an offer',
          value: funnel.has_offer,
          icon: Sparkles,
        },
        {
          key: 'has_want',
          label: 'Added a want',
          value: funnel.has_want,
          icon: Sparkles,
        },
        {
          key: 'profile_complete',
          label: 'Profile complete',
          value: funnel.profile_complete,
          icon: Award,
        },
      ]
    : [];

  const totalForRate = funnel?.signups ?? 0;

  const totalBucketCount = buckets.reduce((s, b) => s + Number(b.user_count), 0);

  return (
    <div>
      <div className="page-header">
        <h1>
          <GitBranch size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Onboarding Funnel
        </h1>
        <p>Signup → tour → profile completion across your last {days} days.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[7, 14, 30, 60, 90].map((d) => (
          <button
            key={d}
            className={`tab-btn ${days === d ? 'active' : ''}`}
            onClick={() => setDays(d)}
          >
            {d}d
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
        </div>
      ) : !funnel ? (
        <div className="empty-state">
          <h3>No funnel data yet</h3>
        </div>
      ) : (
        <div className="two-col-grid">
          {/* Funnel */}
          <div className="data-card">
            <div className="data-card-header">
              <span className="data-card-title">Onboarding flow</span>
            </div>
            <div style={{ padding: 12 }}>
              {stages.map((s, i) => {
                const rate = totalForRate > 0 ? (s.value / totalForRate) * 100 : 0;
                const barWidth = Math.max(rate, 2);
                return (
                  <div key={s.key} style={{ marginBottom: 14 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--text-primary, #fff)',
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <s.icon size={14} />
                        {s.label}
                      </span>
                      <span style={{ fontSize: 13 }}>
                        <strong>{s.value}</strong>
                        <span
                          style={{
                            color: 'var(--text-muted, #5a5a6e)',
                            marginLeft: 8,
                          }}
                        >
                          {i === 0 ? '100%' : `${rate.toFixed(1)}%`}
                        </span>
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: 'var(--bg-secondary, #11111a)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${barWidth}%`,
                          background:
                            i === stages.length - 1
                              ? 'linear-gradient(90deg, #B8F73C, #14B8A6)'
                              : 'var(--accent, #7C3AED)',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 12,
                  borderTop: '1px solid var(--border, #2a2a35)',
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <Metric label="Tour completion rate" value={pct(funnel.tour_completed, funnel.tour_started)} />
                <Metric label="Tour skip rate" value={pct(funnel.tour_skipped, funnel.tour_started)} />
                <Metric
                  label="Signup → complete profile"
                  value={pct(funnel.profile_complete, funnel.signups)}
                />
              </div>
            </div>
          </div>

          {/* Profile completion distribution */}
          <div className="data-card">
            <div className="data-card-header">
              <span className="data-card-title">Profile completion distribution</span>
            </div>
            {buckets.length === 0 ? (
              <div className="empty-state">
                <h3>No profile data</h3>
              </div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>Users</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((row) => {
                      const share =
                        totalBucketCount > 0
                          ? (Number(row.user_count) / totalBucketCount) * 100
                          : 0;
                      return (
                        <tr key={row.bucket}>
                          <td>{row.bucket}</td>
                          <td style={{ fontWeight: 600 }}>{row.user_count}</td>
                          <td>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  height: 6,
                                  borderRadius: 3,
                                  background: 'var(--bg-secondary, #11111a)',
                                  overflow: 'hidden',
                                  minWidth: 80,
                                }}
                              >
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${share}%`,
                                    background: 'var(--accent, #7C3AED)',
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 12, minWidth: 40 }}>
                                {share.toFixed(1)}%
                              </span>
                            </div>
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
      )}
    </div>
  );
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 140 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted, #5a5a6e)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
        {value}
      </div>
    </div>
  );
}
