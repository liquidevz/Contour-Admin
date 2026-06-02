/**
 * Org → Project Detail — Agile Board
 *
 * Jira-parity board (migrations 090/091):
 *   • Custom workflow columns (project_statuses) with WIP limits
 *   • Active Sprint board + Backlog (project_sections lifecycle)
 *   • Issue keys (PROJ-123), story points, priority, type
 *   • Native HTML5 drag-and-drop between columns (no extra deps)
 *   • Sprint start / complete (carry-over) + burndown chart (recharts)
 *   • Quick filters (text + hide done)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, FolderKanban, Loader2, Plus, X, Flag, Bug, Sparkles,
    Wrench, Flame, TrendingDown, Zap, Clock, CheckCheck, Inbox,
    Settings2, Trash2, ChevronUp, ChevronDown, BarChart3, User,
} from 'lucide-react';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { useScope } from '../../context/ScopeContext';
import {
    boardGet, taskMove, taskOrgCreate, taskUpdateFields, sprintCreate, sprintStart, sprintComplete, burndownGet,
    statusCreate, statusUpdate, statusReorder, statusDelete, projectVelocity,
    templateList, applyTemplate, projectSetConfig, orgModules,
    type BoardPayload, type BoardStatus, type BoardTask, type BoardSprint, type BurndownPoint,
    type TaskStatusCategory, type TaskPriority, type VelocityRow, type ProjectTemplate, type OrgModule,
} from '../../lib/tasks';
import { supabase } from '../../lib/supabase';
import { OrgPageShell, Avatar, Modal, FormField } from '../../components/org';
import { useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';

const TYPE_ICON: Record<string, { Icon: any; color: string }> = {
    task: { Icon: CheckCheck, color: '#3B82F6' },
    bug: { Icon: Bug, color: '#EF4444' },
    feature: { Icon: Sparkles, color: '#22C55E' },
    chore: { Icon: Wrench, color: '#A855F7' },
    incident: { Icon: Flame, color: '#F59E0B' },
};
const PRIORITY_COLOR: Record<string, string> = {
    urgent: '#EF4444', high: '#F59E0B', medium: '#3B82F6', low: '#6B7280',
};

type ViewMode = { type: 'backlog' } | { type: 'sprint'; sprintId: string };

export default function OrgProjectDetailPage() {
    const { id: projectId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { scope } = useScope();
    const orgId = scope.orgId;
    const { toast, show: showToast } = useOrgToast();

    const [payload, setPayload] = useState<BoardPayload | null>(null);
    const [view, setView] = useState<ViewMode>({ type: 'backlog' });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    const [hideDone, setHideDone] = useState(false);
    const [myOnly, setMyOnly] = useState(false);
    const [sortRecent, setSortRecent] = useState(false);
    const [uid, setUid] = useState<string | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropCol, setDropCol] = useState<string | null>(null);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [velocity, setVelocity] = useState<VelocityRow[] | null>(null);
    const [modules, setModules] = useState<Record<OrgModule, boolean> | null>(null);
    const [labelFilter, setLabelFilter] = useState<string | null>(null);

    const [newOpen, setNewOpen] = useState(false);
    const [nTitle, setNTitle] = useState('');
    const [nDesc, setNDesc] = useState('');
    const [nPriority, setNPriority] = useState<TaskPriority>('medium');
    const [nDue, setNDue] = useState('');
    const [nReminder, setNReminder] = useState('');
    const [creating, setCreating] = useState(false);

    const [sprintOpen, setSprintOpen] = useState(false);
    const [sName, setSName] = useState('');
    const [sGoal, setSGoal] = useState('');
    const [sStart, setSStart] = useState('');
    const [sEnd, setSEnd] = useState('');
    const [savingSprint, setSavingSprint] = useState(false);

    const [burndown, setBurndown] = useState<BurndownPoint[] | null>(null);
    const [viewInit, setViewInit] = useState(false);

    const load = useCallback(async () => {
        if (!projectId) return;
        try {
            const p = await boardGet(projectId);
            setPayload(p);
            if (!viewInit) {
                const active = p.sprints.find((s) => s.status === 'active');
                setView(active ? { type: 'sprint', sprintId: active.id } : { type: 'backlog' });
                setViewInit(true);
            }
        } catch (e: any) { setError(e?.message ?? 'Failed to load project'); }
        finally { setLoading(false); }
    }, [projectId, viewInit]);

    useEffect(() => { void load(); }, [load]);

    // Current user id (for "Only my issues").
    useEffect(() => { void supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null)); }, []);

    // Org module flags (gate the Agile board).
    useEffect(() => { if (orgId) orgModules(orgId).then(setModules).catch(() => {}); }, [orgId]);

    // Realtime — refetch when a teammate changes a task on this board.
    useEffect(() => {
        if (!projectId) return;
        const ch = supabase
            .channel(`board:${projectId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` }, () => { void load(); })
            .subscribe();
        return () => { void supabase.removeChannel(ch); };
    }, [projectId, load]);

    const columns = useMemo(
        () => (payload?.statuses ?? []).slice().sort((a, b) => a.position - b.position),
        [payload],
    );
    const defaultStatus = useMemo(() => columns.find((c) => c.is_default) ?? columns[0], [columns]);

    const resolveColumnId = useCallback((t: BoardTask): string | undefined => {
        if (t.status_id) return t.status_id;
        const byCat = columns.find((c) => c.category === (t.status_category ?? 'unstarted'));
        return (byCat ?? defaultStatus)?.id;
    }, [columns, defaultStatus]);

    const viewTasks = useMemo(() => {
        let list = payload?.tasks ?? [];
        list = view.type === 'sprint'
            ? list.filter((t) => t.section_id === view.sprintId)
            : list.filter((t) => !t.section_id);
        if (filter.trim()) {
            const q = filter.trim().toLowerCase();
            list = list.filter((t) => t.title.toLowerCase().includes(q) || (t.issue_key ?? '').toLowerCase().includes(q));
        }
        if (myOnly && uid) list = list.filter((t) => t.assignee_user_id === uid);
        if (labelFilter) list = list.filter((t) => (t.labels ?? []).some((l) => l.id === labelFilter));
        if (hideDone) list = list.filter((t) => t.status_category !== 'completed' && t.status_category !== 'cancelled');
        if (sortRecent) list = [...list].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
        return list;
    }, [payload, view, filter, hideDone, myOnly, uid, sortRecent, labelFilter]);

    const byColumn = useMemo(() => {
        const map = new Map<string, BoardTask[]>();
        for (const c of columns) map.set(c.id, []);
        for (const t of viewTasks) {
            const cid = resolveColumnId(t);
            if (cid && map.has(cid)) map.get(cid)!.push(t);
        }
        for (const arr of map.values()) arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        return map;
    }, [columns, viewTasks, resolveColumnId]);

    const currentSprint = view.type === 'sprint' ? payload?.sprints.find((s) => s.id === view.sprintId) ?? null : null;

    /* ── mutations (optimistic) ── */

    const patchTask = (id: string, patch: Partial<BoardTask>) =>
        setPayload((prev) => prev ? { ...prev, tasks: prev.tasks.map((t) => t.id === id ? { ...t, ...patch } : t) } : prev);

    const moveToColumn = async (task: BoardTask, target: BoardStatus) => {
        if (resolveColumnId(task) === target.id) return;
        // Definition-of-done: required fields must be present before completing.
        if (target.category === 'completed') {
            const req: string[] = (payload?.project as any)?.settings?.required_fields ?? [];
            const missing = req.filter((f) =>
                (f === 'due_date' && !task.due_date) ||
                (f === 'estimate_points' && task.estimate_points == null) ||
                (f === 'priority' && !task.priority) ||
                (f === 'assignee' && !task.assignee_user_id));
            if (missing.length > 0) {
                showToast(`Set ${missing.map((m) => m.replace('_', ' ')).join(', ')} before completing this issue.`, 'error');
                return;
            }
        }
        // Soft WIP-limit guard.
        const count = (payload?.tasks ?? []).filter((t) =>
            (view.type === 'sprint' ? t.section_id === view.sprintId : !t.section_id) && t.status_id === target.id).length;
        if (target.wip_limit != null && count >= target.wip_limit &&
            !window.confirm(`"${target.name}" is at its WIP limit of ${target.wip_limit}. Move anyway?`)) {
            return;
        }
        const snap = { status_id: task.status_id, status_category: task.status_category, completed_at: task.completed_at };
        patchTask(task.id, {
            status_id: target.id, status_category: target.category,
            completed_at: target.category === 'completed' ? new Date().toISOString() : null,
        });
        try { await taskMove({ taskId: task.id, statusId: target.id }); }
        catch (e: any) { patchTask(task.id, snap); showToast(e?.message ?? 'Move failed', 'error'); void load(); }
    };

    const handleDrop = (col: BoardStatus) => {
        setDropCol(null);
        const id = dragId; setDragId(null);
        if (!id) return;
        const task = payload?.tasks.find((t) => t.id === id);
        if (task) void moveToColumn(task, col);
    };

    // Reorder within a column (or move + position) by dropping onto a specific card.
    const handleCardDrop = async (targetTask: BoardTask, col: BoardStatus) => {
        setDropCol(null);
        const id = dragId; setDragId(null);
        if (!id || id === targetTask.id) return;
        const task = payload?.tasks.find((t) => t.id === id);
        if (!task) return;
        const colTasks = byColumn.get(col.id) ?? [];
        const targetIdx = colTasks.findIndex((t) => t.id === targetTask.id);
        const prev = colTasks[targetIdx - 1];
        const targetPos = targetTask.position ?? targetIdx;
        const prevPos = prev ? (prev.position ?? (targetIdx - 1)) : (targetPos - 1);
        const newPos = (Number(prevPos) + Number(targetPos)) / 2;
        // Done-gate when crossing into a completed column.
        if (col.category === 'completed' && resolveColumnId(task) !== col.id) {
            const req: string[] = (payload?.project as any)?.settings?.required_fields ?? [];
            const missing = req.filter((f) =>
                (f === 'due_date' && !task.due_date) || (f === 'estimate_points' && task.estimate_points == null) ||
                (f === 'priority' && !task.priority) || (f === 'assignee' && !task.assignee_user_id));
            if (missing.length > 0) { showToast(`Set ${missing.map((m) => m.replace('_', ' ')).join(', ')} before completing.`, 'error'); return; }
        }
        patchTask(task.id, { status_id: col.id, status_category: col.category, position: newPos });
        try { await taskMove({ taskId: task.id, statusId: col.id, position: newPos }); }
        catch (e: any) { showToast(e?.message ?? 'Move failed', 'error'); void load(); }
    };

    /* ── create ── */

    const handleCreate = async () => {
        if (!orgId || !projectId || nTitle.trim().length < 2) return;
        setCreating(true);
        try {
            const sectionId = view.type === 'sprint' ? view.sprintId : undefined;
            const id = await taskOrgCreate({ orgId, projectId, title: nTitle.trim(), description: nDesc.trim() || undefined, priority: nPriority, dueDate: nDue ? new Date(nDue).toISOString() : undefined, visibility: 'team' });
            if (defaultStatus) await taskMove({ taskId: id, statusId: defaultStatus.id, sectionId: sectionId ?? null, setSection: true });
            if (nReminder) await taskUpdateFields(id, { reminder_at: new Date(nReminder).toISOString(), reminder_enabled: true });
            setNewOpen(false); setNTitle(''); setNDesc(''); setNPriority('medium'); setNDue(''); setNReminder('');
            await load();
        } catch (e: any) { showToast(e?.message ?? 'Could not create task', 'error'); }
        finally { setCreating(false); }
    };

    const handleCreateSprint = async () => {
        if (!projectId || sName.trim().length < 2) return;
        setSavingSprint(true);
        try {
            const id = await sprintCreate({ projectId, name: sName.trim(), goal: sGoal.trim() || undefined, start: sStart || undefined, end: sEnd || undefined });
            setSprintOpen(false); setSName(''); setSGoal(''); setSStart(''); setSEnd('');
            await load();
            setView({ type: 'sprint', sprintId: id });
        } catch (e: any) { showToast(e?.message ?? 'Could not create sprint', 'error'); }
        finally { setSavingSprint(false); }
    };

    const handleStart = async (s: BoardSprint) => {
        try { await sprintStart(s.id); await load(); }
        catch (e: any) { showToast(e?.message ?? 'Could not start sprint', 'error'); }
    };

    const handleComplete = async (s: BoardSprint) => {
        const incomplete = s.task_count - s.done_count;
        const nextPlanned = (payload?.sprints ?? []).find((x) => x.status === 'planned' && x.id !== s.id) ?? null;
        const dest = nextPlanned ? nextPlanned.name : 'the Backlog';
        if (!window.confirm(`Complete "${s.name}"? ${incomplete > 0 ? `${incomplete} unfinished task(s) will move to ${dest}.` : 'All work is done.'}`)) return;
        try {
            const moved = await sprintComplete(s.id, nextPlanned?.id ?? null);
            setView(nextPlanned ? { type: 'sprint', sprintId: nextPlanned.id } : { type: 'backlog' });
            await load();
            showToast(moved > 0 ? `Sprint completed · ${moved} task(s) moved to ${dest}` : 'Sprint completed', 'success');
        } catch (e: any) { showToast(e?.message ?? 'Could not complete sprint', 'error'); }
    };

    const toggleBurndown = async () => {
        if (burndown) { setBurndown(null); return; }
        if (!currentSprint) return;
        try { setBurndown(await burndownGet(currentSprint.id)); }
        catch (e: any) { showToast(e?.message ?? 'No burndown data', 'error'); }
    };

    const toggleVelocity = async () => {
        if (velocity) { setVelocity(null); return; }
        if (!projectId) return;
        try { setVelocity(await projectVelocity(projectId, 6)); }
        catch (e: any) { showToast(e?.message ?? 'No velocity data', 'error'); }
    };
    const avgVelocity = velocity && velocity.length > 0
        ? Math.round(velocity.reduce((s, v) => s + Number(v.point_done), 0) / velocity.length)
        : 0;

    return (
        <OrgPageShell
            title={payload?.project?.name ?? 'Project'}
            subtitle={payload?.project?.description ?? undefined}
            icon={<FolderKanban size={20} />}
            crumbs={[{ label: 'Projects', to: '/org/projects' }, { label: payload?.project?.name ?? '…' }]}
            actions={
                <>
                    <button className="btn btn-ghost" onClick={() => navigate('/org/projects')}>
                        <ArrowLeft size={14} /> <span style={{ marginLeft: 4 }}>Back</span>
                    </button>
                    <button className="btn btn-ghost" onClick={toggleVelocity} style={{ marginLeft: 8 }}>
                        <BarChart3 size={14} /> <span style={{ marginLeft: 6 }}>{velocity ? 'Hide velocity' : 'Velocity'}</span>
                    </button>
                    <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)} style={{ marginLeft: 8 }}>
                        <Settings2 size={14} /> <span style={{ marginLeft: 6 }}>Board</span>
                    </button>
                    <button className="btn btn-ghost" onClick={() => setSprintOpen(true)} style={{ marginLeft: 8 }}>
                        <Zap size={14} /> <span style={{ marginLeft: 6 }}>New sprint</span>
                    </button>
                    <button className="btn btn-primary" onClick={() => setNewOpen(true)} style={{ marginLeft: 8 }}>
                        <Plus size={14} /> <span style={{ marginLeft: 6 }}>New task</span>
                    </button>
                </>
            }
        >
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {modules && !modules.agile && (
                <div className="alert" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'color-mix(in srgb, #F59E0B 12%, transparent)', border: '1px solid #F59E0B55', color: '#F59E0B' }}>
                    <Settings2 size={14} /> Agile module is disabled for this workspace — re-enable it in Org Settings → Modules.
                </div>
            )}

            {/* Sprint / Backlog selector */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Chip active={view.type === 'backlog'} onClick={() => { setView({ type: 'backlog' }); setBurndown(null); }}>
                    <Inbox size={13} /> Backlog
                </Chip>
                {(payload?.sprints ?? []).map((s) => (
                    <Chip key={s.id} active={view.type === 'sprint' && view.sprintId === s.id}
                        onClick={() => { setView({ type: 'sprint', sprintId: s.id }); setBurndown(null); }}>
                        {s.status === 'active' ? <Zap size={13} /> : s.status === 'completed' ? <CheckCheck size={13} /> : <Clock size={13} />}
                        {s.name}
                        {s.status === 'active' && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--accent,#7c5cff)', color: '#fff', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>ACTIVE</span>}
                    </Chip>
                ))}
            </div>

            {/* Sprint control bar */}
            {currentSprint && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, padding: '12px 16px',
                    background: 'var(--bg-elevated,#14141c)', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8,
                }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: currentSprint.goal ? 'var(--text-primary,#e0e0e8)' : 'var(--text-muted,#8a8a96)' }}>
                            {currentSprint.goal ? `🎯 ${currentSprint.goal}` : 'No sprint goal set'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <div style={{ flex: '0 0 160px', height: 6, borderRadius: 3, background: 'var(--bg-primary,#0a0a0f)', overflow: 'hidden' }}>
                                <div style={{ height: 6, borderRadius: 3, background: 'var(--accent,#7c5cff)', width: `${currentSprint.task_count > 0 ? (currentSprint.done_count / currentSprint.task_count) * 100 : 0}%` }} />
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>{currentSprint.done_count}/{currentSprint.task_count} done</span>
                        </div>
                    </div>
                    {currentSprint.status === 'active' && (
                        <button className="btn btn-ghost" onClick={toggleBurndown}>
                            <TrendingDown size={14} /> <span style={{ marginLeft: 6 }}>{burndown ? 'Hide' : 'Burndown'}</span>
                        </button>
                    )}
                    {currentSprint.status === 'planned' && (
                        <button className="btn btn-primary" onClick={() => handleStart(currentSprint)}>Start sprint</button>
                    )}
                    {currentSprint.status === 'active' && (
                        <button className="btn btn-ghost" onClick={() => handleComplete(currentSprint)}>Complete sprint</button>
                    )}
                </div>
            )}

            {/* Burndown */}
            {burndown && burndown.length > 0 && (
                <div style={{ marginBottom: 12, padding: 16, background: 'var(--bg-elevated,#14141c)', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted,#8a8a96)', marginBottom: 8 }}>BURNDOWN — story points remaining</div>
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={burndown.map((p) => ({ day: new Date(p.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), Ideal: p.ideal, Remaining: p.remaining }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle,#2a2a35)" />
                            <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-muted,#8a8a96)' }} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted,#8a8a96)' }} />
                            <Tooltip contentStyle={{ background: 'var(--bg-primary,#0a0a0f)', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 6, fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Line type="monotone" dataKey="Ideal" stroke="#8a8a96" strokeDasharray="5 5" dot={false} />
                            <Line type="monotone" dataKey="Remaining" stroke="var(--accent,#7c5cff)" strokeWidth={2} dot={{ r: 2 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Quick filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <input
                    type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter by title or key…" className="input-field" style={{ maxWidth: 280 }}
                />
                <FilterToggle active={myOnly} onClick={() => setMyOnly((v) => !v)}><User size={12} /> Only my issues</FilterToggle>
                <FilterToggle active={sortRecent} onClick={() => setSortRecent((v) => !v)}><Clock size={12} /> Recently updated</FilterToggle>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted,#8a8a96)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide done
                </label>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>{viewTasks.length} issues</span>
            </div>

            {/* Label filter */}
            {(payload?.labels?.length ?? 0) > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {payload!.labels.map((l) => {
                        const active = labelFilter === l.id;
                        const c = l.color ?? '#7c5cff';
                        return (
                            <button key={l.id} onClick={() => setLabelFilter(active ? null : l.id)} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
                                fontSize: 12, fontWeight: 600, background: active ? c + '22' : 'transparent',
                                border: `1px solid ${active ? c : 'var(--border-subtle,#2a2a35)'}`, color: active ? c : 'var(--text-muted,#8a8a96)',
                            }}>
                                <span style={{ width: 8, height: 8, borderRadius: 4, background: c }} /> {l.name}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Velocity */}
            {velocity && (
                <div style={{ marginBottom: 12, padding: 16, background: 'var(--bg-elevated,#14141c)', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted,#8a8a96)' }}>VELOCITY — points completed per sprint</span>
                        {velocity.length > 0 && <span style={{ fontSize: 12, color: 'var(--accent,#7c5cff)', fontWeight: 700 }}>avg {avgVelocity} pts</span>}
                    </div>
                    {velocity.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>Complete a sprint to start tracking velocity.</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={[...velocity].reverse().map((v) => ({ name: v.name, Committed: Number(v.point_total), Completed: Number(v.point_done) }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle,#2a2a35)" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted,#8a8a96)' }} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted,#8a8a96)' }} />
                                <Tooltip contentStyle={{ background: 'var(--bg-primary,#0a0a0f)', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 6, fontSize: 12 }} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="Committed" fill="#3a3a48" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="Completed" fill="var(--accent,#7c5cff)" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            )}

            {/* Board */}
            {loading ? (
                <div style={{ padding: 24, color: 'var(--text-muted,#8a8a96)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Loader2 size={14} className="spin" /> Loading…
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))`, gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
                    {columns.map((col) => {
                        const list = byColumn.get(col.id) ?? [];
                        const over = col.wip_limit != null && list.length > col.wip_limit;
                        const isDrop = dropCol === col.id;
                        return (
                            <div key={col.id} className="glass-card"
                                onDragOver={(e) => { e.preventDefault(); setDropCol(col.id); }}
                                onDragLeave={() => setDropCol((c) => c === col.id ? null : c)}
                                onDrop={() => handleDrop(col)}
                                style={{
                                    ...(isDrop ? { background: 'var(--bg-hover,#1c1c26)' } : {}),
                                    borderColor: isDrop ? 'var(--accent,#7c5cff)' : undefined,
                                    borderRadius: 12, display: 'flex', flexDirection: 'column', minHeight: 240,
                                }}>
                                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle,#2a2a35)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 4, background: col.color ?? 'var(--accent,#7c5cff)' }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-primary,#e0e0e8)' }}>{col.name}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: over ? '#EF4444' : 'var(--text-muted,#8a8a96)' }}>
                                        {list.length}{col.wip_limit != null ? `/${col.wip_limit}` : ''}
                                    </span>
                                </div>
                                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {list.map((task) => {
                                        const ty = task.type ? TYPE_ICON[task.type] : null;
                                        const overdue = task.due_date && !task.completed_at && new Date(task.due_date) < new Date();
                                        return (
                                            <div key={task.id} className="board-card"
                                                draggable
                                                onDragStart={() => setDragId(task.id)}
                                                onDragEnd={() => { setDragId(null); setDropCol(null); }}
                                                onDragOver={(e) => { e.preventDefault(); }}
                                                onDrop={(e) => { e.stopPropagation(); void handleCardDrop(task, col); }}
                                                onClick={() => navigate(`/org/projects/${projectId}/task/${task.id}`)}
                                                style={{
                                                    borderRadius: 8, padding: 10, cursor: 'grab', opacity: dragId === task.id ? 0.4 : 1,
                                                }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                                    {ty && <ty.Icon size={12} color={ty.color} />}
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted,#8a8a96)' }}>{task.issue_key ?? '—'}</span>
                                                    {task.priority && <Flag size={11} color={PRIORITY_COLOR[task.priority]} style={{ marginLeft: 'auto' }} />}
                                                    {task.estimate_points != null && (
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent,#7c5cff)', background: 'var(--bg-elevated,#14141c)', borderRadius: 6, padding: '1px 6px', marginLeft: task.priority ? 4 : 'auto' }}>
                                                            {task.estimate_points}
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{task.title}</div>
                                                {(task.labels?.length ?? 0) > 0 && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                                        {task.labels.slice(0, 4).map((l) => (
                                                            <span key={l.id} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: (l.color ?? '#7c5cff') + '22', color: l.color ?? '#7c5cff' }}>{l.name}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {task.assignee_user_id
                                                        ? <Avatar name={task.assignee_name} url={task.assignee_avatar} size={20} />
                                                        : <span style={{ fontSize: 10, color: 'var(--text-muted,#8a8a96)' }}>unassigned</span>}
                                                    {overdue && (
                                                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#EF4444', fontWeight: 600 }}>
                                                            Due {new Date(task.due_date!).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {list.length === 0 && (
                                        <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--text-muted,#8a8a96)' }}>
                                            {isDrop ? 'Drop here' : 'No issues'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* New task modal */}
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
                    <textarea value={nDesc} onChange={(e) => setNDesc(e.target.value)} rows={3} className="input-field" style={{ width: '100%' }} />
                </FormField>
                <FormField label="Priority">
                    <select value={nPriority} onChange={(e) => setNPriority(e.target.value as TaskPriority)} className="input-field" style={{ width: '100%', textTransform: 'capitalize' }}>
                        {(['urgent', 'high', 'medium', 'low'] as TaskPriority[]).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </FormField>
                <FormField label="Due date (optional)">
                    <input type="date" value={nDue} onChange={(e) => setNDue(e.target.value)} className="input-field" style={{ width: '100%' }} />
                </FormField>
                <FormField label="Reminder (optional)" hint="The assignee's app schedules a local alarm at this time.">
                    <input type="datetime-local" value={nReminder} onChange={(e) => setNReminder(e.target.value)} className="input-field" style={{ width: '100%' }} />
                </FormField>
                <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>
                    Lands in <strong>{defaultStatus?.name ?? 'To Do'}</strong>{view.type === 'sprint' ? ` · ${currentSprint?.name}` : ' · Backlog'}.
                </div>
            </Modal>

            {/* New sprint modal */}
            <Modal
                open={sprintOpen}
                onClose={() => !savingSprint && setSprintOpen(false)}
                title="New sprint"
                footer={
                    <>
                        <button className="btn btn-ghost" onClick={() => setSprintOpen(false)} disabled={savingSprint}><X size={14} /></button>
                        <button className="btn btn-primary" onClick={handleCreateSprint} disabled={savingSprint || sName.trim().length < 2}>
                            {savingSprint ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                            <span style={{ marginLeft: 6 }}>Create sprint</span>
                        </button>
                    </>
                }
            >
                <FormField label="Name">
                    <input type="text" value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Sprint 1" className="input-field" style={{ width: '100%' }} autoFocus />
                </FormField>
                <FormField label="Goal (optional)">
                    <input type="text" value={sGoal} onChange={(e) => setSGoal(e.target.value)} placeholder="What will this sprint deliver?" className="input-field" style={{ width: '100%' }} />
                </FormField>
                <div style={{ display: 'flex', gap: 10 }}>
                    <FormField label="Start"><input type="date" value={sStart} onChange={(e) => setSStart(e.target.value)} className="input-field" style={{ width: '100%' }} /></FormField>
                    <FormField label="End"><input type="date" value={sEnd} onChange={(e) => setSEnd(e.target.value)} className="input-field" style={{ width: '100%' }} /></FormField>
                </div>
            </Modal>

            {/* Workflow designer */}
            <BoardSettings
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                statuses={columns}
                projectId={projectId!}
                orgId={orgId}
                settings={(payload?.project as any)?.settings ?? {}}
                onChanged={load}
                showToast={showToast}
            />

            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}

const CATEGORIES: { key: TaskStatusCategory; label: string }[] = [
    { key: 'backlog', label: 'Backlog' },
    { key: 'unstarted', label: 'To Do' },
    { key: 'started', label: 'In Progress' },
    { key: 'completed', label: 'Done' },
    { key: 'cancelled', label: 'Cancelled' },
];

const REQUIRABLE_FIELDS = ['due_date', 'estimate_points', 'priority', 'assignee'];

function BoardSettings({ open, onClose, statuses, projectId, orgId, settings, onChanged, showToast }: {
    open: boolean; onClose: () => void; statuses: BoardStatus[]; projectId: string;
    orgId: string | null; settings: Record<string, any>;
    onChanged: () => Promise<void> | void; showToast: (m: string, k?: 'error' | 'success') => void;
}) {
    const [busy, setBusy] = useState(false);
    const [newName, setNewName] = useState('');
    const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
    const [tpl, setTpl] = useState('');
    const required: string[] = settings?.required_fields ?? [];
    const deleteRole: string = settings?.permissions?.delete_tasks ?? 'manager';

    useEffect(() => {
        if (!open) return;
        templateList(orgId).then(setTemplates).catch(() => setTemplates([]));
    }, [open, orgId]);

    const run = async (fn: () => Promise<any>) => {
        setBusy(true);
        try { await fn(); await onChanged(); }
        catch (e: any) { showToast(e?.message ?? 'Action failed', 'error'); }
        finally { setBusy(false); }
    };

    const move = (idx: number, dir: -1 | 1) => {
        const ids = statuses.map((s) => s.id);
        const j = idx + dir;
        if (j < 0 || j >= ids.length) return;
        [ids[idx], ids[j]] = [ids[j], ids[idx]];
        void run(() => statusReorder(ids));
    };

    const toggleRequired = (field: string) => {
        const next = required.includes(field) ? required.filter((f) => f !== field) : [...required, field];
        void run(() => projectSetConfig({ projectId, requiredFields: next }));
    };

    return (
        <Modal
            open={open}
            onClose={() => !busy && onClose()}
            title="Board settings"
            footer={<button className="btn btn-ghost" onClick={onClose} disabled={busy}>Done</button>}
        >
            {/* Apply template */}
            <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border-subtle,#2a2a35)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted,#8a8a96)', marginBottom: 6 }}>APPLY TEMPLATE</div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <select value={tpl} onChange={(e) => setTpl(e.target.value)} className="input-field" style={{ flex: 1 }}>
                        <option value="">Choose a template…</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_global ? '' : ' (org)'}</option>)}
                    </select>
                    <button className="btn btn-ghost" disabled={busy || !tpl}
                        onClick={() => window.confirm('Replace this board\'s columns with the template? Tasks move to the new default column.') && run(() => applyTemplate(projectId, tpl))}>
                        Apply
                    </button>
                </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)', marginBottom: 10 }}>
                Map each column to a core category (To&nbsp;Do · In&nbsp;Progress · Done) so reporting stays accurate.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {statuses.map((s, idx) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8, border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 6 }}>
                        <input type="color" value={s.color ?? '#64748B'} disabled={busy}
                            onChange={(e) => run(() => statusUpdate({ statusId: s.id, color: e.target.value }))}
                            style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer' }} />
                        <input type="text" defaultValue={s.name} disabled={busy}
                            onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && run(() => statusUpdate({ statusId: s.id, name: e.target.value.trim() }))}
                            className="input-field" style={{ flex: 1, minWidth: 80 }} />
                        <select value={s.category} disabled={busy}
                            onChange={(e) => run(() => statusUpdate({ statusId: s.id, category: e.target.value as TaskStatusCategory }))}
                            className="input-field" style={{ width: 130 }}>
                            {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                        <input type="number" defaultValue={s.wip_limit ?? ''} placeholder="WIP" disabled={busy} min={0}
                            onBlur={(e) => run(() => statusUpdate({ statusId: s.id, wipLimit: e.target.value ? Number(e.target.value) : 0 }))}
                            className="input-field" style={{ width: 56 }} title="WIP limit (0 = none)" />
                        <button className="btn btn-ghost" disabled={busy || idx === 0} onClick={() => move(idx, -1)} title="Move up"><ChevronUp size={14} /></button>
                        <button className="btn btn-ghost" disabled={busy || idx === statuses.length - 1} onClick={() => move(idx, 1)} title="Move down"><ChevronDown size={14} /></button>
                        <button className="btn btn-ghost" disabled={busy || statuses.length <= 1}
                            onClick={() => window.confirm(`Delete "${s.name}"? Its tasks move to the default column.`) && run(() => statusDelete(s.id))}
                            title="Delete"><Trash2 size={14} color="#EF4444" /></button>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New column name"
                    className="input-field" style={{ flex: 1 }} />
                <button className="btn btn-primary" disabled={busy || newName.trim().length < 2}
                    onClick={() => run(async () => { await statusCreate({ projectId, name: newName.trim() }); setNewName(''); })}>
                    <Plus size={14} /> <span style={{ marginLeft: 6 }}>Add</span>
                </button>
            </div>

            {/* Field configuration */}
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border-subtle,#2a2a35)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted,#8a8a96)', marginBottom: 8 }}>REQUIRED FIELDS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {REQUIRABLE_FIELDS.map((f) => (
                        <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize' }}>
                            <input type="checkbox" checked={required.includes(f)} disabled={busy} onChange={() => toggleRequired(f)} />
                            {f.replace('_', ' ')}
                        </label>
                    ))}
                </div>
            </div>

            {/* Advanced permissions */}
            <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted,#8a8a96)', marginBottom: 6 }}>WHO CAN DELETE TASKS</div>
                <select value={deleteRole} disabled={busy}
                    onChange={(e) => run(() => projectSetConfig({ projectId, deleteRole: e.target.value as any }))}
                    className="input-field" style={{ width: '100%' }}>
                    <option value="admin">Admins &amp; owners only</option>
                    <option value="manager">Managers and above</option>
                    <option value="member">Any member</option>
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)', marginTop: 4 }}>
                    Everyone can still move tasks between columns.
                </div>
            </div>
        </Modal>
    );
}

function FilterToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            background: active ? 'color-mix(in srgb, var(--accent,#7c5cff) 14%, transparent)' : 'transparent',
            border: `1px solid ${active ? 'var(--accent,#7c5cff)' : 'var(--border-subtle,#2a2a35)'}`,
            color: active ? 'var(--accent,#7c5cff)' : 'var(--text-muted,#8a8a96)',
        }}>{children}</button>
    );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: active ? 'color-mix(in srgb, var(--accent,#7c5cff) 14%, transparent)' : 'transparent',
            border: `1px solid ${active ? 'var(--accent,#7c5cff)' : 'var(--border-subtle,#2a2a35)'}`,
            color: active ? 'var(--accent,#7c5cff)' : 'var(--text-muted,#8a8a96)',
        }}>
            {children}
        </button>
    );
}
