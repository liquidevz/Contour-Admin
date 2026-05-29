/**
 * Org → Join Requests
 *
 * Admin queue for users who requested access via the mobile request-to-join
 * flow (only fires when a domain's join_policy is 'request_approval').
 *
 * Owners / admins approve or reject. Approving creates the membership
 * directly via org_approve_join_request RPC, which:
 *   - flips request.status → 'approved'
 *   - inserts organization_members with status='active', invite_source='request_approved'
 *   - writes audit + status-history rows automatically
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserCheck, RefreshCw, Check, X, Loader2, Inbox } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    orgListJoinRequests, orgApproveJoinRequest, orgRejectJoinRequest,
    type JoinRequestRow, type JoinRequestStatus, type OrgRole,
} from '../../lib/org';
import { OrgPageShell, Avatar } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';
import { TableSkeleton } from '../../components/ui/Skeletons';
import EmptyState from '../../components/ui/EmptyState';
import SearchFilter from '../../components/ui/SearchFilter';

const ASSIGNABLE_ROLES: OrgRole[] = ['admin', 'manager', 'member', 'guest'];

export default function OrgJoinRequestsPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows]       = useState<JoinRequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId]   = useState<string | null>(null);
    const [tab, setTab]         = useState<JoinRequestStatus | 'all'>('pending');
    const [query, setQuery]     = useState('');
    // Per-row role selection when approving. Default 'member' until the
    // admin picks otherwise. Kept in a map so multiple rows can be open
    // simultaneously without cross-contamination.
    const [roleMap, setRoleMap] = useState<Record<string, OrgRole>>({});

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            setRows(await orgListJoinRequests({ orgId, status: tab }));
        } catch (e: any) {
            showToast(e?.message ?? 'Could not load requests', 'error');
        } finally { setLoading(false); }
    }, [orgId, tab, showToast]);

    useEffect(() => { void load(); }, [load]);

    const filtered = useMemo(() => {
        if (!query.trim()) return rows;
        const q = query.toLowerCase();
        return rows.filter((r) =>
            r.email_at_request.toLowerCase().includes(q)
            || (r.display_name ?? '').toLowerCase().includes(q)
            || (r.message ?? '').toLowerCase().includes(q)
        );
    }, [rows, query]);

    const handleApprove = (r: JoinRequestRow) => {
        const role = roleMap[r.id] ?? 'member';
        confirm({
            title: `Approve ${r.display_name ?? r.email_at_request}?`,
            message: `They will become an active ${role} of this workspace. They can be reached at ${r.email_at_request}.`,
            confirmText: `Approve as ${role}`,
            variant: 'info',
            onConfirm: async () => {
                setBusyId(r.id);
                try {
                    await orgApproveJoinRequest({ requestId: r.id, role });
                    await load();
                    showToast(`${r.email_at_request} added as ${role}`);
                } catch (e: any) {
                    showToast(e?.message ?? 'Could not approve', 'error');
                } finally { setBusyId(null); }
            },
        });
    };

    const handleReject = (r: JoinRequestRow) => {
        confirm({
            title: `Reject request from ${r.email_at_request}?`,
            message: 'They will not be added. They can submit another request later.',
            confirmText: 'Reject',
            variant: 'danger',
            onConfirm: async () => {
                setBusyId(r.id);
                try {
                    await orgRejectJoinRequest(r.id);
                    await load();
                    showToast('Request rejected');
                } catch (e: any) {
                    showToast(e?.message ?? 'Could not reject', 'error');
                } finally { setBusyId(null); }
            },
        });
    };

    const TABS: Array<{ key: JoinRequestStatus | 'all'; label: string }> = [
        { key: 'pending',   label: 'Pending'   },
        { key: 'approved',  label: 'Approved'  },
        { key: 'rejected',  label: 'Rejected'  },
        { key: 'withdrawn', label: 'Withdrawn' },
        { key: 'all',       label: 'All'       },
    ];

    return (
        <OrgPageShell
            title="Join requests"
            subtitle="Users requesting access to this workspace. Approve to add them as members."
            icon={<UserCheck size={20} />}
            require="adminTier"
            actions={
                <button className="btn btn-ghost" onClick={() => load()}>
                    <RefreshCw size={14} /> Refresh
                </button>
            }
        >
            {/* Tabs */}
            <div style={{
                display: 'flex', gap: 4, marginBottom: 12,
                background: 'var(--bg-elevated, #14141c)',
                padding: 4, borderRadius: 6, width: 'fit-content',
            }}>
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ padding: '6px 12px' }}
                        onClick={() => setTab(t.key)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <SearchFilter
                query={query}
                onQueryChange={setQuery}
                placeholder="Search by email, name, or message…"
                rightExtra={
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {filtered.length} request{filtered.length === 1 ? '' : 's'}
                    </span>
                }
            />

            <div style={{
                border: '1px solid var(--border-subtle,#2a2a35)',
                borderRadius: 8, overflow: 'hidden',
            }}>
                {loading ? (
                    <TableSkeleton rows={6} cols={5} />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon={Inbox}
                        title={tab === 'pending' ? 'No pending requests' : `No ${tab} requests`}
                        body={
                            tab === 'pending'
                                ? 'When someone uses the mobile app to request access, they\'ll show up here.'
                                : 'Switch tabs to view requests in other states.'
                        }
                    />
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-elevated,#14141c)', textAlign: 'left' }}>
                                <th style={th}>Requester</th>
                                <th style={th}>Message</th>
                                <th style={th}>Submitted</th>
                                <th style={th}>Status</th>
                                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r) => (
                                <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle,#2a2a35)' }}>
                                    <td style={td}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <Avatar name={r.display_name} email={r.email_at_request} url={null} size={32} />
                                            <div>
                                                <div style={{ fontWeight: 500 }}>
                                                    {r.display_name ?? r.email_at_request.split('@')[0]}
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                    {r.email_at_request}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ ...td, maxWidth: 320, color: 'var(--text-secondary)' }}>
                                        {r.message
                                            ? <span title={r.message}>{r.message.length > 80 ? r.message.slice(0, 80) + '…' : r.message}</span>
                                            : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                    <td style={{ ...td, color: 'var(--text-muted)' }}>
                                        {new Date(r.created_at).toLocaleString()}
                                    </td>
                                    <td style={td}>
                                        <StatusPill status={r.status} />
                                        {r.decision_note && (
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                                                {r.decision_note}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ ...td, textAlign: 'right', minWidth: 220 }}>
                                        {r.status === 'pending' ? (
                                            busyId === r.id ? (
                                                <Loader2 size={14} className="spin" />
                                            ) : (
                                                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                                    <select
                                                        className="input-field input-field-sm"
                                                        style={{ width: 100 }}
                                                        value={roleMap[r.id] ?? 'member'}
                                                        onChange={(e) => setRoleMap((m) => ({ ...m, [r.id]: e.target.value as OrgRole }))}
                                                    >
                                                        {ASSIGNABLE_ROLES.map((role) => (
                                                            <option key={role} value={role}>{role}</option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        className="btn btn-primary btn-sm"
                                                        onClick={() => handleApprove(r)}
                                                        title="Approve and add as member"
                                                    >
                                                        <Check size={14} /> Approve
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => handleReject(r)}
                                                        title="Reject this request"
                                                        style={{ color: '#ef4444' }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            )
                                        ) : (
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                {r.reviewed_at && `decided ${new Date(r.reviewed_at).toLocaleDateString()}`}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}

function StatusPill({ status }: { status: JoinRequestStatus }) {
    const map: Record<JoinRequestStatus, { bg: string; fg: string; label: string }> = {
        pending:   { bg: 'rgba(234,179,8,0.15)',   fg: '#eab308', label: 'Pending'   },
        approved:  { bg: 'rgba(34,197,94,0.15)',   fg: '#22c55e', label: 'Approved'  },
        rejected:  { bg: 'rgba(239,68,68,0.15)',   fg: '#ef4444', label: 'Rejected'  },
        withdrawn: { bg: 'rgba(138,138,150,0.15)', fg: '#b0b0bc', label: 'Withdrawn' },
        expired:   { bg: 'rgba(138,138,150,0.15)', fg: '#8a8a96', label: 'Expired'   },
    };
    const s = map[status];
    return (
        <span style={{
            display: 'inline-block', padding: '2px 8px',
            background: s.bg, color: s.fg,
            borderRadius: 4, fontSize: 11, fontWeight: 600,
        }}>{s.label}</span>
    );
}

const th: React.CSSProperties = {
    padding: '10px 14px', fontSize: 11, letterSpacing: 1,
    textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)', fontWeight: 600,
};
const td: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'top' };
