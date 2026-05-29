/**
 * Org → Teams
 *
 * List + create + archive teams. Team detail (members, edit) is a
 * separate page at /org/teams/:id.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Plus, Archive, Loader2 } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import { canManageTeams, teamArchive, teamCreate, teamList, type TeamRow } from '../../lib/org';
import { OrgPageShell } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';

export default function OrgTeamsPage() {
    const navigate = useNavigate();
    const { scope } = useScope();
    const orgId = scope.orgId;
    const canManage = canManageTeams(scope.role);
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows] = useState<TeamRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [createErr, setCreateErr] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!orgId) { setRows([]); setLoading(false); return; }
        setLoading(true); setError(null);
        try {
            const list = await teamList(orgId);
            setRows(list);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load teams');
        } finally { setLoading(false); }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    const handleCreate = async () => {
        if (!orgId || name.trim().length < 2) return;
        setCreating(true); setCreateErr(null);
        try {
            const id = await teamCreate({ orgId, name: name.trim() });
            setShowCreate(false); setName('');
            await load();
            navigate(`/org/teams/${id}`);
        } catch (e: any) {
            setCreateErr(e?.message ?? 'Could not create team');
        } finally { setCreating(false); }
    };

    const handleArchive = (r: TeamRow) => {
        confirm({
            title: `Archive "${r.name}"?`,
            message: 'Members keep org access but lose team grouping.',
            confirmText: 'Archive', variant: 'warning',
            onConfirm: async () => {
                setBusyId(r.id);
                try { await teamArchive(r.id, true); await load(); showToast(`"${r.name}" archived`); }
                catch (e: any) { showToast(e?.message ?? 'Could not archive', 'error'); }
                finally { setBusyId(null); }
            },
        });
    };

    const handleUnarchive = async (r: TeamRow) => {
        setBusyId(r.id);
        try { await teamArchive(r.id, false); await load(); showToast(`"${r.name}" unarchived`); }
        catch (e: any) { showToast(e?.message ?? 'Could not unarchive', 'error'); }
        finally { setBusyId(null); }
    };

    return (
        <OrgPageShell
            title="Teams"
            subtitle="Group members into departments, squads, or project teams."
            icon={<Briefcase size={20} />}
            require="managerTier"
            actions={canManage ? (
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    <Plus size={16} /> <span>New team</span>
                </button>
            ) : null}
        >
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {showCreate && (
                <div style={{ border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8, padding: 16, marginBottom: 20, background: 'var(--bg-elevated,#14141c)' }}>
                    <h3 style={{ marginTop: 0, fontSize: 14, fontWeight: 600 }}>Create team</h3>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Engineering, Sales — APAC"
                            className="input-field"
                            style={{ flex: '1 1 280px' }}
                            autoFocus
                        />
                        <button className="btn btn-primary" onClick={handleCreate} disabled={creating || name.trim().length < 2}>
                            {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                            <span style={{ marginLeft: 6 }}>Create</span>
                        </button>
                        <button className="btn btn-ghost" onClick={() => { setShowCreate(false); setCreateErr(null); }}>Cancel</button>
                    </div>
                    {createErr && <div className="alert alert-error" style={{ marginTop: 10 }}>{createErr}</div>}
                </div>
            )}

            {loading ? (
                <div style={{ padding: 24, color: 'var(--text-muted,#8a8a96)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Loader2 size={14} className="spin" /> Loading teams…
                </div>
            ) : rows.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted,#8a8a96)' }}>
                    No teams yet. {canManage && 'Click "New team" to create one.'}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {rows.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => navigate(`/org/teams/${t.id}`)}
                            style={{
                                textAlign: 'left',
                                background: 'var(--bg-elevated,#14141c)',
                                border: '1px solid var(--border-subtle,#2a2a35)',
                                borderRadius: 8,
                                padding: 16,
                                cursor: 'pointer',
                                opacity: t.archived_at ? 0.6 : 1,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)', marginTop: 2 }}>
                                        {t.member_count} member{t.member_count === 1 ? '' : 's'}
                                        {t.archived_at && ' · archived'}
                                    </div>
                                </div>
                                {canManage && (
                                    <span
                                        role="button"
                                        aria-label={t.archived_at ? 'Unarchive' : 'Archive'}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (t.archived_at) handleUnarchive(t);
                                            else handleArchive(t);
                                        }}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: 28, height: 28, borderRadius: 6,
                                            color: 'var(--text-muted,#8a8a96)', cursor: 'pointer',
                                        }}
                                        title={t.archived_at ? 'Unarchive' : 'Archive'}
                                    >
                                        {busyId === t.id ? <Loader2 size={14} className="spin" /> : <Archive size={14} />}
                                    </span>
                                )}
                            </div>
                            {t.description && (
                                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary,#b0b0bc)' }}>
                                    {t.description}
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}
            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}
