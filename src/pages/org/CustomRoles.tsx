/**
 * Org → Custom Roles
 *
 * Per-org role definitions layered on top of the 5 built-ins
 * (owner/admin/manager/member/guest). Each custom role:
 *   - inherits permissions of a base role (server falls back to it
 *     for any check not explicitly overridden)
 *   - has its own selected set of fine-grained permissions
 *   - can be assigned to a member via org_assign_custom_role
 *
 * Useful examples:
 *   "Read-only auditor" — base=guest + audit.view
 *   "Project lead"      — base=member + project.create + project.edit + member.invite
 */

import { useCallback, useEffect, useState } from 'react';
import {
    Crown, Plus, Pencil, Archive, ArchiveRestore, Loader2, ShieldCheck, RefreshCw,
} from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    orgCustomRoleList, orgCustomRoleCreate, orgCustomRoleUpdate, orgCustomRoleArchive,
    orgCustomRoleSetPermissions, customRolePermissionKeys, permissionsList,
    type CustomRoleRow, type PermissionRow,
} from '../../lib/org';
import { OrgPageShell, Modal, FormField } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';
import { TableSkeleton } from '../../components/ui/Skeletons';
import EmptyState from '../../components/ui/EmptyState';

const BASE_ROLES = ['admin', 'manager', 'member', 'guest'] as const;
type BaseRole = typeof BASE_ROLES[number];

interface EditState {
    id?:          string;
    name:         string;
    description:  string;
    baseRole:     BaseRole;
    selectedPerms: Set<string>;
}

const EMPTY: EditState = { name: '', description: '', baseRole: 'member', selectedPerms: new Set() };

