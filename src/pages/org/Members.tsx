/**
 * Org → Members
 *
 * List + role-edit + remove + ownership transfer. Uses the shared
 * OrgPageShell (handles no-org / permission guards) and Badge / Avatar
 * components.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users as UsersIcon, UserPlus, Trash2, Crown, Loader2 } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    orgListMembers, orgUpdateMember, orgRemoveMember, orgTransferOwnership,
    canManageMembers, departmentList, orgAssignDepartment,
    type OrgMemberRow, type OrgRole, type OrgMemberStatus, type DepartmentRow,
} from '../../lib/org';
import { Avatar, OrgPageShell, RoleBadge, MemberStatusBadge } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';
import SearchFilter from '../../components/ui/SearchFilter';
import { TableSkeleton } from '../../components/ui/Skeletons';
import EmptyState from '../../components/ui/EmptyState';

const ROLES: OrgRole[] = ['owner', 'admin', 'manager', 'member', 'guest'];

const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)', fontWeight: 600 };
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' };

export default function OrgMembersPage() {
    const navigate = useNavigate();
    const { scope } = useScope();
    const orgId = scope.orgId;
    const myRole = scope.role;
    const canManage = canManageMembers(myRole);
    const isOwner = myRole === 'owner';
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows] = useState<OrgMemberRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [roleFilter, setRoleFilter]     = useState<OrgRole | null>(null);
    const [statusFilter, setStatusFilter] = useState<OrgMemberStatus | null>(null);
    // Bulk selection + department assignment.
    const [selected, setSelected]   = useState<Set<string>>(new Set());
    const [depts, setDepts]         = useState<DepartmentRow[]>([]);
    const [assignBusy, setAssignBusy] = useState(false);

    const load = useCallback(async () => {
        if (!orgId) { setRows([]); setLoading(false); return; }
        setLoading(true); setError(null);
        try {
            const [members, ds] = await Promise.all([
                orgListMembers(orgId),
                departmentList(orgId).catch(() => [] as DepartmentRow[]),  // optional if 080 not applied
            ]);
            setRows(members);
            setDepts(ds);
        }
        catch (e: any) { setError(e?.message ?? 'Failed to load members'); }
        finally { setLoading(false); }
    }, [orgId]);

    const handleBulkAssign = async (departmentId: string | null) => {
        if (!orgId || selected.size === 0) return;
        setAssignBusy(true);
        try {
            const n = await orgAssignDepartment(orgId, Array.from(selected), departmentId);
            const deptName = departmentId ? (depts.find((d) => d.id === departmentId)?.name ?? 'department') : 'no department';
            showToast(`Assigned ${n} member${n === 1 ? '' : 's'} to ${deptName}`);
            setSelected(new Set());
            await load();
        } catch (e: any) {
            showToast(e?.message ?? 'Could not assign department', 'error');
        } finally { setAssignBusy(false); }
    };

    const toggleSelected = (uid: string) => {
        setSelected((cur) => {
            const next = new Set(cur);
            if (next.has(uid)) next.delete(uid); else next.add(uid);
            return next;
        });
    };

    useEffect(() => { void load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (roleFilter && r.role !== roleFilter) return false;
            if (statusFilter && r.status !== statusFilter) return false;
            if (!q) return true;
            return [r.email, r.display_name, r.job_title, r.department, r.role]
                .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
        });
    }, [rows, search, roleFilter, statusFilter]);

    // Counts per role/status so chip dropdowns show numbers.
    const roleCounts = useMemo(() => {
        const m: Record<string, number> = {};
        rows.forEach((r) => { m[r.role] = (m[r.role] ?? 0) + 1; });
        return m;
    }, [rows]);
    const statusCounts = useMemo(() => {
        const m: Record<string, number> = {};
        rows.forEach((r) => { m[r.status] = (m[r.status] ?? 0) + 1; });
        return m;
    }, [rows]);

    const handleRoleChange = async (r: OrgMemberRow, newRole: OrgRole) => {
        if (!orgId || newRole === r.role) return;
        setBusyId(r.user_id);
        try { await orgUpdateMember({ orgId, userId: r.user_id, role: newRole }); await load(); showToast('Role updated'); }
        catch (e: any) { showToast(e?.message ?? 'Could not update member', 'error'); }
        finally { setBusyId(null); }
    };

    const handleRemove = (r: OrgMemberRow) => {
        if (!orgId) return;
        confirm({
            title: `Remove ${r.display_name ?? r.email ?? 'this member'}?`,
            message: 'They will lose access to this workspace immediately.',
            confirmText: 'Remove', variant: 'danger',
            onConfirm: async () => {
                setBusyId(r.user_id);
                try { await orgRemoveMember(orgId, r.user_id); await load(); showToast('Member removed'); }
                catch (e: any) { showToast(e?.message ?? 'Could not remove member', 'error'); }
                finally { setBusyId(null); }
            },
        });
    };

    const handleTransfer = (r: OrgMemberRow) => {
        if (!orgId) return;
        confirm({
            title: `Transfer ownership to ${r.display_name ?? r.email}?`,
            message: 'You will become an admin. This cannot be undone without the new owner.',
            confirmText: 'Transfer', variant: 'warning',
            onConfirm: async () => {
                setBusyId(r.user_id);
                try { await orgTransferOwnership(orgId, r.user_id); await load(); showToast('Ownership transferred'); }
                catch (e: any) { showToast(e?.message ?? 'Could not transfer ownership', 'error'); }
                finally { setBusyId(null); }
            },
        });
    };

    return (
        <OrgPageShell
            title="Members"
            subtitle="Manage who has access to this workspace and what role they hold."
            icon={<UsersIcon size={20} />}
            actions={canManage ? (
                <button className="btn btn-primary" onClick={() => navigate('/org/invites')}>
                    <UserPlus size={16} /> Invite member
                </button>
            ) : null}
        >
            <SearchFilter
                query={search}
                onQueryChange={setSearch}
                placeholder="Search by email, name, title, department…"
                chips={[
                    {
                        key: 'role',
                        label: 'Role',
                        value: roleFilter,
                        onChange: (v) => setRoleFilter(v as OrgRole | null),
                        options: ROLES.map((r) => ({ value: r, label: r, count: roleCounts[r] })),
                    },
                    {
                        key: 'status',
                        label: 'Status',
                        value: statusFilter,
                        onChange: (v) => setStatusFilter(v as OrgMemberStatus | null),
                        options: (['active','invited','suspended','left'] as OrgMemberStatus[]).map((s) => ({
                            value: s, label: s, count: statusCounts[s],
                        })),
                    },
                ]}
                rightExtra={
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {filtered.length} of {rows.length} member{rows.length === 1 ? '' : 's'}
                    </span>
                }
            />

            {/* Bulk-action bar — visible only when one or more rows checked */}
            {canManage && selected.size > 0 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', marginBottom: 12,
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: 8,
                }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                        {selected.size} selected
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                        Assign to department:
                    </span>
                    <select
                        className="input-field input-field-sm"
                        disabled={assignBusy}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (!v) return;
                            void handleBulkAssign(v === '__none__' ? null : v);
                            e.target.value = '';
                        }}
                        style={{ width: 180 }}
                    >
                        <option value="">— pick one —</option>
                        <option value="__none__">Clear department</option>
                        {depts.filter((d) => d.archived_at === null).map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} disabled={assignBusy}>
                        Clear
                    </button>
                    {assignBusy && <Loader2 size={14} className="spin" />}
                </div>
            )}

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {loading ? (
                <div style={{ border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8, overflow: 'hidden' }}>
                    <TableSkeleton rows={6} cols={6} />
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-elevated,#14141c)', textAlign: 'left' }}>
                                {canManage && (
                                    <th style={{ ...th, width: 36, padding: '10px 8px' }}>
                                        <input
                                            type="checkbox"
                                            checked={filtered.length > 0 && filtered.every((r) => selected.has(r.user_id))}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelected(new Set(filtered.map((r) => r.user_id)));
                                                else setSelected(new Set());
                                            }}
                                            aria-label="Select all"
                                        />
                                    </th>
                                )}
                                <th style={th}>Member</th>
                                <th style={th}>Role</th>
                                <th style={th}>Status</th>
                                <th style={th}>Title</th>
                                <th style={th}>Joined</th>
                                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r) => (
                                <tr key={r.user_id} style={{
                                    borderTop: '1px solid var(--border-subtle,#2a2a35)',
                                    background: selected.has(r.user_id) ? 'rgba(99,102,241,0.06)' : undefined,
                                }}>
                                    {canManage && (
                                        <td style={{ ...td, padding: '10px 8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={selected.has(r.user_id)}
                                                onChange={() => toggleSelected(r.user_id)}
                                                aria-label={`Select ${r.email ?? r.user_id}`}
                                            />
                                        </td>
                                    )}
                                    <td style={{ ...td, cursor: 'pointer' }}
                                        onClick={() => navigate(`/org/members/${r.user_id}`)}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <Avatar name={r.display_name} email={r.email} url={r.avatar_url} size={32} />
                                            <div>
                                                <div style={{ fontWeight: 500 }}>{r.display_name ?? '—'}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>{r.email ?? '—'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={td}>
                                        {canManage && r.role !== 'owner' ? (
                                            <select
                                                value={r.role}
                                                disabled={busyId === r.user_id}
                                                onChange={(e) => handleRoleChange(r, e.target.value as OrgRole)}
                                                className="input-field"
                                                style={{ padding: '4px 8px', fontSize: 13 }}
                                            >
                                                {ROLES.filter((x) => x !== 'owner' || isOwner).map((x) => (
                                                    <option key={x} value={x}>{x}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <RoleBadge role={r.role} />
                                        )}
                                    </td>
                                    <td style={td}><MemberStatusBadge status={r.status} /></td>
                                    <td style={td}>{r.job_title ?? '—'}</td>
                                    <td style={td}>{r.joined_at ? new Date(r.joined_at).toLocaleDateString() : '—'}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        {busyId === r.user_id && <Loader2 size={14} className="spin" />}
                                        {canManage && r.role !== 'owner' && busyId !== r.user_id && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleRemove(r)}
                                                title="Remove member"
                                            ><Trash2 size={14} /></button>
                                        )}
                                        {isOwner && r.role !== 'owner' && busyId !== r.user_id && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleTransfer(r)}
                                                title="Transfer ownership"
                                                style={{ marginLeft: 4 }}
                                            ><Crown size={14} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr><td colSpan={6} style={{ padding: 0 }}>
                                    <EmptyState
                                        icon={UsersIcon}
                                        title="No members match"
                                        body="Try clearing filters or adjusting your search."
                                    />
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}
