/**
 * Org → Project → Task detail
 *
 * Comprehensive task page:
 *   - Title / description / status / priority / assignee / due-date editing
 *   - Activity feed (right column)
 *   - Comments thread (resolve toggle)
 *   - Checklists with item-level done toggle
 *   - Dependencies (blocks / blocked_by / related)
 *   - Add/remove assignees + watchers
 *
 * Path: /org/projects/:projectId/task/:taskId
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, ListTodo, Loader2, MessageSquare, Send, Check,
    Trash2, Plus, Users as UsersIcon, Eye, Link2, X, Calendar,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useScope } from '../../context/ScopeContext';
import {
    taskGetDetail, taskSetStatus, taskAssign, taskAddComment,
    taskResolveComment, taskAddWatcher, taskRemoveWatcher,
    taskAddAssignee, taskRemoveAssignee, taskUpdateFields,
    taskSetDependency, taskRemoveDependency,
    checklistCreate, checklistItemCreate, checklistItemToggle,
    taskCommentMention, labelList, taskSetLabels, logTime, type BoardLabel,
    type TaskCommentRow, type TaskActivityRow,
    type TaskAssigneeRow, type TaskDependencyRow, type TaskChecklistRow,
    type TaskStatusCategory, type TaskPriority,
} from '../../lib/tasks';
import { orgListMembers, type OrgMemberRow } from '../../lib/org';
import { OrgPageShell, Avatar } from '../../components/org';
import { useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';

// We unwrap taskResolveComment here since lib/tasks doesn't export it directly.
async function setCommentResolved(commentId: string, resolved: boolean) {
    await taskResolveComment(commentId, resolved);
}

const STATUS_OPTIONS: { value: string; category: TaskStatusCategory; label: string }[] = [
    { value: 'backlog',     category: 'backlog',   label: 'Backlog' },
    { value: 'pending',     category: 'unstarted', label: 'Todo' },
    { value: 'in_progress', category: 'started',   label: 'In Progress' },
    { value: 'done',        category: 'completed', label: 'Done' },
    { value: 'cancelled',   category: 'cancelled', label: 'Cancelled' },
];

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export default function OrgTaskDetailPage() {
    const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();
    const navigate = useNavigate();
    const { scope } = useScope();
    const orgId = scope.orgId;
    const { toast, show: showToast } = useOrgToast();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<{
        task: any;
        assignees: TaskAssigneeRow[];
        watchers: TaskAssigneeRow[];
        comments: TaskCommentRow[];
        activity: TaskActivityRow[];
        dependencies: TaskDependencyRow[];
        checklists: TaskChecklistRow[];
    } | null>(null);

    const [orgMembers, setOrgMembers] = useState<OrgMemberRow[]>([]);
    const [allOrgTasks, setAllOrgTasks] = useState<Array<{ id: string; title: string }>>([]);

    const [titleDraft, setTitleDraft] = useState('');
    const [descDraft, setDescDraft] = useState('');
    const [savingField, setSavingField] = useState<string | null>(null);

    const [newComment, setNewComment] = useState('');
    const [postingComment, setPostingComment] = useState(false);

    const [addAssigneeId, setAddAssigneeId] = useState('');
    const [addWatcherId, setAddWatcherId] = useState('');
    const [addDepId, setAddDepId] = useState('');
    const [addDepType, setAddDepType] = useState<'blocks' | 'blocked_by' | 'related'>('blocks');

    const [newChecklist, setNewChecklist] = useState('');
    const [newChecklistItem, setNewChecklistItem] = useState<Record<string, string>>({});

    const [orgLabels, setOrgLabels] = useState<BoardLabel[]>([]);
    const [taskLabelIds, setTaskLabelIds] = useState<string[]>([]);
    const [timeMin, setTimeMin] = useState('');
    const [timeNote, setTimeNote] = useState('');

    const load = useCallback(async () => {
        if (!taskId) return;
        setLoading(true); setError(null);
        try {
            const d = await taskGetDetail(taskId);
            setData(d);
            setTitleDraft(d.task.title ?? '');
            setDescDraft(d.task.description ?? '');

            if (orgId) {
                const [members, otherTasks, labels, links] = await Promise.all([
                    orgListMembers(orgId),
                    supabase.from('tasks').select('id, title').eq('org_id', orgId).neq('id', taskId).limit(100),
                    labelList(orgId).catch(() => [] as BoardLabel[]),
                    supabase.from('task_label_links').select('label_id').eq('task_id', taskId),
                ]);
                setOrgMembers(members);
                setAllOrgTasks(otherTasks.data ?? []);
                setOrgLabels(labels);
                setTaskLabelIds((links.data ?? []).map((r: any) => r.label_id));
            }
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load task');
        } finally { setLoading(false); }
    }, [taskId, orgId]);

    useEffect(() => { void load(); }, [load]);

    // Realtime — refetch when comments or activity change on this task.
    useEffect(() => {
        if (!taskId) return;
        const ch = supabase
            .channel(`task:${taskId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskId}` }, () => { void load(); })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_activity', filter: `task_id=eq.${taskId}` }, () => { void load(); })
            .subscribe();
        return () => { void supabase.removeChannel(ch); };
    }, [taskId, load]);

    const saveTitle = async () => {
        if (!taskId || !data || titleDraft.trim() === (data.task.title ?? '')) return;
        setSavingField('title');
        try { await taskUpdateFields(taskId, { title: titleDraft.trim() }); await load(); }
        finally { setSavingField(null); }
    };

    const saveDesc = async () => {
        if (!taskId || !data || descDraft === (data.task.description ?? '')) return;
        setSavingField('description');
        try { await taskUpdateFields(taskId, { description: descDraft }); await load(); }
        finally { setSavingField(null); }
    };

    const changeStatus = async (statusValue: string) => {
        if (!taskId) return;
        const opt = STATUS_OPTIONS.find((s) => s.value === statusValue);
        if (!opt) return;
        setSavingField('status');
        try { await taskSetStatus(taskId, opt.value, opt.category); await load(); }
        finally { setSavingField(null); }
    };

    const changePriority = async (priority: TaskPriority) => {
        if (!taskId) return;
        setSavingField('priority');
        try { await taskUpdateFields(taskId, { priority }); await load(); }
        finally { setSavingField(null); }
    };

    const changeDueDate = async (val: string) => {
        if (!taskId) return;
        setSavingField('due_date');
        try { await taskUpdateFields(taskId, { due_date: val ? new Date(val).toISOString() : null }); await load(); }
        finally { setSavingField(null); }
    };

    const changePrimaryAssignee = async (userId: string) => {
        if (!taskId) return;
        setSavingField('assignee');
        try { await taskAssign(taskId, userId); await load(); }
        finally { setSavingField(null); }
    };

    const postComment = async () => {
        if (!taskId || newComment.trim().length === 0) return;
        setPostingComment(true);
        try {
            const ids = resolveMentions(newComment, orgMembers);
            if (ids.length > 0) await taskCommentMention(taskId, newComment.trim(), ids);
            else await taskAddComment(taskId, newComment.trim());
            setNewComment(''); await load();
        } finally { setPostingComment(false); }
    };

    const toggleResolved = async (c: TaskCommentRow) => {
        await setCommentResolved(c.id, !c.resolved);
        await load();
    };

    const handleAddAssignee = async () => {
        if (!taskId || !addAssigneeId) return;
        try { await taskAddAssignee(taskId, addAssigneeId); setAddAssigneeId(''); await load(); showToast('Assignee added'); }
        catch (e: any) { showToast(e?.message ?? 'Could not add assignee', 'error'); }
    };
    const handleRemoveAssignee = async (uid: string) => {
        if (!taskId) return;
        try { await taskRemoveAssignee(taskId, uid); await load(); showToast('Assignee removed'); }
        catch (e: any) { showToast(e?.message ?? 'Could not remove', 'error'); }
    };
    const handleAddWatcher = async () => {
        if (!taskId || !addWatcherId) return;
        try { await taskAddWatcher(taskId, addWatcherId); setAddWatcherId(''); await load(); showToast('Watcher added'); }
        catch (e: any) { showToast(e?.message ?? 'Could not add watcher', 'error'); }
    };
    const handleRemoveWatcher = async (uid: string) => {
        if (!taskId) return;
        try { await taskRemoveWatcher(taskId, uid); await load(); showToast('Watcher removed'); }
        catch (e: any) { showToast(e?.message ?? 'Could not remove', 'error'); }
    };

    const handleAddDep = async () => {
        if (!taskId || !addDepId) return;
        try { await taskSetDependency(taskId, addDepId, addDepType); setAddDepId(''); await load(); showToast('Dependency linked'); }
        catch (e: any) { showToast(e?.message ?? 'Could not add', 'error'); }
    };
    const handleRemoveDep = async (depId: string, type: 'blocks' | 'blocked_by' | 'related') => {
        if (!taskId) return;
        try { await taskRemoveDependency(taskId, depId, type); await load(); showToast('Dependency removed'); }
        catch (e: any) { showToast(e?.message ?? 'Could not remove', 'error'); }
    };

    const handleNewChecklist = async () => {
        if (!taskId || newChecklist.trim().length === 0) return;
        try { await checklistCreate(taskId, newChecklist.trim()); setNewChecklist(''); await load(); showToast('Checklist created'); }
        catch (e: any) { showToast(e?.message ?? 'Could not create', 'error'); }
    };
    const handleNewChecklistItem = async (checklistId: string) => {
        const content = newChecklistItem[checklistId]?.trim();
        if (!content) return;
        try {
            await checklistItemCreate(checklistId, content);
            setNewChecklistItem((m) => ({ ...m, [checklistId]: '' }));
            await load();
        } catch (e: any) { showToast(e?.message ?? 'Could not add', 'error'); }
    };
    const handleToggleItem = async (itemId: string, done: boolean) => {
        try { await checklistItemToggle(itemId, done); await load(); }
        catch (e: any) { showToast(e?.message ?? 'Could not toggle', 'error'); }
    };

    // Avoid showing assignees/watchers in the add picker that are already on the task.
    const assigneeIds = useMemo(() => new Set((data?.assignees ?? []).map((a) => a.user_id)), [data?.assignees]);
    const watcherIds  = useMemo(() => new Set((data?.watchers  ?? []).map((a) => a.user_id)), [data?.watchers]);

    if (loading) {
        return (
            <OrgPageShell title="Task" icon={<ListTodo size={20} />}>
                <div style={{ padding: 24, color: 'var(--text-muted,#8a8a96)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Loader2 size={14} className="spin" /> Loading…
                </div>
            </OrgPageShell>
        );
    }
    if (error || !data) {
        return (
            <OrgPageShell title="Task" icon={<ListTodo size={20} />}>
                <div className="alert alert-error">{error ?? 'Task not found'}</div>
            </OrgPageShell>
        );
    }

    return (
        <OrgPageShell
            title={data.task.title}
            icon={<ListTodo size={20} />}
            crumbs={[
                { label: 'Projects', to: '/org/projects' },
                ...(projectId ? [{ label: 'Project', to: `/org/projects/${projectId}` }] : []),
                { label: data.task.title },
            ]}
            actions={
                <button className="btn btn-ghost" onClick={() => navigate(projectId ? `/org/projects/${projectId}` : '/org/projects')}>
                    <ArrowLeft size={14} /> <span style={{ marginLeft: 4 }}>Back</span>
                </button>
            }
        >
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
                {/* ── LEFT: main content ─────────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Title + description */}
                    <section style={panel}>
                        <label style={label}>Title</label>
                        <input
                            type="text"
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onBlur={saveTitle}
                            className="input-field"
                            style={{ width: '100%', fontSize: 16, fontWeight: 500 }}
                        />
                        <label style={{ ...label, marginTop: 12 }}>Description</label>
                        <textarea
                            value={descDraft}
                            onChange={(e) => setDescDraft(e.target.value)}
                            onBlur={saveDesc}
                            rows={6}
                            placeholder="Add a description…"
                            className="input-field"
                            style={{ width: '100%', resize: 'vertical' }}
                        />
                        {savingField && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Loader2 size={10} className="spin" /> Saving {savingField}…
                            </div>
                        )}
                    </section>

                    {/* Checklists */}
                    <section style={panel}>
                        <h3 style={panelTitle}>Checklists</h3>
                        {data.checklists.map((cl) => {
                            const done = cl.items.filter((i) => i.done).length;
                            return (
                                <div key={cl.id} style={{ marginBottom: 16 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                                        {cl.title} <span style={{ color: 'var(--text-muted,#8a8a96)', fontSize: 11 }}>
                                            {done}/{cl.items.length}
                                        </span>
                                    </div>
                                    {cl.items.map((it) => (
                                        <label key={it.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '6px 0', cursor: 'pointer',
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={it.done}
                                                onChange={(e) => handleToggleItem(it.id, e.target.checked)}
                                            />
                                            <span style={{
                                                fontSize: 13,
                                                textDecoration: it.done ? 'line-through' : 'none',
                                                color: it.done ? 'var(--text-muted,#8a8a96)' : undefined,
                                            }}>
                                                {it.content}
                                            </span>
                                        </label>
                                    ))}
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                        <input
                                            type="text"
                                            value={newChecklistItem[cl.id] ?? ''}
                                            onChange={(e) => setNewChecklistItem((m) => ({ ...m, [cl.id]: e.target.value }))}
                                            placeholder="New item…"
                                            className="input-field"
                                            style={{ flex: 1, fontSize: 12 }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleNewChecklistItem(cl.id); }}
                                        />
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleNewChecklistItem(cl.id)}>
                                            <Plus size={12} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <input
                                type="text"
                                value={newChecklist}
                                onChange={(e) => setNewChecklist(e.target.value)}
                                placeholder="New checklist…"
                                className="input-field"
                                style={{ flex: 1, fontSize: 13 }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleNewChecklist(); }}
                            />
                            <button className="btn btn-ghost btn-sm" onClick={handleNewChecklist}>
                                <Plus size={12} /> <span style={{ marginLeft: 4 }}>Add checklist</span>
                            </button>
                        </div>
                    </section>

                    {/* Dependencies */}
                    <section style={panel}>
                        <h3 style={panelTitle}><Link2 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Dependencies</h3>
                        {data.dependencies.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>No dependencies.</div>
                        ) : (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginBottom: 12 }}>
                                {data.dependencies.map((d) => (
                                    <li key={`${d.depends_on_task_id}-${d.type}`} style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '8px 0', borderBottom: '1px solid var(--border-subtle,#2a2a35)',
                                    }}>
                                        <span style={{
                                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                            background: 'rgba(99,102,241,0.15)', color: '#a5a8ff',
                                            textTransform: 'uppercase', letterSpacing: 1,
                                        }}>{d.type.replace('_', ' ')}</span>
                                        <a
                                            href={`/org/projects/${projectId}/task/${d.depends_on_task_id}`}
                                            style={{ flex: 1, fontSize: 13, color: 'var(--text-primary,#e0e0e8)' }}
                                        >
                                            {d.other_title ?? d.depends_on_task_id.slice(0, 8) + '…'}
                                        </a>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveDep(d.depends_on_task_id, d.type)}>
                                            <X size={12} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div style={{ display: 'flex', gap: 6 }}>
                            <select value={addDepType} onChange={(e) => setAddDepType(e.target.value as any)} className="input-field" style={{ width: 110, fontSize: 12 }}>
                                <option value="blocks">blocks</option>
                                <option value="blocked_by">blocked by</option>
                                <option value="related">related</option>
                            </select>
                            <select value={addDepId} onChange={(e) => setAddDepId(e.target.value)} className="input-field" style={{ flex: 1, fontSize: 12 }}>
                                <option value="">Link to a task…</option>
                                {allOrgTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                            </select>
                            <button className="btn btn-ghost btn-sm" onClick={handleAddDep} disabled={!addDepId}>
                                <Plus size={12} />
                            </button>
                        </div>
                    </section>

                    {/* Comments */}
                    <section style={panel}>
                        <h3 style={panelTitle}><MessageSquare size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Comments ({data.comments.length})</h3>

                        {data.comments.map((c) => (
                            <div key={c.id} style={{
                                display: 'flex', gap: 10, padding: '10px 0',
                                borderBottom: '1px solid var(--border-subtle,#2a2a35)',
                                opacity: c.resolved ? 0.55 : 1,
                            }}>
                                <Avatar name={c.author?.display_name} url={c.author?.avatar_url} size={28} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                        <strong style={{ fontSize: 13 }}>{c.author?.display_name ?? '—'}</strong>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)' }}>
                                            {new Date(c.created_at).toLocaleString()}
                                        </span>
                                        {c.resolved && <span style={{ fontSize: 10, color: '#22c55e' }}>resolved</span>}
                                    </div>
                                    <div style={{ fontSize: 13, lineHeight: 1.45, marginTop: 4 }}>
                                        <Markdown text={c.body} members={orgMembers} />
                                    </div>
                                </div>
                                <button className="btn btn-ghost btn-sm" onClick={() => toggleResolved(c)} title={c.resolved ? 'Re-open' : 'Resolve'}>
                                    <Check size={12} />
                                </button>
                            </div>
                        ))}

                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12 }}>
                            <textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Write a comment…"
                                rows={2}
                                className="input-field"
                                style={{ flex: 1, resize: 'vertical' }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void postComment(); }
                                }}
                            />
                            <button
                                className="btn btn-primary"
                                onClick={postComment}
                                disabled={postingComment || newComment.trim().length === 0}
                            >
                                {postingComment ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                            </button>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)', marginTop: 4 }}>
                            Tip: ⌘/Ctrl + Enter to post · <strong>@name</strong> to mention · **bold**, *italic*, `code`, - lists
                        </div>
                    </section>
                </div>

                {/* ── RIGHT: meta & activity ─────────────────────────────────── */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Meta */}
                    <section style={panel}>
                        <h3 style={panelTitle}>Details</h3>

                        <div style={metaRow}>
                            <span style={metaLabel}>Status</span>
                            <select
                                value={data.task.status}
                                onChange={(e) => changeStatus(e.target.value)}
                                className="input-field"
                                style={{ flex: 1, fontSize: 13 }}
                            >
                                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>

                        <div style={metaRow}>
                            <span style={metaLabel}>Priority</span>
                            <select
                                value={data.task.priority ?? 'medium'}
                                onChange={(e) => changePriority(e.target.value as TaskPriority)}
                                className="input-field"
                                style={{ flex: 1, fontSize: 13 }}
                            >
                                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>

                        <div style={metaRow}>
                            <span style={metaLabel}>Due</span>
                            <input
                                type="date"
                                value={data.task.due_date ? new Date(data.task.due_date).toISOString().slice(0, 10) : ''}
                                onChange={(e) => changeDueDate(e.target.value)}
                                className="input-field"
                                style={{ flex: 1, fontSize: 13 }}
                            />
                        </div>

                        <div style={metaRow}>
                            <span style={metaLabel}>Primary</span>
                            <select
                                value={data.task.assignee_user_id ?? ''}
                                onChange={(e) => changePrimaryAssignee(e.target.value)}
                                className="input-field"
                                style={{ flex: 1, fontSize: 13 }}
                            >
                                <option value="">(unassigned)</option>
                                {orgMembers.map((m) => (
                                    <option key={m.user_id} value={m.user_id}>
                                        {m.display_name ?? m.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </section>

                    {/* Assignees */}
                    <section style={panel}>
                        <h3 style={panelTitle}><UsersIcon size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Assignees</h3>
                        {data.assignees.length === 0
                            ? <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>None.</div>
                            : data.assignees.map((a) => (
                                <div key={a.user_id} style={memberRow}>
                                    <Avatar name={a.display_name} url={a.avatar_url} size={24} />
                                    <span style={{ flex: 1, fontSize: 12 }}>
                                        {a.display_name ?? a.user_id.slice(0, 8)}
                                        {a.is_primary && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent,#6366f1)' }}>primary</span>}
                                    </span>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveAssignee(a.user_id)}>
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            ))}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <select value={addAssigneeId} onChange={(e) => setAddAssigneeId(e.target.value)} className="input-field" style={{ flex: 1, fontSize: 12 }}>
                                <option value="">Add assignee…</option>
                                {orgMembers.filter((m) => !assigneeIds.has(m.user_id)).map((m) => (
                                    <option key={m.user_id} value={m.user_id}>{m.display_name ?? m.email}</option>
                                ))}
                            </select>
                            <button className="btn btn-ghost btn-sm" onClick={handleAddAssignee} disabled={!addAssigneeId}>
                                <Plus size={12} />
                            </button>
                        </div>
                    </section>

                    {/* Labels */}
                    {orgLabels.length > 0 && (
                        <section style={panel}>
                            <h3 style={panelTitle}>Labels</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {orgLabels.map((l) => {
                                    const on = taskLabelIds.includes(l.id);
                                    const c = l.color ?? 'var(--accent,#7c5cff)';
                                    return (
                                        <button key={l.id} onClick={async () => {
                                            const next = on ? taskLabelIds.filter((x) => x !== l.id) : [...taskLabelIds, l.id];
                                            setTaskLabelIds(next);
                                            try { await taskSetLabels(taskId!, next); }
                                            catch { setTaskLabelIds(taskLabelIds); }
                                        }} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
                                            fontSize: 11, fontWeight: 600, background: on ? c + '22' : 'transparent',
                                            border: `1px solid ${on ? c : 'var(--border-subtle,#2a2a35)'}`, color: on ? c : 'var(--text-muted,#8a8a96)',
                                        }}>
                                            <span style={{ width: 7, height: 7, borderRadius: 4, background: c }} /> {l.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* Time tracking */}
                    <section style={panel}>
                        <h3 style={panelTitle}>Time logged</h3>
                        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>{fmtMinutes((data.task as any).time_logged ?? 0)}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input type="number" min={0} value={timeMin} onChange={(e) => setTimeMin(e.target.value)} placeholder="Min" className="input-field" style={{ width: 64, fontSize: 12 }} />
                            <input type="text" value={timeNote} onChange={(e) => setTimeNote(e.target.value)} placeholder="Note" className="input-field" style={{ flex: 1, fontSize: 12 }} />
                            <button className="btn btn-ghost btn-sm" disabled={!timeMin || Number(timeMin) <= 0}
                                onClick={async () => {
                                    try { await logTime(taskId!, Number(timeMin), timeNote.trim() || undefined); setTimeMin(''); setTimeNote(''); await load(); }
                                    catch (e: any) { showToast(e?.message ?? 'Could not log time', 'error'); }
                                }}>
                                <Plus size={12} />
                            </button>
                        </div>
                    </section>

                    {/* Watchers */}
                    <section style={panel}>
                        <h3 style={panelTitle}><Eye size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Watchers</h3>
                        {data.watchers.length === 0
                            ? <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>None.</div>
                            : data.watchers.map((w) => (
                                <div key={w.user_id} style={memberRow}>
                                    <Avatar name={w.display_name} url={w.avatar_url} size={24} />
                                    <span style={{ flex: 1, fontSize: 12 }}>{w.display_name ?? w.user_id.slice(0, 8)}</span>
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveWatcher(w.user_id)}>
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            ))}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <select value={addWatcherId} onChange={(e) => setAddWatcherId(e.target.value)} className="input-field" style={{ flex: 1, fontSize: 12 }}>
                                <option value="">Add watcher…</option>
                                {orgMembers.filter((m) => !watcherIds.has(m.user_id)).map((m) => (
                                    <option key={m.user_id} value={m.user_id}>{m.display_name ?? m.email}</option>
                                ))}
                            </select>
                            <button className="btn btn-ghost btn-sm" onClick={handleAddWatcher} disabled={!addWatcherId}>
                                <Plus size={12} />
                            </button>
                        </div>
                    </section>

                    {/* Activity feed */}
                    <section style={panel}>
                        <h3 style={panelTitle}><Calendar size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Activity</h3>
                        {data.activity.length === 0
                            ? <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>No activity yet.</div>
                            : (
                                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                    {data.activity.slice(0, 25).map((a) => (
                                        <li key={a.id} style={{
                                            padding: '6px 0', borderBottom: '1px solid var(--border-subtle,#2a2a35)',
                                            fontSize: 11, color: 'var(--text-muted,#8a8a96)',
                                        }}>
                                            <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary,#b0b0bc)' }}>{a.action}</span>
                                            <br />
                                            <span>{new Date(a.created_at).toLocaleString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                    </section>
                </aside>
            </div>
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}

const panel: React.CSSProperties = {
    background: 'var(--bg-elevated,#14141c)',
    border: '1px solid var(--border-subtle,#2a2a35)',
    borderRadius: 8, padding: 16,
};
const panelTitle: React.CSSProperties = { margin: 0, marginBottom: 12, fontSize: 14, fontWeight: 600 };
const label: React.CSSProperties = {
    display: 'block', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
    color: 'var(--text-muted,#8a8a96)', marginBottom: 4,
};
const metaRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' };
const metaLabel: React.CSSProperties = { width: 64, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)' };
const memberRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 0', borderBottom: '1px solid var(--border-subtle,#2a2a35)',
};

function fmtMinutes(mins: number): string {
    if (!mins || mins <= 0) return 'No time logged';
    const h = Math.floor(mins / 60); const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ── lightweight markdown + mentions (no dependency) ── */

// Resolve "@name" tokens in a comment to org member user ids.
function resolveMentions(text: string, members: OrgMemberRow[]): string[] {
    const tokens = (text.match(/@([\w.\-]+)/g) ?? []).map((t) => t.slice(1).toLowerCase());
    if (tokens.length === 0) return [];
    const ids = new Set<string>();
    for (const tok of tokens) {
        for (const m of members) {
            const name = (m.display_name ?? '').toLowerCase();
            const first = name.split(' ')[0];
            const emailUser = (m.email ?? '').split('@')[0].toLowerCase();
            if (tok === first || tok === emailUser || name.replace(/\s+/g, '') === tok) { ids.add(m.user_id); break; }
        }
    }
    return [...ids];
}

// Minimal, safe inline markdown: bold, italic, code, links, @mentions, - lists.
function Markdown({ text, members }: { text: string; members: OrgMemberRow[] }) {
    const names = new Set(members.map((m) => (m.display_name ?? '').split(' ')[0].toLowerCase()).filter(Boolean));
    const lines = text.split('\n');
    return (
        <div style={{ whiteSpace: 'pre-wrap' }}>
            {lines.map((line, li) => {
                const bullet = /^\s*[-*]\s+/.test(line);
                const content = bullet ? line.replace(/^\s*[-*]\s+/, '') : line;
                return (
                    <div key={li} style={bullet ? { paddingLeft: 14, position: 'relative' } : undefined}>
                        {bullet && <span style={{ position: 'absolute', left: 2 }}>•</span>}
                        {renderInline(content, names)}
                    </div>
                );
            })}
        </div>
    );
}

function renderInline(text: string, mentionNames: Set<string>): React.ReactNode[] {
    // Order matters: code first (so we don't format inside it), then links, bold, italic, mentions.
    const out: React.ReactNode[] = [];
    const regex = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(@[\w.\-]+)/g;
    let last = 0; let m: RegExpExecArray | null; let key = 0;
    while ((m = regex.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index));
        const tok = m[0];
        if (tok.startsWith('`')) {
            out.push(<code key={key++} style={{ background: 'var(--bg-primary,#0a0a0f)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>{tok.slice(1, -1)}</code>);
        } else if (tok.startsWith('[')) {
            const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
            out.push(<a key={key++} href={mm[2]} target="_blank" rel="noreferrer" style={{ color: 'var(--accent,#7c5cff)' }}>{mm[1]}</a>);
        } else if (tok.startsWith('**')) {
            out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
        } else if (tok.startsWith('*')) {
            out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
        } else if (tok.startsWith('@')) {
            const known = mentionNames.has(tok.slice(1).toLowerCase());
            out.push(<span key={key++} style={{ color: known ? 'var(--accent,#7c5cff)' : 'inherit', fontWeight: known ? 600 : 400 }}>{tok}</span>);
        }
        last = m.index + tok.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}
