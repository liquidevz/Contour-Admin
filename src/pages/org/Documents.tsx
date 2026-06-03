/**
 * Org → Documents (Drive)
 *
 * Unified drive of wiki pages + uploaded files (migration 097). Shows storage
 * usage, lets superadmins set the org's total + per-file quota, lets owners set
 * the per-file limit and "clean drive" (purge archived files), and lets members
 * upload / open / archive / delete files. Uploads are quota-enforced server-side.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Upload, Loader2, Trash2, FileText, File as FileIcon, ExternalLink, HardDrive, Sparkles } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import { useAuth } from '../../context/AuthContext';
import {
    driveList, storageUsage, uploadDocumentFile, deleteDocument, documentFileUrl,
    adminSetStorageQuota, setPerFileLimit, cleanDrive, formatBytes,
    type DriveItem, type StorageUsage,
} from '../../lib/workspace';
import { canManageTeams } from '../../lib/org';
import { OrgPageShell } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';
import SearchFilter from '../../components/ui/SearchFilter';
import { CardSkeleton } from '../../components/ui/Skeletons';
import EmptyState from '../../components/ui/EmptyState';

const GB = 1073741824, MB = 1048576;

export default function OrgDocumentsPage() {
    const { scope } = useScope();
    const { role: platformRole } = useAuth();
    const orgId = scope.orgId;
    const isSuperadmin = platformRole === 'superadmin';
    const isOwner = scope.role === 'owner';
    const canManage = canManageTeams(scope.role);
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows] = useState<DriveItem[]>([]);
    const [usage, setUsage] = useState<StorageUsage | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // quota edit inputs (in human units)
    const [totalGb, setTotalGb] = useState('');
    const [perFileMb, setPerFileMb] = useState('');

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const [d, u] = await Promise.all([driveList(orgId, false), storageUsage(orgId)]);
            setRows(d); setUsage(u);
            setTotalGb((u.total_bytes_limit / GB).toFixed(2));
            setPerFileMb((u.per_file_bytes_limit / MB).toFixed(0));
        } catch (e: any) { showToast(e?.message ?? 'Failed to load drive', 'error'); }
        finally { setLoading(false); }
    }, [orgId, showToast]);

    useEffect(() => { void load(); }, [load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((d) => d.title.toLowerCase().includes(q) || (d.folder ?? '').toLowerCase().includes(q));
    }, [rows, search]);

    const pct = usage && usage.total_bytes_limit > 0 ? Math.min(100, (usage.used_bytes / usage.total_bytes_limit) * 100) : 0;
    const near = pct >= 90;

    const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f || !orgId) return;
        setBusy(true);
        try { await uploadDocumentFile({ orgId, file: f }); await load(); showToast(`Uploaded ${f.name}`); }
        catch (err: any) { showToast(err?.message ?? 'Upload failed', 'error'); }
        finally { setBusy(false); }
    };

    const saveQuota = async () => {
        if (!orgId) return;
        setBusy(true);
        try {
            const perFile = Math.round(parseFloat(perFileMb || '0') * MB);
            if (isSuperadmin) {
                const total = Math.round(parseFloat(totalGb || '0') * GB);
                await adminSetStorageQuota(orgId, total, perFile);
            } else {
                await setPerFileLimit(orgId, perFile);
            }
            await load(); showToast('Storage limits updated');
        } catch (e: any) { showToast(e?.message ?? 'Could not update limits', 'error'); }
        finally { setBusy(false); }
    };

    const handleClean = () => {
        confirm({
            title: 'Clean drive?', message: `Permanently delete archived files for this org${usage?.archived_file_count ? ` (${usage.archived_file_count})` : ''} and reclaim their space.`,
            confirmText: 'Clean drive', variant: 'warning',
            onConfirm: async () => {
                try { const r = await cleanDrive(orgId!); await load(); showToast(`Freed ${formatBytes(r.freed_bytes)} (${r.removed} files)`); }
                catch (e: any) { showToast(e?.message ?? 'Could not clean', 'error'); }
            },
        });
    };

    const handleOpen = async (d: DriveItem) => {
        if (!d.file_path) return;
        const url = await documentFileUrl(d.file_path);
        if (url) window.open(url, '_blank', 'noopener');
        else showToast('Could not open file', 'error');
    };

    const handleDelete = (d: DriveItem) => {
        confirm({
            title: `Delete "${d.title}"?`, message: d.kind === 'file' ? 'The file is permanently removed and its space reclaimed.' : 'This page is permanently removed.',
            confirmText: 'Delete', variant: 'danger',
            onConfirm: async () => {
                try { await deleteDocument(d.id); await load(); showToast('Deleted'); }
                catch (e: any) { showToast(e?.message ?? 'Could not delete', 'error'); }
            },
        });
    };

    return (
        <OrgPageShell
            title="Documents"
            subtitle="Workspace drive — pages and files, with storage quotas."
            icon={<FolderOpen size={20} />}
            require="orgMember"
            actions={canManage ? (
                <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={busy}>
                    {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}<span style={{ marginLeft: 6 }}>Upload file</span>
                </button>
            ) : null}
        >
            <input ref={fileRef} type="file" hidden onChange={onPick} />

            {/* Storage panel */}
            <div style={{ background: 'var(--bg-elevated,#14141c)', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <HardDrive size={16} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>Storage</span>
                    {usage && <span style={{ marginLeft: 'auto', fontSize: 13, color: near ? '#EF4444' : 'var(--text-secondary)' }}>
                        {formatBytes(usage.used_bytes)} of {formatBytes(usage.total_bytes_limit)} used
                    </span>}
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-primary,#0a0a0f)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: near ? '#EF4444' : '#6264A7', transition: 'width .3s' }} />
                </div>
                {usage && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                        {usage.file_count} files · {usage.page_count} pages · per-file limit {formatBytes(usage.per_file_bytes_limit)}
                        {usage.archived_file_count > 0 && ` · ${usage.archived_file_count} archived`}
                    </div>
                )}

                {(isSuperadmin || isOwner) && (
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                        {isSuperadmin && (
                            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total (GB)<br />
                                <input type="number" min={0} step={0.5} value={totalGb} onChange={(e) => setTotalGb(e.target.value)} className="input-field" style={{ width: 110, marginTop: 4 }} />
                            </label>
                        )}
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Per file (MB)<br />
                            <input type="number" min={0} step={5} value={perFileMb} onChange={(e) => setPerFileMb(e.target.value)} className="input-field" style={{ width: 110, marginTop: 4 }} />
                        </label>
                        <button className="btn btn-secondary" onClick={saveQuota} disabled={busy}>Save limits</button>
                        {(isOwner || canManage) && (
                            <button className="btn btn-ghost" onClick={handleClean} disabled={busy} title="Purge archived files">
                                <Sparkles size={14} /> <span style={{ marginLeft: 6 }}>Clean drive</span>
                            </button>
                        )}
                        {isSuperadmin && <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>Superadmin sets total; owner sets per-file.</span>}
                    </div>
                )}
            </div>

            <SearchFilter query={search} onQueryChange={setSearch} placeholder="Search documents…"
                rightExtra={<span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{filtered.length} items</span>} />

            {loading ? (
                <div style={{ display: 'grid', gap: 10 }}>{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} lines={2} />)}</div>
            ) : filtered.length === 0 ? (
                <EmptyState icon={FolderOpen} title={rows.length === 0 ? 'Drive is empty' : 'No matches'}
                    body={rows.length === 0 ? (canManage ? 'Upload a file to get started.' : 'Files and pages appear here.') : 'Try a different search.'} />
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    {filtered.map((d) => {
                        const isFile = d.kind === 'file';
                        return (
                            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-elevated,#14141c)', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8, padding: '12px 16px' }}>
                                <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--bg-primary,#0a0a0f)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {isFile ? <FileIcon size={18} style={{ color: '#0EA5E9' }} /> : <FileText size={18} style={{ color: '#6264A7' }} />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary,#e8e8ef)' }}>{d.title}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)', marginTop: 2 }}>
                                        {isFile ? `${formatBytes(d.size_bytes)} · ${d.mime_type ?? 'file'}` : 'Page'}
                                        {d.folder && ` · ${d.folder}`}
                                        {` · edited ${new Date(d.last_edited_at).toLocaleDateString()}`}
                                    </div>
                                </div>
                                {isFile && d.file_path && (
                                    <button className="btn btn-ghost" onClick={() => handleOpen(d)} title="Open" style={{ padding: 6 }}><ExternalLink size={15} /></button>
                                )}
                                {canManage && (
                                    <button className="btn btn-ghost" onClick={() => handleDelete(d)} title="Delete" style={{ padding: 6 }}><Trash2 size={15} /></button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}