export default function OrgCustomRolesPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows]           = useState<CustomRoleRow[]>([]);
    const [permissions, setPerms]   = useState<PermissionRow[]>([]);
    const [loading, setLoading]     = useState(true);
    const [busyId, setBusyId]       = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [form, setForm]         = useState<EditState>(EMPTY);
    const [saving, setSaving]     = useState(false);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const [roles, perms] = await Promise.all([
                orgCustomRoleList(orgId, showArchived),
                permissionsList().catch(() => [] as PermissionRow[]),
            ]);
            setRows(roles);
            setPerms(perms);
        } catch (e: any) {
            showToast(e?.message ?? 'Could not load roles', 'error');
        } finally { setLoading(false); }
    }, [orgId, showArchived, showToast]);

    useEffect(() => { void load(); }, [load]);

    const openNew = () => { setForm({ ...EMPTY, selectedPerms: new Set() }); setEditOpen(true); };
    const openEdit = async (r: CustomRoleRow) => {
        try {
            const keys = await customRolePermissionKeys(r.id);
            setForm({
                id:           r.id,
                name:         r.name,
                description:  r.description ?? '',
                baseRole:     r.base_role,
                selectedPerms: new Set(keys),
            });
            setEditOpen(true);
        } catch (e: any) {
            showToast(e?.message ?? 'Could not load role detail', 'error');
        }
    };

    const submit = async () => {
        if (!orgId || form.name.trim().length < 2) return;
        setSaving(true);
        try {
            let roleId: string;
            if (form.id) {
                await orgCustomRoleUpdate({
                    roleId:      form.id,
                    name:        form.name.trim(),
                    description: form.description.trim() || undefined,
                    baseRole:    form.baseRole,
                });
                roleId = form.id;
            } else {
                roleId = await orgCustomRoleCreate({
                    orgId,
                    name:        form.name.trim(),
                    description: form.description.trim() || undefined,
                    baseRole:    form.baseRole,
                });
            }
            await orgCustomRoleSetPermissions(roleId, Array.from(form.selectedPerms));
            showToast(form.id ? 'Role updated' : 'Role created');
            setEditOpen(false);
            await load();
        } catch (e: any) {
            showToast(e?.message ?? 'Could not save', 'error');
        } finally { setSaving(false); }
    };

    const toggleArchive = (r: CustomRoleRow) => {
        const archive = !r.is_archived;
        confirm({
            title: archive ? `Archive "${r.name}"?` : `Restore "${r.name}"?`,
            message: archive
                ? 'Members currently assigned this role keep it, but it can\'t be assigned to anyone new.'
                : 'The role becomes assignable again.',
            confirmText: archive ? 'Archive' : 'Restore',
            variant: archive ? 'warning' : 'info',
            onConfirm: async () => {
                setBusyId(r.id);
                try {
                    await orgCustomRoleArchive(r.id, archive);
                    showToast(archive ? 'Archived' : 'Restored');
                    await load();
                } catch (e: any) {
                    showToast(e?.message ?? 'Action failed', 'error');
                } finally { setBusyId(null); }
            },
        });
    };

    const togglePerm = (key: string) => {
        setForm((f) => {
            const next = new Set(f.selectedPerms);
            if (next.has(key)) next.delete(key); else next.add(key);
            return { ...f, selectedPerms: next };
        });
    };

    // Group permissions by resource (the first dot segment of the key).
    const groupedPerms: Record<string, PermissionRow[]> = {};
    permissions.forEach((p) => {
        const cat = p.resource ?? 'other';
        (groupedPerms[cat] ??= []).push(p);
    });

    return (
        <OrgPageShell
            title="Custom roles"
            subtitle="Layered on top of the built-in five. Useful for read-only auditors, project leads, and other specialised access."
            icon={<Crown size={20} />}
            require="adminTier"
            actions={
                <div className="btn-group">
                    <button className="btn btn-ghost" onClick={() => load()}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button className="btn btn-primary" onClick={openNew}>
                        <Plus size={14} /> New role
                    </button>
                </div>
            }
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                    Show archived
                </label>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                    {rows.length} role{rows.length === 1 ? '' : 's'}
                </span>
            </div>

            <div style={{
                border: '1px solid var(--border-subtle,#2a2a35)',
                borderRadius: 8, overflow: 'hidden',
            }}>
                {loading ? (
                    <TableSkeleton rows={4} cols={5} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={ShieldCheck}
                        title="No custom roles yet"
                        body={
                            <>
                                Create one to grant specific permissions without re-using the
                                built-in roles. The built-ins (owner/admin/manager/member/guest)
                                continue to work as before.
                            </>
                        }
                        action={<button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Create role</button>}
                    />
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-elevated,#14141c)', textAlign: 'left' }}>
                                <th style={th}>Name</th>
                                <th style={th}>Inherits</th>
                                <th style={th}>Permissions</th>
                                <th style={th}>Members</th>
                                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} style={{
                                    borderTop: '1px solid var(--border-subtle,#2a2a35)',
                                    opacity: r.is_archived ? 0.55 : 1,
                                }}>
                                    <td style={td}>
                                        <div style={{ fontWeight: 500 }}>{r.name}
                                            {r.is_archived && (
                                                <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                                    archived
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>/{r.slug}</div>
                                        {r.description && (
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                                {r.description}
                                            </div>
                                        )}
                                    </td>
                                    <td style={td}>
                                        <span style={{ textTransform: 'capitalize' }}>{r.base_role}</span>
                                    </td>
                                    <td style={td}>{r.permission_count}</td>
                                    <td style={td}>{r.member_count}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        {busyId === r.id ? (
                                            <Loader2 size={14} className="spin" />
                                        ) : (
                                            <div className="btn-group">
                                                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(r)} title="Edit">
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm btn-icon"
                                                    onClick={() => toggleArchive(r)}
                                                    title={r.is_archived ? 'Restore' : 'Archive'}
                                                >
                                                    {r.is_archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal
                open={editOpen}
                onClose={() => !saving && setEditOpen(false)}
                title={form.id ? 'Edit custom role' : 'New custom role'}
                width={620}
                footer={
                    <>
                        <button className="btn btn-ghost" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</button>
                        <button className="btn btn-primary" onClick={submit} disabled={saving || form.name.trim().length < 2}>
                            {saving ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                            <span style={{ marginLeft: 6 }}>{form.id ? 'Save changes' : 'Create role'}</span>
                        </button>
                    </>
                }
            >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <FormField label="Name" required>
                        <input
                            type="text" autoFocus value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. Read-only Auditor"
                            className="input-field" style={{ width: '100%' }}
                        />
                    </FormField>
                    <FormField label="Inherits from" hint="The fallback permission baseline.">
                        <select
                            value={form.baseRole}
                            onChange={(e) => setForm((f) => ({ ...f, baseRole: e.target.value as BaseRole }))}
                            className="input-field" style={{ width: '100%' }}
                        >
                            {BASE_ROLES.map((b) => (
                                <option key={b} value={b} style={{ textTransform: 'capitalize' }}>{b}</option>
                            ))}
                        </select>
                    </FormField>
                </div>

                <FormField label="Description" hint="Optional. What this role is for.">
                    <textarea
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        rows={2} className="input-field" style={{ width: '100%' }}
                    />
                </FormField>

                <div style={{ marginTop: 14 }}>
                    <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                        Permissions ({form.selectedPerms.size} selected)
                    </label>
                    {permissions.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>
                            No permissions catalogue found. Seed `public.permissions` first.
                        </div>
                    ) : (
                        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 4 }}>
                            {Object.entries(groupedPerms).map(([cat, perms]) => (
                                <div key={cat} style={{ padding: '8px 8px 4px' }}>
                                    <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                                        {cat}
                                    </div>
                                    {perms.map((p) => (
                                        <label key={p.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0', fontSize: 12 }}>
                                            <input
                                                type="checkbox"
                                                checked={form.selectedPerms.has(p.key)}
                                                onChange={() => togglePerm(p.key)}
                                                style={{ marginTop: 2 }}
                                            />
                                            <div>
                                                <div style={{ fontFamily: 'monospace' }}>{p.key}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}

const th: React.CSSProperties = {
    padding: '10px 14px', fontSize: 11, letterSpacing: 1,
    textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)', fontWeight: 600,
};
const td: React.CSSProperties = { padding: '12px 14px', verticalAlign: 'top' };
