/**
 * Org → Departments
 *
 * CRUD for departments. Backed by the `departments` table (migration 079)
 * and department_* RPCs (080).
 *
 * Each department has:
 *   - name + auto-slug
 *   - optional description, parent department, head user
 *   - member_count (computed in the list RPC)
 *   - archived state (soft delete; preserves history)
 */

import { useCallback, useEffect, useState } from 'react';
import {
    Briefcase, RefreshCw, Plus, Archive, ArchiveRestore, Pencil, Loader2, FolderTree,
} from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    departmentList, departmentCreate, departmentUpdate, departmentArchive,
    type DepartmentRow,
} from '../../lib/org';
import { OrgPageShell, Modal, FormField } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';
import { TableSkeleton } from '../../components/ui/Skeletons';
import EmptyState from '../../components/ui/EmptyState';

interface FormState {
    id?:          string;
    name:         string;
    description:  string;
    parentId:     string;
    headUserId:   string;
}

const EMPTY: FormState = { name: '', description: '', parentId: '', headUserId: '' };

export default function OrgDepartmentsPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows]                 = useState<DepartmentRow[]>([]);
    const [loading, setLoading]           = useState(true);
    const [busyId, setBusyId]             = useState<string | null>(null);
    const [includeArchived, setIncludeArchived] = useState(false);

    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm]           = useState<FormState>(EMPTY);
    const [saving, setSaving]       = useState(false);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            setRows(await departmentList(orgId, includeArchived));
        } catch (e: any) {
            showToast(e?.message ?? 'Could not load departments', 'error');
        } finally { setLoading(false); }
    }, [orgId, includeArchived, showToast]);

    useEffect(() => { void load(); }, [load]);

    const openNew = () => { setForm(EMPTY); setModalOpen(true); };
    const openEdit = (d: DepartmentRow) => {
        setForm({
            id:          d.id,
            name:        d.name,
            description: d.description ?? '',
            parentId:    d.parent_department_id ?? '',
            headUserId:  d.head_user_id ?? '',
        });
        setModalOpen(true);
    };

    const submit = async () => {
        if (!orgId || form.name.trim().length < 2) return;
        setSaving(true);
        try {
            if (form.id) {
                await departmentUpdate({
                    departmentId: form.id,
                    name:         form.name.trim(),
                    description:  form.description.trim() || undefined,
                    parentId:     form.parentId || undefined,
                    headUserId:   form.headUserId || undefined,
                });
                showToast('Department updated');
            } else {
                await departmentCreate({
                    orgId,
                    name:        form.name.trim(),
                    description: form.description.trim() || undefined,
                    parentId:    form.parentId || undefined,
                    headUserId:  form.headUserId || undefined,
                });
                showToast('Department created');
            }
            setModalOpen(false);
            await load();
        } catch (e: any) {
            showToast(e?.message ?? 'Could not save', 'error');
        } finally { setSaving(false); }
    };

    const toggleArchive = (d: DepartmentRow) => {
        const archive = d.archived_at === null;
        confirm({
            title: archive ? `Archive ${d.name}?` : `Restore ${d.name}?`,
            message: archive
                ? 'Members of this department keep their assignment; the department just stops appearing in active filters.'
                : 'The department becomes active again.',
            confirmText: archive ? 'Archive' : 'Restore',
            variant: archive ? 'warning' : 'info',
            onConfirm: async () => {
                setBusyId(d.id);
                try {
                    await departmentArchive(d.id, archive);
                    showToast(archive ? 'Archived' : 'Restored');
                    await load();
                } catch (e: any) {
                    showToast(e?.message ?? 'Action failed', 'error');
                } finally { setBusyId(null); }
            },
        });
    };

    const activeDepts = rows.filter((r) => r.archived_at === null);
    const parentOptions = activeDepts.filter((r) => r.id !== form.id);

    return (
        <OrgPageShell
            title="Departments"
            subtitle="Organize your workspace by Sales, Engineering, Operations, and so on."
            icon={<Briefcase size={20} />}
            require="adminTier"
            actions={
                <div className="btn-group">
                    <button className="btn btn-ghost" onClick={() => load()}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button className="btn btn-primary" onClick={openNew}>
                        <Plus size={14} /> New department
                    </button>
                </div>
            }
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                        type="checkbox"
                        checked={includeArchived}
                        onChange={(e) => setIncludeArchived(e.target.checked)}
                    />
                    Show archived
                </label>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                    {rows.length} {includeArchived ? 'total' : 'active'}
                </span>
            </div>

            <div style={{
                border: '1px solid var(--border-subtle,#2a2a35)',
                borderRadius: 8, overflow: 'hidden',
            }}>
                {loading ? (
                    <TableSkeleton rows={5} cols={5} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={FolderTree}
                        title="No departments yet"
                        body="Create your first department to start organising members."
                        action={
                            <button className="btn btn-primary" onClick={openNew}>
                                <Plus size={14} /> Create department
                            </button>
                        }
                    />
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-elevated,#14141c)', textAlign: 'left' }}>
                                <th style={th}>Name</th>
                                <th style={th}>Head</th>
                                <th style={th}>Members</th>
                                <th style={th}>Created</th>
                                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((d) => {
                                const parent = rows.find((x) => x.id === d.parent_department_id);
                                return (
                                    <tr key={d.id} style={{
                                        borderTop: '1px solid var(--border-subtle,#2a2a35)',
                                        opacity: d.archived_at ? 0.6 : 1,
                                    }}>
                                        <td style={td}>
                                            <div style={{ fontWeight: 500 }}>
                                                {d.name}
                                                {d.archived_at && (
                                                    <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                                        archived
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                /{d.slug}
                                                {parent && <> · under {parent.name}</>}
                                            </div>
                                            {d.description && (
                                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                                    {d.description}
                                                </div>
                                            )}
                                        </td>
                                        <td style={td}>
                                            {d.head_display_name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                        </td>
                                        <td style={td}>{d.member_count}</td>
                                        <td style={{ ...td, color: 'var(--text-muted)' }}>
                                            {new Date(d.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ ...td, textAlign: 'right' }}>
                                            {busyId === d.id ? (
                                                <Loader2 size={14} className="spin" />
                                            ) : (
                                                <div className="btn-group">
                                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(d)} title="Edit">
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-sm btn-icon"
                                                        onClick={() => toggleArchive(d)}
                                                        title={d.archived_at ? 'Restore' : 'Archive'}
                                                    >
                                                        {d.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal
                open={modalOpen}
                onClose={() => !saving && setModalOpen(false)}
                title={form.id ? 'Edit department' : 'New department'}
                width={520}
                footer={
                    <>
                        <button className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" onClick={submit}
                            disabled={saving || form.name.trim().length < 2}>
                            {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                            <span style={{ marginLeft: 6 }}>{form.id ? 'Save changes' : 'Create'}</span>
                        </button>
                    </>
                }
            >
                <FormField label="Name" required>
                    <input
                        autoFocus
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Engineering"
                        className="input-field"
                        style={{ width: '100%' }}
                    />
                </FormField>

                <FormField label="Description" hint="Optional. What this department does.">
                    <textarea
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        rows={3}
                        className="input-field"
                        style={{ width: '100%' }}
                    />
                </FormField>

                <FormField label="Parent department" hint="For nested orgs (e.g. Frontend under Engineering).">
                    <select
                        value={form.parentId}
                        onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                        className="input-field"
                        style={{ width: '100%' }}
                    >
                        <option value="">— None (top level) —</option>
                        {parentOptions.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </FormField>

                <FormField label="Head" hint="Optional. The person responsible for this department.">
                    <input
                        type="text"
                        value={form.headUserId}
                        onChange={(e) => setForm((f) => ({ ...f, headUserId: e.target.value }))}
                        placeholder="user_id (advanced) — leave blank for now"
                        className="input-field"
                        style={{ width: '100%' }}
                    />
                </FormField>
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
