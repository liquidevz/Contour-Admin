/**
 * Org → Member detail (/org/members/:userId)
 *
 * Profile + role/status edit + teams + recent activity for one member.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    User as UserIcon, ArrowLeft, Loader2, Save, Trash2, Crown, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useScope } from '../../context/ScopeContext';
import {
    orgListMembers, orgUpdateMember, orgRemoveMember, orgTransferOwnership,
    canManageMembers, memberHistory,
    type OrgMemberRow, type OrgRole, type MemberHistoryRow,
} from '../../lib/org';
import { OrgPageShell, Avatar, RoleBadge, MemberStatusBadge } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';
import FileUpload from '../../components/ui/FileUpload';
import ConfirmModal from '../../components/ui/ConfirmModal';

const ROLES: OrgRole[] = ['owner', 'admin', 'manager', 'member', 'guest'];

interface TeamRow { id: string; name: string; slug: string; role: string }
interface ActivityRow { id: string; action: string; created_at: string }

export default function OrgMemberDetailPage() {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const { scope } = useScope();
    const orgId = scope.orgId;
    const myRole = scope.role;
    const canManage = canManageMembers(myRole);
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [member, setMember] = useState<OrgMemberRow | null>(null);
    const [teams, setTeams] = useState<TeamRow[]>([]);
    const [activity, setActivity] = useState<ActivityRow[]>([]);
    const [history, setHistory] = useState<MemberHistoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [role, setRole] = useState<OrgRole>('member');
    const [status, setStatus] = useState<OrgMemberRow['status']>('active');
    const [jobTitle, setJobTitle] = useState('');
    const [department, setDepartment] = useState('');
    const [saving, setSaving] = useState(false);

    // Role-escalation confirmation. Escalating to admin or owner is a
    // privileged change that warrants an explicit confirm step.
    const [escalateConfirm, setEscalateConfirm] = useState<OrgRole | null>(null);
    const [escalateBusy, setEscalateBusy] = useState(false);

    const load = useCallback(async () => {
        if (!orgId || !userId) return;
        setLoading(true); setError(null);
        try {
            // 1. member row (via the org-list RPC, which already returns the joined profile)
            const all = await orgListMembers(orgId);
            const m = all.find((x) => x.user_id === userId);
            if (!m) throw new Error('Member not found');
            setMember(m);
            setRole(m.role); setStatus(m.status);
            setJobTitle(m.job_title ?? ''); setDepartment(m.department ?? '');

            // 2. teams the member is on
            const { data: tm } = await supabase
                .from('team_members')
                .select('role, teams(id, name, slug, org_id)')
                .eq('user_id', userId);
            const memberTeams: TeamRow[] = (tm ?? [])
                .filter((t: any) => t.teams?.org_id === orgId)
                .map((t: any) => ({ id: t.teams.id, name: t.teams.name, slug: t.teams.slug, role: t.role }));
            setTeams(memberTeams);

            // 3. recent activity (audit + events filtered to this member)
            const { data: audit } = await supabase
                .from('organization_audit_log')
                .select('id, action, created_at, after')
                .eq('org_id', orgId)
                .eq('actor_user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);
            setActivity((audit ?? []) as ActivityRow[]);

            // 4. role/status history — best-effort; the RPC requires migration 080.
            try {
                const h = await memberHistory({ orgId, userId, limit: 20 });
                setHistory(h);
            } catch { /* silent — older DBs without 080 won't have this RPC */ }
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load member');
        } finally { setLoading(false); }
    }, [orgId, userId]);

    useEffect(() => { void load(); }, [load]);

    const handleSave = async () => {
        if (!orgId || !userId) return;
        // Escalation to admin/owner needs a separate explicit confirm.
        const escalating =
            role !== member?.role &&
            (role === 'admin' || role === 'owner') &&
            (member?.role === 'member' || member?.role === 'guest' || member?.role === 'manager');
        if (escalating) {
            setEscalateConfirm(role);
            return;
        }
        await commitSave();
    };

    const commitSave = async () => {
        if (!orgId || !userId) return;
        setSaving(true); setEscalateBusy(true);
        try {
            await orgUpdateMember({
                orgId, userId,
                role: role !== member?.role ? role : undefined,
                status: status !== member?.status ? status : undefined,
                jobTitle: jobTitle !== (member?.job_title ?? '') ? jobTitle : undefined,
                department: department !== (member?.department ?? '') ? department : undefined,
            });
            await load();
            showToast('Member updated');
            setEscalateConfirm(null);
        } catch (e: any) {
            showToast(e?.message ?? 'Could not save', 'error');
        } finally { setSaving(false); setEscalateBusy(false); }
    };

    const handleAvatarUploaded = async (publicUrl: string) => {
        if (!userId) return;
        try {
            await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
            await load();
        } catch (e: any) {
            showToast(e?.message ?? 'Could not save avatar', 'error');
        }
    };

    const handleRemove = () => {
        if (!orgId || !userId || !member) return;
        confirm({
            title: `Remove ${member.display_name ?? member.email ?? 'this member'}?`,
            message: 'They will lose access to this workspace immediately.',
            confirmText: 'Remove', variant: 'danger',
            onConfirm: async () => {
                try { await orgRemoveMember(orgId, userId); navigate('/org/members'); }
                catch (e: any) { showToast(e?.message ?? 'Could not remove', 'error'); }
            },
        });
    };

    const handleTransfer = () => {
        if (!orgId || !userId || !member) return;
        confirm({
            title: `Transfer ownership to ${member.display_name ?? member.email}?`,
            message: 'You will become an admin. This cannot be undone without the new owner.',
            confirmText: 'Transfer', variant: 'warning',
            onConfirm: async () => {
                try { await orgTransferOwnership(orgId, userId); await load(); showToast('Ownership transferred'); }
                catch (e: any) { showToast(e?.message ?? 'Could not transfer', 'error'); }
            },
        });
    };

    if (loading) {
        return (
            <OrgPageShell title="Member" icon={<UserIcon size={20} />}>
                <div style={{ padding: 24, color: 'var(--text-muted,#8a8a96)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Loader2 size={14} className="spin" /> Loading…
                </div>
            </OrgPageShell>
        );
    }
    if (error || !member) {
        return (
            <OrgPageShell title="Member" icon={<UserIcon size={20} />}>
                <div className="alert alert-error">{error ?? 'Member not found'}</div>
            </OrgPageShell>
        );
    }

    const isOwner = myRole === 'owner';
    const memberIsOwner = member.role === 'owner';

    return (
        <OrgPageShell
            title={member.display_name ?? member.email ?? 'Member'}
            subtitle={member.email ?? undefined}
            icon={<UserIcon size={20} />}
            crumbs={[{ label: 'Members', to: '/org/members' }, { label: member.display_name ?? 'Member' }]}
            actions={
                <button className="btn btn-ghost" onClick={() => navigate('/org/members')}>
                    <ArrowLeft size={14} /> <span style={{ marginLeft: 4 }}>Back</span>
                </button>
            }
        >
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
                {/* LEFT: identity + edit */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <section style={panel}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            {canManage ? (
                                <FileUpload
                                    folder={`${orgId}/avatars/${userId}`}
                                    variant="avatar"
                                    currentUrl={member.avatar_url}
                                    onUploaded={handleAvatarUploaded}
                                />
                            ) : (
                                <Avatar name={member.display_name} email={member.email} url={member.avatar_url} size={56} />
                            )}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 16, fontWeight: 600 }}>{member.display_name ?? '—'}</div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted,#8a8a96)' }}>{member.email ?? '—'}</div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                    <RoleBadge role={member.role} />
                                    <MemberStatusBadge status={member.status} />
                                </div>
                                {member.last_active_at && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                        Last active {new Date(member.last_active_at).toLocaleString()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {canManage && (
                        <section style={panel}>
                            <h3 style={panelTitle}>Edit</h3>
                            <div style={grid2}>
                                <Field label="Role">
                                    <select value={role} onChange={(e) => setRole(e.target.value as OrgRole)}
                                        disabled={memberIsOwner && !isOwner}
                                        className="input-field" style={{ width: '100%' }}>
                                        {ROLES.filter((x) => x !== 'owner' || isOwner).map((r) => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Status">
                                    <select value={status} onChange={(e) => setStatus(e.target.value as any)}
                                        className="input-field" style={{ width: '100%' }}>
                                        <option value="active">active</option>
                                        <option value="invited">invited</option>
                                        <option value="suspended">suspended</option>
                                        <option value="left">left</option>
                                    </select>
                                </Field>
                                <Field label="Job title">
                                    <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
                                        className="input-field" style={{ width: '100%' }} />
                                </Field>
                                <Field label="Department">
                                    <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)}
                                        className="input-field" style={{ width: '100%' }} />
                                </Field>
                            </div>
                            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                    {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                                    <span style={{ marginLeft: 6 }}>Save changes</span>
                                </button>
                                {isOwner && !memberIsOwner && (
                                    <button className="btn btn-ghost" onClick={handleTransfer}>
                                        <Crown size={14} /> <span style={{ marginLeft: 6 }}>Transfer ownership</span>
                                    </button>
                                )}
                                {!memberIsOwner && (
                                    <button className="btn btn-ghost" style={{ color: '#ef4444', marginLeft: 'auto' }} onClick={handleRemove}>
                                        <Trash2 size={14} /> <span style={{ marginLeft: 6 }}>Remove member</span>
                                    </button>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Status & role history (from member_status_history via 080) */}
                    {history.length > 0 && (
                        <section style={panel}>
                            <h3 style={panelTitle}>Role &amp; status history</h3>
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {history.map((h) => {
                                    const roleChanged   = h.old_role   !== null && h.old_role   !== h.new_role;
                                    const statusChanged = h.old_status !== null && h.old_status !== h.new_status;
                                    const summary =
                                        h.old_role === null
                                            ? `Joined as ${h.new_role} (${h.new_status})`
                                            : [
                                                  roleChanged   ? `role ${h.old_role} → ${h.new_role}` : null,
                                                  statusChanged ? `status ${h.old_status} → ${h.new_status}` : null,
                                              ].filter(Boolean).join(' · ');
                                    return (
                                        <li key={h.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-subtle,#2a2a35)', fontSize: 12 }}>
                                            <div style={{ color: 'var(--text-secondary,#b0b0bc)' }}>{summary}</div>
                                            <div style={{ marginTop: 2, color: 'var(--text-muted,#8a8a96)', fontSize: 11 }}>
                                                {h.changed_by_name ?? (h.changed_by ? h.changed_by.slice(0, 8) + '…' : 'system')}
                                                {' · '}
                                                {new Date(h.created_at).toLocaleString()}
                                                {h.reason && ` · ${h.reason}`}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}

                    {/* Activity */}
                    <section style={panel}>
                        <h3 style={panelTitle}>Recent activity</h3>
                        {activity.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>No recorded activity yet.</div>
                        ) : (
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                {activity.map((a) => (
                                    <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle,#2a2a35)', fontSize: 12 }}>
                                        <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary,#b0b0bc)' }}>{a.action}</span>
                                        <span style={{ marginLeft: 8, color: 'var(--text-muted,#8a8a96)' }}>
                                            {new Date(a.created_at).toLocaleString()}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>

                {/* RIGHT: teams */}
                <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <section style={panel}>
                        <h3 style={panelTitle}>Teams</h3>
                        {teams.length === 0
                            ? <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>Not in any team.</div>
                            : teams.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => navigate(`/org/teams/${t.id}`)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        width: '100%', textAlign: 'left',
                                        padding: '8px 0', background: 'transparent',
                                        border: 'none', borderBottom: '1px solid var(--border-subtle,#2a2a35)',
                                        cursor: 'pointer', color: 'inherit',
                                    }}
                                >
                                    <div style={{ flex: 1, fontSize: 13 }}>{t.name}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted,#8a8a96)' }}>{t.role}</div>
                                </button>
                            ))
                        }
                    </section>
                </aside>
            </div>

            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />

            <ConfirmModal
                open={escalateConfirm !== null}
                onClose={() => !escalateBusy && setEscalateConfirm(null)}
                onConfirm={commitSave}
                title={`Promote to ${escalateConfirm ?? ''}?`}
                body={
                    <div>
                        <p style={{ margin: 0 }}>
                            You're escalating <strong>{member.display_name ?? member.email}</strong> from{' '}
                            <code>{member.role}</code> to <code>{escalateConfirm}</code>.
                        </p>
                        {escalateConfirm === 'owner' && (
                            <p style={{ marginTop: 8, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertTriangle size={14} /> This grants full control of the workspace.
                            </p>
                        )}
                    </div>
                }
                consequences={
                    escalateConfirm === 'admin'
                        ? ['Grants member management', 'Grants billing & domain mgmt', 'Visible in audit log']
                        : escalateConfirm === 'owner'
                          ? ['Grants ALL permissions including delete', 'Cannot be removed without another owner', 'Visible in audit log']
                          : undefined
                }
                severity={escalateConfirm === 'owner' ? 'high' : 'medium'}
                confirmLabel={`Promote to ${escalateConfirm ?? ''}`}
                busy={escalateBusy}
                typedConfirm={escalateConfirm === 'owner' ? (member.email ?? undefined) : undefined}
                typedConfirmPrompt={
                    escalateConfirm === 'owner'
                        ? <span>Type <code>{member.email}</code> to promote to owner</span>
                        : undefined
                }
            />
        </OrgPageShell>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)', marginBottom: 4 }}>{label}</label>
            {children}
        </div>
    );
}

const panel: React.CSSProperties = {
    background: 'var(--bg-elevated,#14141c)',
    border: '1px solid var(--border-subtle,#2a2a35)',
    borderRadius: 8, padding: 16,
};
const panelTitle: React.CSSProperties = { margin: 0, marginBottom: 12, fontSize: 14, fontWeight: 600 };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
