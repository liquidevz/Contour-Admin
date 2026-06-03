/**
 * Org → Announcements
 *
 * Post and manage workspace announcements. Backed by the announcement_*
 * RPCs (migrations 088/089). Members see these in the app; admins/managers
 * post and remove them here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, Loader2, Trash2, Pin } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    announcementList, announcementCreate, announcementDelete,
    type AnnouncementRow, type AnnouncementCategory,
} from '../../lib/workspace';
import { canManageTeams } from '../../lib/org';
import { OrgPageShell, Modal, FormField } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';
import SearchFilter from '../../components/ui/SearchFilter';
import { CardSkeleton } from '../../components/ui/Skeletons';
import EmptyState from '../../components/ui/EmptyState';

const CATEGORIES: AnnouncementCategory[] = ['general', 'policy', 'event', 'alert', 'milestone'];
const CAT_COLOR: Record<AnnouncementCategory, string> = {
    general: '#6366F1', policy: '#0891B2', event: '#22C55E', alert: '#EF4444', milestone: '#F59E0B',
};

export default function OrgAnnouncementsPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;
    const canManage = canManageTeams(scope.role);
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows] = useState<AnnouncementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const [createOpen, setCreateOpen] = useState(false);
    const [cTitle, setCTitle] = useState('');
    const [cBody, setCBody] = useState('');
    const [cCat, setCCat] = useState<AnnouncementCategory>('general');
    const [cPinned, setCPinned] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true); setError(null);
        try { setRows(await announcementList(orgId)); }
        catch (e: any) { setError(e?.message ?? 'Failed to load announcements'); }
        finally { setLoading(false); }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((a) => [a.title, a.body].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
    }, [rows, search]);

    const handleCreate = async () => {
        if (!orgId || cTitle.trim().length < 2) return;
        setCreating(true); setCreateErr(null);
        try {
            await announcementCreate({ orgId, title: cTitle.trim(), body: cBody.trim(), category: cCat, pinned: cPinned });
            setCreateOpen(false); setCTitle(''); setCBody(''); setCCat('general'); setCPinned(false);
            await load(); showToast('Announcement posted');
        } catch (e: any) { setCreateErr(e?.message ?? 'Could not post'); }
        finally { setCreating(false); }
    };

    const handleDelete = (a: AnnouncementRow) => {
        confirm({
            title: `Delete "${a.title}"?`, message: 'This removes it for everyone in the workspace.',
            confirmText: 'Delete', variant: 'danger',
            onConfirm: async () => {
                try { await announcementDelete(a.id); await load(); showToast('Announcement deleted'); }
                catch (e: any) { showToast(e?.message ?? 'Could not delete', 'error'); }
            },
        });
    };

    return (
        <OrgPageShell
            title="Announcements"
            subtitle="Broadcast updates, policies and milestones to the whole workspace."
            icon={<Megaphone size={20} />}
            require="managerTier"
            actions={canManage ? (
                <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                    <Plus size={14} /> <span style={{ marginLeft: 6 }}>New announcement</span>
                </button>
            ) : null}
        >
            <SearchFilter query={search} onQueryChange={setSearch} placeholder="Search announcements…"
                rightExtra={<span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{filtered.length} of {rows.length}</span>} />

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
            {loading ? (
                <div style={{ display: 'grid', gap: 10 }}>{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} lines={3} />)}</div>
            ) : filtered.length === 0 ? (
                <EmptyState icon={Megaphone} title={rows.length === 0 ? 'No announcements yet' : 'No matches'}
                    body={rows.length === 0 ? (canManage ? 'Post the first announcement.' : 'Announcements will appear here.') : 'Try a different search.'}
                    action={rows.length === 0 && canManage ? <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> New announcement</button> : null} />
            ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                    {filtered.map((a) => (
                        <div key={a.id} style={{ background: 'var(--bg-elevated,#14141c)', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8, padding: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, background: CAT_COLOR[a.category], flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {a.pinned && <Pin size={13} style={{ color: 'var(--text-muted)' }} />}
                                        <span style={{ fontSize: 15, fontWeight: 600 }}>{a.title}</span>
                                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: CAT_COLOR[a.category], border: `1px solid ${CAT_COLOR[a.category]}55`, borderRadius: 5, padding: '1px 6px' }}>{a.category}</span>
                                    </div>
                                    {a.body && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-secondary,#b0b0bc)', whiteSpace: 'pre-wrap' }}>{a.body}</div>}
                                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>
                                        {a.author_name ? `${a.author_name} · ` : ''}{new Date(a.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                {canManage && (
                                    <button className="btn btn-ghost" onClick={() => handleDelete(a)} title="Delete" style={{ padding: 6 }}>
                                        <Trash2 size={15} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={createOpen} onClose={() => !creating && setCreateOpen(false)} title="New announcement"
                footer={<>
                    <button className="btn btn-ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleCreate} disabled={creating || cTitle.trim().length < 2}>
                        {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}<span style={{ marginLeft: 6 }}>Post</span>
                    </button>
                </>}>
                <FormField label="Title"><input type="text" value={cTitle} onChange={(e) => setCTitle(e.target.value)} className="input-field" style={{ width: '100%' }} autoFocus /></FormField>
                <FormField label="Message"><textarea value={cBody} onChange={(e) => setCBody(e.target.value)} rows={4} className="input-field" style={{ width: '100%' }} /></FormField>
                <FormField label="Category">
                    <select value={cCat} onChange={(e) => setCCat(e.target.value as AnnouncementCategory)} className="input-field" style={{ width: '100%', textTransform: 'capitalize' }}>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </FormField>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={cPinned} onChange={(e) => setCPinned(e.target.checked)} /> Pin to top
                </label>
                {createErr && <div className="alert alert-error">{createErr}</div>}
            </Modal>
            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}
