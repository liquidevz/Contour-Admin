/**
 * Org → Dashboard
 *
 * Landing page when the active scope is an org. Shows headline counts,
 * pending items the admin needs to act on, and recent activity.
 *
 * Data sources:
 *   - admin_get_org_summary (for org metadata + domain + counts)
 *     OR a lighter direct query (we have RLS-protected counts via
 *     organization_members / organization_invites / teams)
 *   - organization_audit_log (recent activity, scoped)
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Building2, Users, Mail, Briefcase, ShieldAlert, Loader2, ArrowRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useScope } from '../../context/ScopeContext';
import MetricCard from '../../components/ui/MetricCard';
import { OrgPageShell } from '../../components/org';

interface Summary {
    activeMembers: number;
    pendingInvites: number;
    teams: number;
    needsAttention: boolean;       // domain not verified, etc.
    domainVerified: boolean | null;
    domainName: string | null;
}

interface AuditRow {
    id: string;
    action: string;
    resource_type: string | null;
    actor_user_id: string | null;
    created_at: string;
    after: any;
}

export default function OrgDashboardPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;
    const [summary, setSummary] = useState<Summary | null>(null);
    const [recent, setRecent] = useState<AuditRow[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const [members, invites, teams, dom, audit] = await Promise.all([
                supabase.from('organization_members')
                    .select('user_id', { count: 'exact', head: true })
                    .eq('org_id', orgId).eq('status', 'active'),
                supabase.from('organization_invites')
                    .select('id', { count: 'exact', head: true })
                    .eq('org_id', orgId).eq('status', 'pending'),
                supabase.from('teams')
                    .select('id', { count: 'exact', head: true })
                    .eq('org_id', orgId).is('archived_at', null),
                supabase.from('organization_domains')
                    .select('domain, verified').eq('org_id', orgId)
                    .order('verified', { ascending: false }).limit(1).maybeSingle(),
                supabase.from('organization_audit_log')
                    .select('id, action, resource_type, actor_user_id, created_at, after')
                    .eq('org_id', orgId).order('created_at', { ascending: false }).limit(8),
            ]);

            setSummary({
                activeMembers: members.count ?? 0,
                pendingInvites: invites.count ?? 0,
                teams: teams.count ?? 0,
                domainVerified: dom.data?.verified ?? null,
                domainName: dom.data?.domain ?? null,
                needsAttention: dom.data?.verified === false,
            });
            setRecent((audit.data ?? []) as AuditRow[]);
        } finally { setLoading(false); }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    return (
        <OrgPageShell
            title={scope.membership?.org_name ?? 'Workspace'}
            subtitle="At-a-glance overview of your organisation."
            icon={<Building2 size={20} />}
        >
            {loading || !summary ? (
                <div style={{ padding: 32, color: 'var(--text-muted,#8a8a96)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Loader2 size={14} className="spin" /> Loading…
                </div>
            ) : (
                <>
                    {/* Metric cards */}
                    <div className="org-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                        <MetricCard
                            label="Active members"
                            value={summary.activeMembers}
                            icon={Users}
                        />
                        <MetricCard
                            label="Pending invites"
                            value={summary.pendingInvites}
                            icon={Mail}
                        />
                        <MetricCard
                            label="Teams"
                            value={summary.teams}
                            icon={Briefcase}
                        />
                    </div>

                    {/* Needs-attention strip */}
                    {summary.needsAttention && (
                        <div style={{
                            padding: 14,
                            border: '1px solid #f59e0b40',
                            background: 'rgba(245,158,11,0.08)',
                            borderRadius: 8,
                            marginBottom: 20,
                            display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                            <ShieldAlert size={18} style={{ color: '#f59e0b' }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500 }}>
                                    Domain not verified
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted,#8a8a96)' }}>
                                    {summary.domainName ?? 'Your domain'} hasn&apos;t been verified yet.
                                    Teammates can&apos;t auto-join until you publish the DNS TXT record.
                                </div>
                            </div>
                            <Link to="/org/settings" className="btn btn-primary btn-sm">
                                Fix it <ArrowRight size={12} />
                            </Link>
                        </div>
                    )}

                    {/* Recent activity */}
                    <section className="glass-card" style={{ borderRadius: 8 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle,#2a2a35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Recent activity</h3>
                            <Link to="/org/audit" style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>
                                View all →
                            </Link>
                        </div>
                        {recent.length === 0 ? (
                            <div style={{ padding: 20, color: 'var(--text-muted,#8a8a96)', fontSize: 13 }}>
                                No activity yet.
                            </div>
                        ) : (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {recent.map((r) => (
                                    <li key={r.id} style={{
                                        padding: '10px 16px',
                                        borderBottom: '1px solid var(--border-subtle,#2a2a35)',
                                        display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13,
                                    }}>
                                        <span style={{ fontFamily: 'monospace', color: 'var(--text-muted,#8a8a96)', fontSize: 12 }}>
                                            {r.action}
                                        </span>
                                        <span style={{ color: 'var(--text-muted,#8a8a96)', fontSize: 12, whiteSpace: 'nowrap' }}>
                                            {new Date(r.created_at).toLocaleString()}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </>
            )}
        </OrgPageShell>
    );
}
