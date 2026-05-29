/**
 * Org → Activity Feed
 *
 * Reads the organization_member_activity view (migration 081 §6),
 * which is the audit log bucketed into human-friendly categories
 * (task / project / comment / invite / member / department / team).
 *
 * Distinct from /org/audit: the audit page is the dense, filterable,
 * diff-viewable engineering view. This page is the "what's happening
 * in the workspace" feed designed for owners/managers who want a
 * scannable timeline.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Activity as ActivityIcon, RefreshCw,
    CheckSquare, FolderKanban, MessageSquare, Mail, UserPlus, Building2, Users, FileText,
} from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import { orgMemberActivity, type MemberActivityRow } from '../../lib/org';
import { OrgPageShell } from '../../components/org';
import SearchFilter from '../../components/ui/SearchFilter';
import { ListSkeleton } from '../../components/ui/Skeletons';
import EmptyState from '../../components/ui/EmptyState';
import { toast } from '../../components/ui/Toast';

const PAGE = 50;

const BUCKET_META: Record<MemberActivityRow['activity_bucket'], { icon: any; color: string; label: string }> = {
    task:       { icon: CheckSquare,   color: '#22c55e', label: 'Task'       },
    project:    { icon: FolderKanban,  color: '#6366f1', label: 'Project'    },
    comment:    { icon: MessageSquare, color: '#0ea5e9', label: 'Comment'    },
    invite:     { icon: Mail,          color: '#eab308', label: 'Invite'     },
    member:     { icon: UserPlus,      color: '#a855f7', label: 'Member'     },
    department: { icon: Building2,     color: '#f97316', label: 'Department' },
    team:       { icon: Users,         color: '#14b8a6', label: 'Team'       },
    other:      { icon: FileText,      color: '#8a8a96', label: 'Other'      },
};

const BUCKET_OPTIONS: Array<{ value: MemberActivityRow['activity_bucket']; label: string }> = [
    { value: 'task',       label: 'Tasks'       },
    { value: 'project',    label: 'Projects'    },
    { value: 'comment',    label: 'Comments'    },
    { value: 'invite',     label: 'Invites'     },
    { value: 'member',     label: 'Members'     },
    { value: 'department', label: 'Departments' },
    { value: 'team',       label: 'Teams'       },
];

export default function OrgActivityPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;

    const [rows, setRows]       = useState<MemberActivityRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery]     = useState('');
    const [bucket, setBucket]   = useState<MemberActivityRow['activity_bucket'] | null>(null);
    const [offset, setOffset]   = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const load = useCallback(async (reset = false) => {
        if (!orgId) return;
        setLoading(true);
        const off = reset ? 0 : offset;
        try {
            const data = await orgMemberActivity({ orgId, bucket, limit: PAGE, offset: off });
            setRows(reset ? data : [...rows, ...data]);
            setHasMore(data.length === PAGE);
            setOffset(reset ? PAGE : off + PAGE);
        } catch (e: any) {
            toast.error('Could not load activity', { detail: e?.message });
        } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId, offset, bucket]);

    useEffect(() => {
        setRows([]); setOffset(0); setHasMore(true);
        void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId, bucket]);

    const filtered = useMemo(() => {
        if (!query.trim()) return rows;
        const q = query.toLowerCase();
        return rows.filter((r) =>
            r.action.toLowerCase().includes(q)
            || (r.resource_type ?? '').toLowerCase().includes(q)
        );
    }, [rows, query]);

    return (
        <OrgPageShell
            title="Activity"
            subtitle="What's happening across this workspace, grouped by area."
            icon={<ActivityIcon size={20} />}
            require="adminTier"
            actions={
                <button className="btn btn-ghost" onClick={() => load(true)}>
                    <RefreshCw size={14} /> Refresh
                </button>
            }
        >
            <SearchFilter
                query={query}
                onQueryChange={setQuery}
                placeholder="Search action or resource…"
                chips={[
                    {
                        key: 'bucket',
                        label: 'Type',
                        value: bucket,
                        onChange: (v) => setBucket(v as any),
                        options: BUCKET_OPTIONS,
                    },
                ]}
                rightExtra={
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {filtered.length} event{filtered.length === 1 ? '' : 's'}
                    </span>
                }
            />

            <div style={{ border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8, overflow: 'hidden' }}>
                {loading && rows.length === 0 ? (
                    <ListSkeleton rows={8} />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={ActivityIcon}
                        title="Nothing here yet"
                        body="As members create tasks, comment, invite teammates, the timeline shows up here."
                    />
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {filtered.map((r) => {
                            const meta = BUCKET_META[r.activity_bucket] ?? BUCKET_META.other;
                            const Icon = meta.icon;
                            const summary = humanize(r);
                            return (
                                <li key={r.id} style={{
                                    display: 'flex', gap: 12, padding: '12px 16px',
                                    borderTop: '1px solid var(--border-subtle,#2a2a35)',
                                }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 8,
                                        background: meta.color + '22', color: meta.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexShrink: 0,
                                    }}>
                                        <Icon size={16} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{summary}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                                            {r.action}
                                            {r.actor_user_id && ` · by ${r.actor_user_id.slice(0, 8)}…`}
                                            {' · '}
                                            {new Date(r.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {!loading && hasMore && filtered.length > 0 && (
                    <button
                        className="btn btn-ghost"
                        style={{ width: '100%', borderRadius: 0, padding: '12px 0' }}
                        onClick={() => load(false)}
                    >
                        Load more
                    </button>
                )}
            </div>
        </OrgPageShell>
    );
}

/**
 * Map an action key to a readable one-line summary. Falls back to
 * the raw key when we don't recognise it.
 */
function humanize(r: MemberActivityRow): string {
    const what = r.resource_type ?? 'item';
    const tail = r.after?.name ?? r.after?.title ?? r.after?.email ?? null;
    if (r.action.endsWith('.created')) return `Created ${what}${tail ? `: ${tail}` : ''}`;
    if (r.action.endsWith('.updated')) return `Updated ${what}${tail ? `: ${tail}` : ''}`;
    if (r.action.endsWith('.deleted')) return `Deleted ${what}`;
    if (r.action === 'member.provisioned') return `Added member ${r.after?.email ?? ''} as ${r.after?.role ?? ''}`;
    if (r.action === 'join_request.created') return `Requested to join${r.after?.email ? ` — ${r.after.email}` : ''}`;
    if (r.action === 'join_request.approved') return `Approved join request`;
    if (r.action === 'join_request.rejected') return `Rejected join request`;
    if (r.action === 'org.provisioned')      return `Workspace provisioned`;
    return r.action;
}
