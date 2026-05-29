/**
 * Org → Project Detail
 *
 * Kanban-by-section view of a project's tasks. Status categories are the columns:
 *   Backlog → Unstarted → Started → Completed (Cancelled hidden by default).
 *
 * - Click a task to inline-edit (status change via dropdown).
 * - "New task" creates in the Backlog column.
 *
 * This is the MVP. Full drag-and-drop, dependencies, comments are
 * separate iterations.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FolderKanban, Loader2, Plus, X } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    projectGet, taskListForProject, taskOrgCreate, taskSetStatus,
    type ProjectDetail, type TaskRow, type TaskStatusCategory,
} from '../../lib/tasks';
import { OrgPageShell, Avatar, Modal, FormField } from '../../components/org';
import { useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';

const CATEGORIES: { key: TaskStatusCategory; label: string }[] = [
    { key: 'backlog',   label: 'Backlog' },
    { key: 'unstarted', label: 'Todo' },
    { key: 'started',   label: 'In Progress' },
    { key: 'completed', label: 'Done' },
];

export default function OrgProjectDetailPage() {
    const { id: projectId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { scope } = useScope();
    const orgId = scope.orgId;
    const { toast, show: showToast } = useOrgToast();

    const [detail, setDetail] = useState<ProjectDetail | null>(null);
    const [tasks, setTasks] = useState<TaskRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [newOpen, setNewOpen] = useState(false);
    const [nTitle, setNTitle] = useState('');
    const [nDesc, setNDesc] = useState('');
    const [nCategory, setNCategory] = useState<TaskStatusCategory>('unstarted');
    const [creating, setCreating] = useState(false);
    const [movingId, setMovingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!projectId) return;
        setLoading(true); setError(null);
        try {
            const [d, t] = await Promise.all([projectGet(projectId), taskListForProject(projectId)]);
            setDetail(d); setTasks(t);
        } catch (e: any) { setError(e?.message ?? 'Failed to load project'); }
        finally { setLoading(false); }
    }, [projectId]);

    useEffect(() => { void load(); }, [load]);

    const byCategory = useMemo(() => {
        const map: Record<TaskStatusCategory, TaskRow[]> = {
            backlog: [], unstarted: [], started: [], completed: [], cancelled: [],
        };
        for (const t of tasks) map[(t.status_category ?? 'unstarted') as TaskStatusCategory].push(t);
        return map;
    }, [tasks]);

    const handleCreate = async () => {
        if (!orgId || !projectId || nTitle.trim().length < 2) return;
        setCreating(true);
        try {
            await taskOrgCreate({
                orgId,
                projectId,
                title: nTitle.trim(),
                description: nDesc.trim() || undefined,
                visibility: 'team',
            });
            // The new task is created with status_category 'unstarted'.
            // If the user wanted a different column, set it immediately.
            if (nCategory !== 'unstarted') {
                const newTasks = await taskListForProject(projectId);
                const justCreated = newTasks
                    .filter((t) => t.title === nTitle.trim())
                    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))[0];
                if (justCreated) {
                    const mapStatus: Record<TaskStatusCategory, string> = {
                        backlog: 'backlog', unstarted: 'pending', started: 'in_progress',
                        completed: 'done', cancelled: 'cancelled',
                    };
                    await taskSetStatus(justCreated.id, mapStatus[nCategory], nCategory);
                }
            }
            setNewOpen(false); setNTitle(''); setNDesc(''); setNCategory('unstarted');
            await load();
        } catch (e: any) {
            showToast(e?.message ?? 'Could not create task', 'error');
        } finally { setCreating(false); }
    };

    const moveTask = async (task: TaskRow, toCategory: TaskStatusCategory) => {
        if (task.status_category === toCategory) return;
        const mapStatus: Record<TaskStatusCategory, string> = {
            backlog: 'backlog', unstarted: 'pending', started: 'in_progress',
            completed: 'done', cancelled: 'cancelled',
        };
        setMovingId(task.id);
        try {
            await taskSetStatus(task.id, mapStatus[toCategory], toCategory);
            await load();
        } catch (e: any) {
            showToast(e?.message ?? 'Could not move task', 'error');
        } finally { setMovingId(null); }
    };

    return (
        <OrgPageShell
            title={detail?.project?.name ?? 'Project'}
            subtitle={detail?.project?.description ?? undefined}
            icon={<FolderKanban size={20} />}
            crumbs={[{ label: 'Projects', to: '/org/projects' }, { label: detail?.project?.name ?? '…' }]}
            actions={
                <>
                    <button className="btn btn-ghost" onClick={() => navigate('/org/projects')}>
                        <ArrowLeft size={14} /> <span style={{ marginLeft: 4 }}>Back</span>
                    </button>
                    <button className="btn btn-primary" onClick={() => setNewOpen(true)} style={{ marginLeft: 8 }}>
                        <Plus size={14} /> <span style={{ marginLeft: 6 }}>New task</span>
                    </button>
                </>
            }
        >
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {loading ? (
                <div style={{ padding: 24, color: 'var(--text-muted,#8a8a96)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Loader2 size={14} className="spin" /> Loading…
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${CATEGORIES.length}, minmax(240px, 1fr))`,
                    gap: 12,
                    overflowX: 'auto',
                }}>
                    {CATEGORIES.map((col) => (
                        <div key={col.key} style={{
                            background: 'var(--bg-elevated,#14141c)',
                            border: '1px solid var(--border-subtle,#2a2a35)',
                            borderRadius: 8,
                            display: 'flex', flexDirection: 'column',
                            minHeight: 200,
                        }}>
                            <div style={{
                                padding: '10px 14px',
                                borderBottom: '1px solid var(--border-subtle,#2a2a35)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                                <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted,#8a8a96)' }}>
                                    {col.label}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)' }}>
                                    {byCategory[col.key].length}
                                </span>
                            </div>
                            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {byCategory[col.key].map((task) => (
                                    <div key={task.id}
                                        onClick={() => navigate(`/org/projects/${projectId}/task/${task.id}`)}
                                        style={{
                                            background: 'var(--bg-primary,#0a0a0f)',
                                            border: '1px solid var(--border-subtle,#2a2a35)',
                                            borderRadius: 6, padding: 10,
                                            opacity: movingId === task.id ? 0.5 : 1,
                                            cursor: 'pointer',
                                        }}>
                                        <div style={{ fontSize: 13, fontWeight: 500 }}>{task.title}</div>
                                        {task.description && (
                                            <div style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)', marginTop: 4 }}>
                                                {task.description.slice(0, 80)}
                                                {task.description.length > 80 && '…'}
                                            </div>
                                        )}
                                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            {task.assignee_user_id ? (
                                                <Avatar name={task.assignee_name} url={task.assignee_avatar} size={20} />
                                            ) : (
                                                <span style={{ fontSize: 10, color: 'var(--text-muted,#8a8a96)' }}>unassigned</span>
                                            )}
                                            <select
                                                value={task.status_category ?? 'unstarted'}
                                                onChange={(e) => moveTask(task, e.target.value as TaskStatusCategory)}
                                                disabled={movingId === task.id}
                                                style={{
                                                    marginLeft: 'auto', fontSize: 11,
                                                    background: 'transparent',
                                                    border: '1px solid var(--border-subtle,#2a2a35)',
                                                    color: 'var(--text-primary,#e0e0e8)',
                                                    borderRadius: 4, padding: '2px 4px',
                                                }}
                                            >
                                                {CATEGORIES.map((c) => (
                                                    <option key={c.key} value={c.key}>{c.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {task.due_date && (
                                            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted,#8a8a96)' }}>
                                                Due {new Date(task.due_date).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {byCategory[col.key].length === 0 && (
                                    <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--text-muted,#8a8a96)' }}>
                                        No tasks
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal
                open={newOpen}
                onClose={() => !creating && setNewOpen(false)}
                title="New task"
                footer={
                    <>
                        <button className="btn btn-ghost" onClick={() => setNewOpen(false)} disabled={creating}><X size={14} /></button>
                        <button className="btn btn-primary" onClick={handleCreate} disabled={creating || nTitle.trim().length < 2}>
                            {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                            <span style={{ marginLeft: 6 }}>Create</span>
                        </button>
                    </>
                }
            >
                <FormField label="Title">
                    <input type="text" value={nTitle} onChange={(e) => setNTitle(e.target.value)}
                        placeholder="What needs to be done?" className="input-field" style={{ width: '100%' }} autoFocus />
                </FormField>
                <FormField label="Description (optional)">
                    <textarea value={nDesc} onChange={(e) => setNDesc(e.target.value)}
                        rows={3} className="input-field" style={{ width: '100%' }} />
                </FormField>
                <FormField label="Column">
                    <select value={nCategory} onChange={(e) => setNCategory(e.target.value as TaskStatusCategory)}
                        className="input-field" style={{ width: '100%' }}>
                        {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                </FormField>
            </Modal>
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}
