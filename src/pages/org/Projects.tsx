/**
 * Org → Projects
 *
 * List + create projects. Click into one for tasks board.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, Loader2, Archive } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import { projectList, projectCreate, projectArchive, type ProjectRow } from '../../lib/tasks';
import { canManageTeams } from '../../lib/org';
import { OrgPageShell, Modal, FormField } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';
import SearchFilter from '../../components/ui/SearchFilter';
import { CardSkeleton } from '../../components/ui/Skeletons';
import EmptyState from '../../components/ui/EmptyState';

function slugify(s: string): string {
    return s.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function OrgProjectsPage() {
    const navigate = useNavigate();
    const { scope } = useScope();
    const orgId = scope.orgId;
    const canManage = canManageTeams(scope.role);
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows] = useState<ProjectRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [search, setSearch]       = useState('');
    const [showArchived, setShowArchived] = useState<'no' | 'yes'>('no');

    const [createOpen, setCreateOpen] = useState(false);
    const [cName, setCName] = useState('');
    const [cSlug, setCSlug] = useState('');
    const [cSlugTouched, setCSlugTouched] = useState(false);
    const [cDesc, setCDesc] = useState('');
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true); setError(null);
        try { setRows(await projectList(orgId)); }
        catch (e: any) { setError(e?.message ?? 'Failed to load projects'); }
        finally { setLoading(false); }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((p) => {
            if (showArchived === 'no' && p.archived_at) return false;
            if (!q) return true;
            return [p.name, p.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
        });
    }, [rows, search, showArchived]);

    const effectiveSlug = cSlugTouched ? cSlug : slugify(cName);

    const handleCreate = async () => {
        if (!orgId || cName.trim().length < 2 || effectiveSlug.length < 2) return;
        setCreating(true); setCreateErr(null);
        try {
            const id = await projectCreate({
                orgId,
                name: cName.trim(),
                slug: effectiveSlug,
                description: cDesc.trim() || undefined,
            });
            setCreateOpen(false);
            setCName(''); setCSlug(''); setCSlugTouched(false); setCDesc('');
            navigate(`/org/projects/${id}`);
        } catch (e: any) {
            setCreateErr(e?.message ?? 'Could not create project');
        } finally { setCreating(false); }
    };

    const toggleArchive = (p: ProjectRow) => {
        const action = p.archived_at ? 'Unarchive' : 'Archive';
        confirm({
            title: `${action} "${p.name}"?`,
            message: p.archived_at
                ? 'This project will become active again.'
                : 'Archived projects are hidden from the active list.',
            confirmText: action,
            variant: 'warning',
            onConfirm: async () => {
                setBusyId(p.id);
                try { await projectArchive(p.id, !p.archived_at); await load(); showToast(`Project ${action.toLowerCase()}d`); }
                catch (e: any) { showToast(e?.message ?? 'Could not update', 'error'); }
                finally { setBusyId(null); }
            },
        });
    };

    return (
        <OrgPageShell
            title="Projects"
            subtitle="Group work into projects with sections, sprints, and milestones."
            icon={<FolderKanban size={20} />}
            require="managerTier"
            actions={canManage ? (
                <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                    <Plus size={14} /> <span style={{ marginLeft: 6 }}>New project</span>
                </button>
            ) : null}
        >
            <SearchFilter
                query={search}
                onQueryChange={setSearch}
                placeholder="Search project name or description…"
                chips={[
                    {
                        key: 'archived',
                        label: 'Archived',
                        value: showArchived === 'yes' ? 'yes' : null,
                        onChange: (v) => setShowArchived(v === 'yes' ? 'yes' : 'no'),
                        options: [{ value: 'yes', label: 'Show archived' }],
                    },
                ]}
                rightExtra={
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {filtered.length} of {rows.length}
                    </span>
                }
            />

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            {loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                    {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} lines={3} />)}
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={FolderKanban}
                    title={rows.length === 0 ? 'No projects yet' : 'No projects match'}
                    body={rows.length === 0
                        ? (canManage ? 'Click "New project" to create one.' : 'Once managers create projects, they\'ll appear here.')
                        : 'Try adjusting the search or filters.'}
                    action={rows.length === 0 && canManage ? (
                        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                            <Plus size={14} /> Create project
                        </button>
                    ) : null}
                />
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                    {filtered.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => navigate(`/org/projects/${p.id}`)}
                            style={{
                                textAlign: 'left',
                                background: 'var(--bg-elevated,#14141c)',
                                border: '1px solid var(--border-subtle,#2a2a35)',
                                borderRadius: 8, padding: 16, cursor: 'pointer',
                                opacity: p.archived_at ? 0.6 : 1,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)', marginTop: 2 }}>
                                        {p.open_task_count} open / {p.task_count} total
                                        {p.archived_at && ' · archived'}
                                    </div>
                                </div>
                                {canManage && (
                                    <span
                                        role="button"
                                        aria-label={p.archived_at ? 'Unarchive' : 'Archive'}
                                        onClick={(e) => { e.stopPropagation(); toggleArchive(p); }}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: 28, height: 28, borderRadius: 6,
                                            color: 'var(--text-muted,#8a8a96)', cursor: 'pointer',
                                        }}
                                    >
                                        {busyId === p.id ? <Loader2 size={14} className="spin" /> : <Archive size={14} />}
                                    </span>
                                )}
                            </div>
                            {p.description && (
                                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary,#b0b0bc)' }}>
                                    {p.description}
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}

            <Modal
                open={createOpen}
                onClose={() => !creating && setCreateOpen(false)}
                title="Create project"
                footer={
                    <>
                        <button className="btn btn-ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleCreate}
                            disabled={creating || cName.trim().length < 2 || effectiveSlug.length < 2}>
                            {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                            <span style={{ marginLeft: 6 }}>Create</span>
                        </button>
                    </>
                }
            >
                <FormField label="Name">
                    <input type="text" value={cName} onChange={(e) => setCName(e.target.value)}
                        placeholder="e.g. Q3 Marketing Campaign" className="input-field" style={{ width: '100%' }} autoFocus />
                </FormField>
                <FormField label="Slug" hint="Used in URLs. Auto-derived from name.">
                    <input type="text" value={effectiveSlug}
                        onChange={(e) => { setCSlugTouched(true); setCSlug(slugify(e.target.value)); }}
                        className="input-field" style={{ width: '100%' }} />
                </FormField>
                <FormField label="Description (optional)">
                    <textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)}
                        rows={3} className="input-field" style={{ width: '100%' }} />
                </FormField>
                {createErr && <div className="alert alert-error">{createErr}</div>}
            </Modal>
            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}
