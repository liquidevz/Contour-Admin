/**
 * Org → Tickets
 *
 * Support / ops intake queue. A ticket is a task of type `incident` (reuses the
 * whole task spine), surfaced as its own triage list with inline status control,
 * priority, assignee, due date and an optional reminder (the assignee's mobile
 * app schedules the local alarm from `reminder_at`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ticket, Plus, Loader2, AlarmClock } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    ticketList, taskOrgCreate, taskSetStatus, taskUpdateFields,
    type TaskRow, type TaskPriority, type TaskStatusCategory,
} from '../../lib/tasks';
import { OrgPageShell, Modal, FormField } from '../../components/org';
import { useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';
import SearchFilter from '../../components/ui/SearchFilter';
import { CardSkeleton } from '../../components/ui/Skeletons';
import EmptyState from '../../components/ui/EmptyState';

const STATUS_LABELS: Record<TaskStatusCategory, string> = {
    backlog: 'Backlog', unstarted: 'To do', started: 'In progress', completed: 'Resolved', cancelled: 'Cancelled',
};
const STATUS_COLORS: Record<TaskStatusCategory, string> = {
    backlog: '#64748B', unstarted: '#64748B', started: '#3B82F6', completed: '#22C55E', cancelled: '#71717A',
};
const PRIORITY_COLORS: Record<TaskPriority, string> = {
    urgent: '#EF4444', high: '#F59E0B', medium: '#3B82F6', low: '#6B7280',
};
const STATUSES: TaskStatusCategory[] = ['backlog', 'unstarted', 'started', 'completed', 'cancelled'];
const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

function isResolved(cat: TaskStatusCategory | null): boolean {
    return cat === 'completed' || cat === 'cancelled';
}

export default function OrgTicketsPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;
    const canCreate = scope.role != null && scope.role !== 'guest';
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows] = useState<TaskRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');

    const [createOpen, setCreateOpen] = useState(false);
    const [cTitle, setCTitle] = useState('');
    const [cDesc, setCDesc] = useState('');
    const [cPriority, setCPriority] = useState<TaskPriority>('high');
    const [cDue, setCDue] = useState('');
    const [cReminder, setCReminder] = useState('');
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true); setError(null);
        try { setRows(await ticketList(orgId)); }
        catch (e: any) { setError(e?.message ?? 'Failed to load tickets'); }
        finally { setLoading(false); }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    const counts = useMemo(() => ({
        open: rows.filter((r) => !isResolved(r.status_category)).length,
        resolved: rows.filter((r) => isResolved(r.status_category)).length,
    }), [rows]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((t) => {
            if (filter === 'open' && isResolved(t.status_category)) return false;
            if (filter === 'resolved' && !isResolved(t.status_category)) return false;
            if (!q) return true;
            return [t.title, t.description, t.assignee_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
        });
    }, [rows, search, filter]);

    const handleCreate = async () => {
        if (!orgId || cTitle.trim().length < 2) return;
        setCreating(true); setCreateErr(null);
        try {
            const id = await taskOrgCreate({
                orgId,
                title: cTitle.trim(),
                description: cDesc.trim() || undefined,
                priority: cPriority,
                type: 'incident',
                dueDate: cDue ? new Date(cDue).toISOString() : undefined,
                visibility: 'team',
            });
            if (cReminder) {
                await taskUpdateFields(id, { reminder_at: new Date(cReminder).toISOString(), reminder_enabled: true });
            }
            setCreateOpen(false);
            setCTitle(''); setCDesc(''); setCPriority('high'); setCDue(''); setCReminder('');
            await load();
            showToast('Ticket filed');
        } catch (e: any) { setCreateErr(e?.message ?? 'Could not file ticket'); }
        finally { setCreating(false); }
    };

    const handleStatus = async (t: TaskRow, cat: TaskStatusCategory) => {
        setBusyId(t.id);
        try { await taskSetStatus(t.id, cat, cat); await load(); }
        catch (e: any) { showToast(e?.message ?? 'Could not update status', 'error'); }
        finally { setBusyId(null); }
    };

    return (
        <OrgPageShell
            title="Tickets"
            subtitle="Support and incident intake — triage, assign, and resolve."
            icon={<Ticket size={20} />}
            require="orgMember"
            actions={canCreate ? (
                <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                    <Plus size={14} /> <span style={{ marginLeft: 6 }}>New ticket</span>
                </button>
            ) : null}
        >
            <SearchFilter
                query={search}
                onQueryChange={setSearch}
                placeholder="Search tickets…"
                chips={[
                    {
                        key: 'state',
                        label: 'State',
                        value: filter === 'open' ? null : filter,
                        onChange: (v) => setFilter((v as 'resolved' | 'all') ?? 'open'),
                        options: [{ value: 'resolved', label: 'Resolved' }, { value: 'all', label: 'All' }],
                    },
                ]}
                rightExtra={
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {counts.open} open · {counts.resolved} resolved
                    </span>
                }
            />

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            {loading ? (
                <div style={{ display: 'grid', gap: 10 }}>
                    {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} lines={2} />)}
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={Ticket}
                    title={rows.length === 0 ? 'No tickets yet' : 'No tickets match'}
                    body={rows.length === 0
                        ? (canCreate ? 'Click "New ticket" to file the first one.' : 'Tickets your team files will appear here.')
                        : 'Try adjusting the search or filters.'}
                    action={rows.length === 0 && canCreate ? (
                        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> New ticket</button>
                    ) : null}
                />
            ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                    {filtered.map((t) => {
                        const prColor = t.priority ? PRIORITY_COLORS[t.priority] : 'var(--text-muted)';
                        const overdue = t.due_date && !isResolved(t.status_category) && new Date(t.due_date) < new Date();
                        return (
                            <div key={t.id} style={{
                                display: 'flex', alignItems: 'center', gap: 14,
                                background: 'var(--bg-elevated,#14141c)', border: '1px solid var(--border-subtle,#2a2a35)',
                                borderRadius: 8, padding: '12px 16px',
                            }}>
                                <span style={{ width: 10, height: 10, borderRadius: 5, background: prColor, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary,#e8e8ef)' }}>{t.title}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)', marginTop: 3, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                        {t.priority && <span style={{ color: prColor, fontWeight: 600, textTransform: 'capitalize' }}>{t.priority}</span>}
                                        {t.assignee_name && <span>· {t.assignee_name}</span>}
                                        {t.due_date && <span style={{ color: overdue ? '#EF4444' : undefined }}>· due {new Date(t.due_date).toLocaleDateString()}</span>}
                                        {t.reminder_enabled && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlarmClock size={11} /> reminder</span>}
                                    </div>
                                </div>
                                <select
                                    value={t.status_category ?? 'unstarted'}
                                    disabled={busyId === t.id || !canCreate}
                                    onChange={(e) => handleStatus(t, e.target.value as TaskStatusCategory)}
                                    className="input-field"
                                    style={{
                                        flexShrink: 0, fontSize: 12.5, padding: '5px 8px', borderRadius: 6,
                                        color: t.status_category ? STATUS_COLORS[t.status_category] : undefined, fontWeight: 600,
                                    }}
                                >
                                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                </select>
                                {busyId === t.id && <Loader2 size={14} className="spin" />}
                            </div>
                        );
                    })}
                </div>
            )}

            <Modal
                open={createOpen}
                onClose={() => !creating && setCreateOpen(false)}
                title="File a ticket"
                footer={
                    <>
                        <button className="btn btn-ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleCreate} disabled={creating || cTitle.trim().length < 2}>
                            {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                            <span style={{ marginLeft: 6 }}>File ticket</span>
                        </button>
                    </>
                }
            >
                <FormField label="Summary">
                    <input type="text" value={cTitle} onChange={(e) => setCTitle(e.target.value)}
                        placeholder="Summarise the issue" className="input-field" style={{ width: '100%' }} autoFocus />
                </FormField>
                <FormField label="Description (optional)">
                    <textarea value={cDesc} onChange={(e) => setCDesc(e.target.value)} rows={3} className="input-field" style={{ width: '100%' }} />
                </FormField>
                <FormField label="Priority">
                    <select value={cPriority} onChange={(e) => setCPriority(e.target.value as TaskPriority)} className="input-field" style={{ width: '100%', textTransform: 'capitalize' }}>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </FormField>
                <FormField label="Due date (optional)">
                    <input type="date" value={cDue} onChange={(e) => setCDue(e.target.value)} className="input-field" style={{ width: '100%' }} />
                </FormField>
                <FormField label="Reminder (optional)" hint="The assignee's app schedules a local alarm at this time.">
                    <input type="datetime-local" value={cReminder} onChange={(e) => setCReminder(e.target.value)} className="input-field" style={{ width: '100%' }} />
                </FormField>
                {createErr && <div className="alert alert-error">{createErr}</div>}
            </Modal>
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}
