/**
 * Org → Audit log
 *
 * Reads the per-org audit trail via the org_audit_list() RPC
 * (migration 073) so we can server-side filter by actor,
 * action prefix, resource_type, and date range. Joins actor
 * email/name automatically.
 *
 * Features:
 *   - Debounced search across action + resource_type
 *   - Filter chips for action category and resource type
 *   - Date range
 *   - Expandable row with before/after JSON diff
 *   - CSV export of the current filtered view
 *
 * Append-only — server policy ensures we never UPDATE or DELETE.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ScrollText, RefreshCw, Download, ChevronDown, ChevronRight,
    User as UserIcon, Cog,
} from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import { OrgPageShell } from '../../components/org';
import SearchFilter from '../../components/ui/SearchFilter';
import { TableSkeleton } from '../../components/ui/Skeletons';
import EmptyState from '../../components/ui/EmptyState';
import { toast } from '../../components/ui/Toast';
import { orgAuditList, type AuditRow } from '../../lib/org';

const ACTION_CATEGORIES = [
    { value: 'org.',                    label: 'Organization' },
    { value: 'member.',                 label: 'Member' },
    { value: 'organization_members.',   label: 'Member changes' },
    { value: 'organization_domains.',   label: 'Domain changes' },
    { value: 'organization_invites.',   label: 'Invite changes' },
    { value: 'organizations.',          label: 'Org settings changes' },
];

const RESOURCE_TYPES = [
    { value: 'organization',           label: 'Organization' },
    { value: 'organizations',          label: 'Organization (settings)' },
    { value: 'organization_members',   label: 'Members' },
    { value: 'organization_domains',   label: 'Domains' },
    { value: 'organization_invites',   label: 'Invites' },
    { value: 'user',                   label: 'User' },
];

const PAGE = 50;

export default function OrgAuditPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;

    const [rows, setRows]           = useState<AuditRow[]>([]);
    const [loading, setLoading]     = useState(true);
    const [offset, setOffset]       = useState(0);
    const [hasMore, setHasMore]     = useState(true);
    const [expanded, setExpanded]   = useState<Record<string, boolean>>({});

    // Filters
    const [query, setQuery]                 = useState('');
    const [actionCat, setActionCat]         = useState<string | null>(null);
    const [resourceType, setResourceType]   = useState<string | null>(null);
    const [from, setFrom]                   = useState<string | null>(null);
    const [until, setUntil]                 = useState<string | null>(null);

    const load = useCallback(async (reset = false) => {
        if (!orgId) return;
        setLoading(true);
        const off = reset ? 0 : offset;
        try {
            const data = await orgAuditList({
                orgId,
                action:       actionCat,
                resourceType: resourceType,
                since:        from ? new Date(from).toISOString() : null,
                until:        until ? new Date(until + 'T23:59:59').toISOString() : null,
                limit:        PAGE,
                offset:       off,
            });
            setRows(reset ? data : [...rows, ...data]);
            setHasMore(data.length === PAGE);
            setOffset(reset ? PAGE : off + PAGE);
        } catch (e: any) {
            toast.error('Could not load audit log', { detail: e?.message });
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId, offset, actionCat, resourceType, from, until]);

    useEffect(() => {
        setRows([]); setOffset(0); setHasMore(true);
        void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId, actionCat, resourceType, from, until]);

    // Client-side keyword filter against action + resource_type + actor_email.
    // The server query already prefix-filters action, so this is cheap.
    const filtered = useMemo(() => {
        if (!query.trim()) return rows;
        const q = query.toLowerCase();
        return rows.filter((r) =>
            r.action.toLowerCase().includes(q)
            || (r.resource_type ?? '').toLowerCase().includes(q)
            || (r.actor_email ?? '').toLowerCase().includes(q)
            || (r.actor_name ?? '').toLowerCase().includes(q)
        );
    }, [rows, query]);

    const toggleRow = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }));

    const exportCsv = () => {
        if (filtered.length === 0) {
            toast.info('Nothing to export');
            return;
        }
        const head = ['created_at','action','resource_type','resource_id','actor_email','actor_name','before','after'];
        const lines = [head.join(',')];
        for (const r of filtered) {
            const cells = [
                r.created_at,
                r.action,
                r.resource_type ?? '',
                r.resource_id ?? '',
                r.actor_email ?? '',
                r.actor_name ?? '',
                JSON.stringify(r.before ?? null),
                JSON.stringify(r.after ?? null),
            ].map((c) => {
                const s = String(c).replace(/"/g, '""');
                return `"${s}"`;
            });
            lines.push(cells.join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `audit-${orgId}-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${filtered.length} rows`);
    };

    return (
        <OrgPageShell
            title="Audit log"
            subtitle="Every administrative action in this workspace, append-only."
            icon={<ScrollText size={20} />}
            require="adminTier"
            actions={
                <div className="btn-group">
                    <button className="btn btn-ghost" onClick={exportCsv} disabled={filtered.length === 0}>
                        <Download size={14} /> Export CSV
                    </button>
                    <button className="btn btn-ghost" onClick={() => load(true)}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>
            }
        >
            <SearchFilter
                query={query}
                onQueryChange={setQuery}
                placeholder="Search action, resource type, actor…"
                chips={[
                    {
                        key: 'action',
                        label: 'Category',
                        value: actionCat,
                        onChange: setActionCat,
                        options: ACTION_CATEGORIES,
                    },
                    {
                        key: 'resource',
                        label: 'Resource',
                        value: resourceType,
                        onChange: setResourceType,
                        options: RESOURCE_TYPES,
                    },
                ]}
                dateRange={{
                    from, until,
                    onChange: (f, u) => { setFrom(f); setUntil(u); },
                }}
                rightExtra={
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {filtered.length} event{filtered.length === 1 ? '' : 's'}
                    </span>
                }
            />

            <div style={{
                border: '1px solid var(--border-subtle,#2a2a35)',
                borderRadius: 8, overflow: 'hidden',
            }}>
                {loading && rows.length === 0 ? (
                    <TableSkeleton rows={8} cols={5} />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={ScrollText}
                        title="No audit entries match"
                        body="Adjust filters or check back after admins make changes."
                    />
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-elevated,#14141c)', textAlign: 'left' }}>
                                <th style={th} aria-label="Expand"></th>
                                <th style={th}>When</th>
                                <th style={th}>Action</th>
                                <th style={th}>Resource</th>
                                <th style={th}>Actor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r) => (
                                <AuditRowView
                                    key={r.id}
                                    row={r}
                                    expanded={!!expanded[r.id]}
                                    onToggle={() => toggleRow(r.id)}
                                />
                            ))}
                        </tbody>
                    </table>
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

/* ───────── single row + expandable diff ───────── */

