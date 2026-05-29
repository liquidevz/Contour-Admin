/**
 * Org → Team detail
 *
 * Edit team name/description, add/remove members. Pulled via team_get RPC.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Briefcase, Trash2, UserPlus, Save, ArrowLeft, Loader2 } from 'lucide-react';
import Page from '../../components/ui/Page';
import { useScope } from '../../context/ScopeContext';
import {
    teamGet, teamUpdate, teamAddMember, teamRemoveMember,
    orgListMembers, canManageTeams,
    type TeamDetail, type OrgMemberRow,
} from '../../lib/org';
import { Avatar } from '../../components/org';
import { useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';

export default function OrgTeamDetailPage() {
    const { id: teamId } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { scope } = useScope();
    const canManage = canManageTeams(scope.role);
    const { toast, show: showToast } = useOrgToast();

    const [detail, setDetail] = useState<TeamDetail | null>(null);
    const [orgMembers, setOrgMembers] = useState<OrgMemberRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    const [busyUid, setBusyUid] = useState<string | null>(null);
    const [addUserId, setAddUserId] = useState('');

    const load = useCallback(async () => {
        if (!teamId) return;
        setLoading(true); setError(null);
        try {
            const d = await teamGet(teamId);
            setDetail(d);
            setName(d.team.name);
            setDescription(d.team.description ?? '');
            if (scope.orgId) {
                const all = await orgListMembers(scope.orgId);
                setOrgMembers(all);
            }
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load team');
        } finally { setLoading(false); }
    }, [teamId, scope.orgId]);

    useEffect(() => { void load(); }, [load]);

    const memberSet = useMemo(() => new Set(detail?.members.map((m) => m.user_id) ?? []), [detail]);
    const addable = useMemo(
        () => orgMembers.filter((m) => m.status === 'active' && !memberSet.has(m.user_id)),
        [orgMembers, memberSet],
    );

    const handleSave = async () => {
        if (!teamId) return;
        setSaving(true);
        try {
            await teamUpdate({ teamId, name, description });
            await load();
            showToast('Team updated');
        } catch (e: any) {
            showToast(e?.message ?? 'Could not save', 'error');
        } finally { setSaving(false); }
    };

    const handleRemove = async (uid: string) => {
        if (!teamId) return;
        setBusyUid(uid);
        try { await teamRemoveMember(teamId, uid); await load(); showToast('Member removed'); }
        catch (e: any) { showToast(e?.message ?? 'Could not remove', 'error'); }
        finally { setBusyUid(null); }
    };

    const handleAdd = async () => {
        if (!teamId || !addUserId) return;
        setBusyUid(addUserId);
        try {
            await teamAddMember({ teamId, userId: addUserId });
            setAddUserId('');
            await load();
            showToast('Member added');
        } catch (e: any) {
            showToast(e?.message ?? 'Could not add', 'error');
        } finally { setBusyUid(null); }
    };

    if (loading) {
        return <Page title="Team"><div style={{ padding: 24, display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-muted,#8a8a96)' }}><Loader2 size={14} className="spin" /> Loading…</div></Page>;
    }
    if (error || !detail) {
        return <Page title="Team"><div className="alert alert-error">{error ?? 'Team not found'}</div></Page>;
    }

    return (
        <Page
            title={detail.team.name}
            subtitle="Manage this team's name, description, and members."
            icon={<Briefcase size={20} />}
            crumbs={[{ label: 'Teams', to: '/org/teams' }, { label: detail.team.name }]}
            actions={
                <button className="btn btn-ghost" onClick={() => navigate('/org/teams')}>
                    <ArrowLeft size={14} /> <span style={{ marginLeft: 4 }}>Back</span>
                </button>
            }
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* ── Team details ─────────────────────────────── */}
                <section style={panel}>
                    <h3 style={panelTitle}>Details</h3>
                    <label style={label}>Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        disabled={!canManage}
                        style={{ width: '100%', marginBottom: 12 }}
                    />
                    <label style={label}>Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="input-field"
                        disabled={!canManage}
                        rows={3}
                        style={{ width: '100%', marginBottom: 12 }}
                    />
                    {canManage && (
                        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                            <span style={{ marginLeft: 6 }}>Save</span>
                        </button>
                    )}
                </section>

                {/* ── Members ─────────────────────────────────── */}
                <section style={panel}>
                    <h3 style={panelTitle}>Members ({detail.members.length})</h3>

                    {canManage && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <select
                                value={addUserId}
                                onChange={(e) => setAddUserId(e.target.value)}
                                className="input-field"
                                style={{ flex: 1 }}
                            >
                                <option value="">Add a member…</option>
                                {addable.map((m) => (
                                    <option key={m.user_id} value={m.user_id}>
                                        {m.display_name ?? m.email ?? m.user_id}
                                    </option>
                                ))}
                            </select>
                            <button className="btn btn-primary" onClick={handleAdd} disabled={!addUserId || busyUid === addUserId}>
                                {busyUid === addUserId ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />}
                            </button>
                        </div>
                    )}

                    <div style={{ border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8 }}>
                        {detail.members.length === 0 ? (
                            <div style={{ padding: 16, color: 'var(--text-muted,#8a8a96)', fontSize: 13 }}>No members yet.</div>
                        ) : detail.members.map((m) => (
                            <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle,#2a2a35)' }}>
                                <Avatar name={m.display_name} email={m.email} url={m.avatar_url} size={28} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500 }}>{m.display_name ?? '—'}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)' }}>{m.email ?? '—'} · {m.role}</div>
                                </div>
                                {canManage && (
                                    <button className="btn btn-ghost btn-sm" onClick={() => handleRemove(m.user_id)} disabled={busyUid === m.user_id} title="Remove">
                                        {busyUid === m.user_id ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
            <OrgToastBanner toast={toast} />
        </Page>
    );
}

const panel: React.CSSProperties = {
    background: 'var(--bg-elevated,#14141c)',
    border: '1px solid var(--border-subtle,#2a2a35)',
    borderRadius: 8,
    padding: 16,
};
const panelTitle: React.CSSProperties = { margin: 0, marginBottom: 12, fontSize: 14, fontWeight: 600 };
const label: React.CSSProperties = {
    display: 'block', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
    color: 'var(--text-muted,#8a8a96)', marginBottom: 4,
};
