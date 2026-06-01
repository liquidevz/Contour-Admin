/**
 * PlatformOrgHealth — cross-org task throughput (platform admins only).
 *
 * Renders nothing for non-platform-admins (the RPC rejects them, and we
 * swallow the error). Shown on the global Dashboard.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight } from 'lucide-react';
import { platformOrgHealth, type OrgHealthRow } from '../lib/tasks';

const WINDOWS = [7, 30, 90];

export default function PlatformOrgHealth() {
    const navigate = useNavigate();
    const [rows, setRows] = useState<OrgHealthRow[] | null>(null);
    const [days, setDays] = useState(30);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        let alive = true;
        platformOrgHealth(days, 12)
            .then((r) => { if (alive) setRows(r); })
            .catch(() => { if (alive) setHidden(true); });
        return () => { alive = false; };
    }, [days]);

    if (hidden) return null;

    const max = Math.max(1, ...(rows ?? []).map((r) => r.created_window));

    return (
        <section style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Activity size={16} style={{ color: 'var(--accent,#7c5cff)' }} />
                <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                    Workspace health
                </h2>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    {WINDOWS.map((w) => (
                        <button key={w} onClick={() => setDays(w)} style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                            background: days === w ? 'color-mix(in srgb, var(--accent,#7c5cff) 16%, transparent)' : 'transparent',
                            border: `1px solid ${days === w ? 'var(--accent,#7c5cff)' : 'var(--border-subtle,#2a2a35)'}`,
                            color: days === w ? 'var(--accent,#7c5cff)' : 'var(--text-muted,#8a8a96)',
                        }}>{w}d</button>
                    ))}
                </div>
            </div>

            <div className="data-card" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ color: 'var(--text-muted,#8a8a96)', textAlign: 'left' }}>
                            <th style={th}>Organisation</th>
                            <th style={th}>Members</th>
                            <th style={th}>Open</th>
                            <th style={th}>Created ({days}d)</th>
                            <th style={th}>Completed ({days}d)</th>
                            <th style={th}>Sprints</th>
                            <th style={th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {(rows ?? []).map((r) => (
                            <tr key={r.org_id} style={{ borderTop: '1px solid var(--border-subtle,#2a2a35)' }}>
                                <td style={td}><span style={{ fontWeight: 600 }}>{r.org_name}</span></td>
                                <td style={td}>{r.members}</td>
                                <td style={td}>{r.open_tasks}</td>
                                <td style={td}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--bg-primary,#0a0a0f)', overflow: 'hidden' }}>
                                            <div style={{ height: 6, borderRadius: 3, background: 'var(--accent,#7c5cff)', width: `${(r.created_window / max) * 100}%` }} />
                                        </div>
                                        <span>{r.created_window}</span>
                                    </div>
                                </td>
                                <td style={{ ...td, color: '#22C55E' }}>{r.completed_window}</td>
                                <td style={td}>{r.active_sprints}</td>
                                <td style={td}>
                                    <button className="btn btn-ghost" style={{ padding: '2px 8px' }}
                                        onClick={() => navigate(`/organisations`)} title="Open">
                                        <ArrowRight size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {rows && rows.length === 0 && (
                            <tr><td style={{ ...td, color: 'var(--text-muted,#8a8a96)' }} colSpan={7}>No active workspaces.</td></tr>
                        )}
                        {!rows && (
                            <tr><td style={{ ...td, color: 'var(--text-muted,#8a8a96)' }} colSpan={7}>Loading…</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 };
const td: React.CSSProperties = { padding: '8px 10px', color: 'var(--text-primary,#e0e0e8)' };