function AuditRowView({ row, expanded, onToggle }: { row: AuditRow; expanded: boolean; onToggle: () => void }) {
    const hasDiff = row.before !== null || row.after !== null;
    return (
        <>
            <tr style={{ borderTop: '1px solid var(--border-subtle,#2a2a35)', cursor: hasDiff ? 'pointer' : 'default' }}
                onClick={hasDiff ? onToggle : undefined}>
                <td style={{ ...td, width: 28 }}>
                    {hasDiff && (expanded
                        ? <ChevronDown size={14} />
                        : <ChevronRight size={14} />)}
                </td>
                <td style={td}>{new Date(row.created_at).toLocaleString()}</td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>
                    {row.action}
                </td>
                <td style={td}>
                    {row.resource_type ?? '—'}
                    {row.resource_id && (
                        <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                            ({row.resource_id.slice(0, 8)})
                        </span>
                    )}
                </td>
                <td style={td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {row.actor_user_id ? <UserIcon size={12} /> : <Cog size={12} />}
                        {row.actor_email ?? row.actor_name ?? (row.actor_user_id ? row.actor_user_id.slice(0, 8) + '…' : 'system')}
                    </span>
                </td>
            </tr>
            {expanded && hasDiff && (
                <tr style={{ background: 'var(--bg-elevated,#0e0e16)' }}>
                    <td colSpan={5} style={{ padding: 16 }}>
                        <DiffView before={row.before} after={row.after} />
                    </td>
                </tr>
            )}
        </>
    );
}

function DiffView({ before, after }: { before: any; after: any }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
            <div>
                <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#ef4444', marginBottom: 6 }}>Before</div>
                <pre style={preStyle}>{before ? JSON.stringify(before, null, 2) : '— (created)'}</pre>
            </div>
            <div>
                <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#22c55e', marginBottom: 6 }}>After</div>
                <pre style={preStyle}>{after ? JSON.stringify(after, null, 2) : '— (deleted)'}</pre>
            </div>
        </div>
    );
}

const preStyle: React.CSSProperties = {
    margin: 0, padding: 10,
    background: 'var(--bg-base,#0a0a14)',
    border: '1px solid var(--border-subtle,#2a2a35)',
    borderRadius: 6, maxHeight: 320, overflow: 'auto',
};

const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)', fontWeight: 600 };
const td: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'top' };
