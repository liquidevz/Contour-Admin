/**
 * Org → Invitations
 *
 * Send new invites + view/revoke/resend pending ones. Calls
 * org_invite_member / org_revoke_invite / org_resend_invite RPCs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Send, RotateCcw, X, Copy, Loader2, Check, UsersRound, KeyRound, Link as LinkIcon, Eye } from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    orgInviteMember, orgInviteMemberPhone,
    orgRevokeInvite, orgResendInvite, orgListInvites,
    orgBulkInvite, orgAuditList, orgCreateShareLink,
    type OrgInviteRow, type OrgRole, type AuditRow,
} from '../../lib/org';
import { edgeInvoke } from '../../lib/edgeInvoke';
import {
    OrgPageShell, Modal, FormField, CredentialsHandoffModal,
    type CredentialsHandoff,
} from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';

const ROLES: OrgRole[] = ['admin', 'manager', 'member', 'guest'];

export default function OrgInvitesPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows] = useState<OrgInviteRow[]>([]);
    const [provisioned, setProvisioned] = useState<AuditRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Compose state. Two send modes:
    //   'provision' (default) — calls provision-business-user edge function:
    //     creates auth.users with a temp password, force_password_change=true,
    //     emails credentials, and shows the temp password once in the
    //     CredentialsHandoffModal for backup handoff. Aligns with the
    //     admin-driven business onboarding model.
    //   'magic_link' — legacy path: creates a token-based invite the recipient
    //     accepts via a deep link. Kept for cases where the customer prefers
    //     to set their own password from the start.
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    // Channel: 'email' is the default for all three send modes; 'phone' is
    // only valid for magic_link (provision still requires email since the
    // auth-user creation needs one).
    const [channel, setChannel] = useState<'email' | 'phone'>('email');
    const [fullName, setFullName] = useState('');
    const [role, setRole] = useState<OrgRole>('member');
    const [sendMode, setSendMode] = useState<'provision' | 'magic_link'>('provision');
    const [sending, setSending] = useState(false);
    const [composeMsg, setComposeMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [credsHandoff, setCredsHandoff] = useState<CredentialsHandoff | null>(null);

    // Bulk-invite modal state
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkRole, setBulkRole] = useState<OrgRole>('member');
    const [bulkSending, setBulkSending] = useState(false);
    const [bulkResults, setBulkResults] = useState<Array<{ email: string; ok: boolean; error?: string }> | null>(null);

    const load = useCallback(async () => {
        if (!orgId) { setRows([]); setProvisioned([]); setLoading(false); return; }
        setLoading(true); setError(null);
        try {
            // Two parallel fetches:
            //   1. magic-link invites table (legacy + bulk path)
            //   2. audit log entries for action='member.provisioned' — these are
            //      members the edge function added directly (no invite row).
            //      We surface them on this page so admins can see "what I just
            //      did" without bouncing to /org/members.
            const [list, audit] = await Promise.all([
                orgListInvites(orgId),
                orgAuditList({ orgId, action: 'member.provisioned', limit: 20 })
                    .catch(() => [] as AuditRow[]),   // audit RPC optional — don't block invites
            ]);
            setRows(list);
            setProvisioned(audit);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load invites');
        } finally { setLoading(false); }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    // 'pending' now includes the new 'opened' state — that's still in-flight,
    // just additionally informative that the recipient clicked through.
    const pending = useMemo(() => rows.filter((r) => r.status === 'pending' || r.status === 'opened'), [rows]);
    const past    = useMemo(() => rows.filter((r) => r.status !== 'pending' && r.status !== 'opened'), [rows]);

    const handleSend = async () => {
        if (!orgId) return;
        // Provision always requires email — auth.users.email is the unique key.
        // magic_link/phone path routes to the dedicated phone RPC.
        if (sendMode === 'provision' && !email.includes('@')) return;
        if (sendMode === 'magic_link' && channel === 'phone' && phone.replace(/[^0-9+]/g, '').length < 8) return;
        if (sendMode === 'magic_link' && channel === 'email' && !email.includes('@')) return;

        setSending(true); setComposeMsg(null);
        try {
            // Phone-channel magic-link path.
            if (sendMode === 'magic_link' && channel === 'phone') {
                const res = await orgInviteMemberPhone({ orgId, phone: phone.trim(), role });
                setComposeMsg({ kind: 'ok', text: `Invite created for ${res.phone}. Copy the link from the table to share.` });
                setPhone('');
                await load();
                return;
            }

            if (sendMode === 'provision') {
                const data = await edgeInvoke<{
                    ok: boolean;
                    user_id: string;
                    org_id: string;
                    temp_password: string | null;
                    was_existing: boolean;
                }>(
                    'provision-business-user',
                    {
                        action:    'add_member',
                        org_id:    orgId,
                        email:     email.trim().toLowerCase(),
                        full_name: fullName.trim() || null,
                        role,
                    },
                );

                const orgName    = scope.membership?.org_name ?? 'this workspace';
                const cleanEmail = email.trim().toLowerCase();

                if (data.was_existing) {
                    // Existing Contour user — no creds modal, no temp password.
                    // We sent them a "you've been added" email and that's it.
                    setComposeMsg({
                        kind: 'ok',
                        text: `${cleanEmail} already had a Contour account — added them to ${orgName} as ${role}. They were emailed a notice.`,
                    });
                } else if (data.temp_password) {
                    // New user — surface the temp password for handoff.
                    setCredsHandoff({
                        org_name:      orgName,
                        email:         cleanEmail,
                        temp_password: data.temp_password,
                    });
                    setComposeMsg({
                        kind: 'ok',
                        text: `Provisioned ${cleanEmail}. Credentials shown — copy now if needed.`,
                    });
                } else {
                    setComposeMsg({ kind: 'ok', text: `Added ${cleanEmail} to ${orgName}.` });
                }
            } else {
                const res = await orgInviteMember({ orgId, email: email.trim(), role });
                setComposeMsg({ kind: 'ok', text: `Invite sent to ${res.email}. Copy the link from the table to share.` });
            }
            setEmail('');
            setFullName('');
            await load();
        } catch (e: any) {
            setComposeMsg({ kind: 'err', text: e?.message ?? 'Could not send invite' });
        } finally { setSending(false); }
    };

    const handleRevoke = (r: OrgInviteRow) => {
        confirm({
            title: `Revoke invite to ${r.email}?`,
            message: 'The invite link will stop working immediately.',
            confirmText: 'Revoke', variant: 'danger',
            onConfirm: async () => {
                setBusyId(r.id);
                try { await orgRevokeInvite(r.id); await load(); showToast('Invite revoked'); }
                catch (e: any) { showToast(e?.message ?? 'Could not revoke', 'error'); }
                finally { setBusyId(null); }
            },
        });
    };

    const handleResend = async (r: OrgInviteRow) => {
        setBusyId(r.id);
        try { await orgResendInvite(r.id); await load(); showToast('Invite resent'); }
        catch (e: any) { showToast(e?.message ?? 'Could not resend', 'error'); }
        finally { setBusyId(null); }
    };

    const copyLink = async (r: OrgInviteRow) => {
        // Deep link the mobile app accepts. Web link can be added later.
        const link = `contour://org/invite/${r.token}`;
        try {
            await navigator.clipboard.writeText(link);
            setCopiedId(r.id);
            setTimeout(() => setCopiedId((cur) => (cur === r.id ? null : cur)), 1500);
        } catch { /* ok */ }
    };

    const handleBulk = async () => {
        if (!orgId) return;
        const emails = bulkText
            .split(/[\s,;]+/g)
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && s.includes('@'));
        if (emails.length === 0) {
            setBulkResults([{ email: '', ok: false, error: 'No valid emails found' }]);
            return;
        }
        setBulkSending(true);
        try {
            const res = await orgBulkInvite(orgId, emails, bulkRole);
            setBulkResults(res.results);
            await load();
        } catch (e: any) {
            setBulkResults([{ email: '', ok: false, error: e?.message ?? 'Bulk invite failed' }]);
        } finally { setBulkSending(false); }
    };

    // Generate a shareable org-link via org_create_share_link. The
    // resulting token is the same shape as a normal invite token, so
    // the existing accept-invite flow works unchanged. Copy is shown
    // once for the staff to hand off; users redeem the link to join.
    const [shareBusy, setShareBusy] = useState(false);
    const [shareLink, setShareLink] = useState<{ token: string; role: OrgRole } | null>(null);
    const [shareRole, setShareRole] = useState<OrgRole>('member');
    const handleCreateShareLink = async () => {
        if (!orgId) return;
        setShareBusy(true);
        try {
            const res = await orgCreateShareLink(orgId, shareRole as any);
            setShareLink({ token: res.token, role: shareRole });
            await load();
        } catch (e: any) {
            showToast(e?.message ?? 'Could not create share link', 'error');
        } finally { setShareBusy(false); }
    };

    return (
        <OrgPageShell
            title="Invitations"
            subtitle="Invite new teammates and manage pending invites."
            icon={<Mail size={20} />}
            require="adminTier"
            actions={
                <div className="btn-group">
                    <button className="btn btn-ghost" onClick={() => { setBulkOpen(true); setBulkResults(null); }}>
                        <UsersRound size={14} /> <span style={{ marginLeft: 6 }}>Bulk invite</span>
                    </button>
                    <select
                        className="input-field input-field-sm"
                        value={shareRole}
                        onChange={(e) => setShareRole(e.target.value as OrgRole)}
                        style={{ width: 110 }}
                    >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button className="btn btn-ghost" onClick={handleCreateShareLink} disabled={shareBusy}>
                        {shareBusy ? <Loader2 size={14} className="spin" /> : <LinkIcon size={14} />}
                        <span style={{ marginLeft: 6 }}>Share link</span>
                    </button>
                </div>
            }
        >
            {/* Compose */}
            <div style={{ border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8, padding: 16, marginBottom: 20, background: 'var(--bg-elevated,#14141c)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Add a teammate</h3>
                    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-base,#0e0e15)', padding: 4, borderRadius: 6 }}>
                        <button
                            type="button"
                            onClick={() => setSendMode('provision')}
                            className={`btn btn-sm ${sendMode === 'provision' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '6px 10px' }}
                        >
                            <KeyRound size={12} /> <span style={{ marginLeft: 4 }}>Provision now</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSendMode('magic_link')}
                            className={`btn btn-sm ${sendMode === 'magic_link' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '6px 10px' }}
                        >
                            <Mail size={12} /> <span style={{ marginLeft: 4 }}>Magic link</span>
                        </button>
                    </div>
                </div>

                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>
                    {sendMode === 'provision'
                        ? 'Creates the account with a temp password and emails the user. They are forced to change it on first sign-in.'
                        : channel === 'phone'
                          ? 'Generates a magic-link invite tied to this phone number. Share the link via WhatsApp / SMS yourself.'
                          : 'Sends a magic-link invite. Recipient sets their own password during accept. (Legacy path.)'}
                </p>

                {/* Channel toggle — only meaningful for magic-link; provision is email-only. */}
                {sendMode === 'magic_link' && (
                    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-base,#0e0e15)', padding: 4, borderRadius: 6, marginBottom: 12, width: 'fit-content' }}>
                        <button
                            type="button"
                            onClick={() => setChannel('email')}
                            className={`btn btn-sm ${channel === 'email' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '4px 10px' }}
                        >
                            Email
                        </button>
                        <button
                            type="button"
                            onClick={() => setChannel('phone')}
                            className={`btn btn-sm ${channel === 'phone' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '4px 10px' }}
                        >
                            Phone
                        </button>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {sendMode === 'magic_link' && channel === 'phone' ? (
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+91 98765 43210"
                            className="input-field"
                            style={{ flex: '1 1 240px', minWidth: 220 }}
                        />
                    ) : (
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="teammate@yourcompany.com"
                            className="input-field"
                            style={{ flex: '1 1 240px', minWidth: 220 }}
                        />
                    )}
                    {sendMode === 'provision' && (
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Full name (optional)"
                            className="input-field"
                            style={{ flex: '1 1 180px', minWidth: 160 }}
                        />
                    )}
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as OrgRole)}
                        className="input-field"
                        style={{ width: 140 }}
                    >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSend}
                        disabled={
                            sending
                            || (sendMode === 'provision' && !email.includes('@'))
                            || (sendMode === 'magic_link' && channel === 'email' && !email.includes('@'))
                            || (sendMode === 'magic_link' && channel === 'phone' && phone.replace(/[^0-9+]/g, '').length < 8)
                        }
                    >
                        {sending ? <Loader2 size={14} className="spin" /> : (sendMode === 'provision' ? <KeyRound size={14} /> : <Send size={14} />)}
                        <span style={{ marginLeft: 6 }}>{sendMode === 'provision' ? 'Provision' : 'Send invite'}</span>
                    </button>
                </div>
                {composeMsg && (
                    <div className={`alert alert-${composeMsg.kind === 'ok' ? 'success' : 'error'}`} style={{ marginTop: 12 }}>
                        {composeMsg.text}
                    </div>
                )}
            </div>

            {/* Credentials handoff (shown once after a provision call) */}
            <CredentialsHandoffModal
                creds={credsHandoff}
                onClose={() => setCredsHandoff(null)}
            />

            {/* Share-link modal — appears once after Share link clicked */}
            {shareLink && (
                <ShareLinkModal
                    token={shareLink.token}
                    role={shareLink.role}
                    onClose={() => setShareLink(null)}
                />
            )}

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {/* Recently provisioned members ─────────────────────────
                Provisioned users skip the invite table because the edge
                function creates an active membership directly. We pull
                them from the audit log (action='member.provisioned')
                so they're still visible on this page. */}
            {provisioned.length > 0 && (
                <>
                    <h3 style={{ fontSize: 13, color: 'var(--text-muted,#8a8a96)', letterSpacing: 1, textTransform: 'uppercase' }}>
                        Recently added ({provisioned.length})
                    </h3>
                    <div style={{ border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8, overflow: 'hidden', marginBottom: 28 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-elevated,#14141c)', textAlign: 'left' }}>
                                    <th style={th}>Email</th>
                                    <th style={th}>Role</th>
                                    <th style={th}>Added by</th>
                                    <th style={th}>When</th>
                                    <th style={th}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {provisioned.map((r) => {
                                    const email = r.after?.email ?? r.after?.owner_email ?? '—';
                                    const role  = r.after?.role  ?? 'member';
                                    return (
                                        <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle,#2a2a35)' }}>
                                            <td style={td}>{email}</td>
                                            <td style={td}>
                                                <span style={{
                                                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                                                    background: 'rgba(99,102,241,0.15)', color: '#a5a8ff',
                                                    textTransform: 'capitalize',
                                                }}>{role}</span>
                                            </td>
                                            <td style={{ ...td, color: 'var(--text-muted)' }}>
                                                {r.actor_email ?? r.actor_name ?? (r.actor_user_id ? r.actor_user_id.slice(0, 8) + '…' : 'system')}
                                            </td>
                                            <td style={{ ...td, color: 'var(--text-muted)' }}>
                                                {new Date(r.created_at).toLocaleString()}
                                            </td>
                                            <td style={{ ...td, textAlign: 'right' }}>
                                                {r.resource_id && (
                                                    <a
                                                        href={`/org/members/${r.resource_id}`}
                                                        className="btn btn-ghost btn-sm"
                                                        style={{ textDecoration: 'none' }}
                                                    >
                                                        View
                                                    </a>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <h3 style={{ fontSize: 13, color: 'var(--text-muted,#8a8a96)', letterSpacing: 1, textTransform: 'uppercase' }}>
                Pending invites ({pending.length})
            </h3>
            <InviteTable
                rows={pending}
                loading={loading}
                busyId={busyId}
                copiedId={copiedId}
                onCopy={copyLink}
                onResend={handleResend}
                onRevoke={handleRevoke}
            />

            {past.length > 0 && (
                <>
                    <h3 style={{ marginTop: 28, fontSize: 13, color: 'var(--text-muted,#8a8a96)', letterSpacing: 1, textTransform: 'uppercase' }}>
                        History
                    </h3>
                    <InviteTable rows={past} loading={false} historyMode />
                </>
            )}

            <Modal
                open={bulkOpen}
                onClose={() => !bulkSending && setBulkOpen(false)}
                title="Bulk invite"
                width={620}
                footer={
                    <>
                        <button className="btn btn-ghost" onClick={() => setBulkOpen(false)} disabled={bulkSending}>Close</button>
                        <button className="btn btn-primary" onClick={handleBulk}
                            disabled={bulkSending || bulkText.trim().length === 0}>
                            {bulkSending ? <Loader2 size={14} className="spin" /> : <UsersRound size={14} />}
                            <span style={{ marginLeft: 6 }}>Send invites</span>
                        </button>
                    </>
                }
            >
                <FormField label="Emails" hint="Paste a list separated by commas, spaces, semicolons, or newlines.">
                    <textarea
                        value={bulkText}
                        onChange={(e) => setBulkText(e.target.value)}
                        placeholder={'alice@acme.com\nbob@acme.com\ncarol@acme.com'}
                        rows={6}
                        className="input-field"
                        style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
                    />
                </FormField>
                <FormField label="Role for all">
                    <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value as OrgRole)}
                        className="input-field" style={{ width: 160 }}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                </FormField>
                {bulkResults && (
                    <div style={{ borderTop: '1px solid var(--border-subtle,#2a2a35)', paddingTop: 12 }}>
                        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)', marginBottom: 8 }}>
                            Results ({bulkResults.filter((r) => r.ok).length} ok / {bulkResults.length} total)
                        </div>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 240, overflowY: 'auto' }}>
                            {bulkResults.map((r, i) => (
                                <li key={`${r.email}-${i}`} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 0', borderBottom: '1px solid var(--border-subtle,#2a2a35)',
                                    fontSize: 12,
                                }}>
                                    {r.ok
                                        ? <Check size={12} style={{ color: '#22c55e' }} />
                                        : <X size={12} style={{ color: '#ef4444' }} />}
                                    <span style={{ flex: 1 }}>{r.email || '(empty)'}</span>
                                    {!r.ok && r.error && (
                                        <span style={{ color: '#ef4444', fontSize: 11 }}>{r.error}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </Modal>
            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}

function InviteTable({
    rows, loading, busyId, copiedId,
    onCopy, onResend, onRevoke, historyMode,
}: {
    rows: OrgInviteRow[];
    loading: boolean;
    busyId?: string | null;
    copiedId?: string | null;
    onCopy?: (r: OrgInviteRow) => void;
    onResend?: (r: OrgInviteRow) => void;
    onRevoke?: (r: OrgInviteRow) => void;
    historyMode?: boolean;
}) {
    const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)', fontWeight: 600, textAlign: 'left' };
    const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13 };

    if (loading) {
        return (
            <div style={{ padding: 24, color: 'var(--text-muted,#8a8a96)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <Loader2 size={14} className="spin" /> Loading…
            </div>
        );
    }
    if (rows.length === 0) {
        return <div style={{ padding: 16, color: 'var(--text-muted,#8a8a96)', fontSize: 13 }}>No invites.</div>;
    }
    return (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ background: 'var(--bg-elevated,#14141c)' }}>
                        <th style={th}>Email</th>
                        <th style={th}>Role</th>
                        <th style={th}>Status</th>
                        <th style={th}>Expires</th>
                        {!historyMode && <th style={{ ...th, textAlign: 'right' }}>Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle,#2a2a35)' }}>
                            <td style={td}>
                                {r.email ?? r.phone ?? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                                        <LinkIcon size={12} /> shareable link
                                    </span>
                                )}
                                {!r.email && r.phone && (
                                    <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>SMS</span>
                                )}
                            </td>
                            <td style={{ ...td, textTransform: 'capitalize' }}>{r.role}</td>
                            <td style={{ ...td, textTransform: 'capitalize' }}>
                                {r.status}
                                {(r as any).opened_at && (
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Eye size={10} /> opened {new Date((r as any).opened_at).toLocaleDateString()}
                                    </div>
                                )}
                            </td>
                            <td style={td}>{new Date(r.expires_at).toLocaleDateString()}</td>
                            {!historyMode && (
                                <td style={{ ...td, textAlign: 'right' }}>
                                    {busyId === r.id && <Loader2 size={14} className="spin" />}
                                    {busyId !== r.id && (
                                        <>
                                            <button className="btn btn-ghost btn-sm" onClick={() => onCopy?.(r)} title="Copy invite link">
                                                {copiedId === r.id ? <Check size={14} /> : <Copy size={14} />}
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => onResend?.(r)} title="Rotate token & extend" style={{ marginLeft: 4 }}>
                                                <RotateCcw size={14} />
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => onRevoke?.(r)} title="Revoke" style={{ marginLeft: 4 }}>
                                                <X size={14} />
                                            </button>
                                        </>
                                    )}
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const th: React.CSSProperties = {
    padding: '10px 14px',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'var(--text-muted,#8a8a96)',
    fontWeight: 600,
};
const td: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'middle' };

/**
 * One-time share-link modal. The org-link token is shown once;
 * staff copies it to share elsewhere. Anyone with the link can
 * redeem it via the standard org_accept_invite flow.
 */
function ShareLinkModal({ token, role, onClose }: { token: string; role: string; onClose: () => void }) {
    const [copied, setCopied] = useState(false);
    const link = `contour://org/invite/${token}`;
    const copy = async () => {
        try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }
        catch { /* clipboard may be denied */ }
    };
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
                <div className="modal-header">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <LinkIcon size={18} /> Shareable invite link
                    </h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body">
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                        Anyone with this link joins as <strong>{role}</strong>. The link expires in 14 days
                        and can be revoked from the table below.
                    </p>
                    <div style={{
                        background: 'var(--bg-elevated)', borderRadius: 8, padding: 12,
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontFamily: 'ui-monospace, monospace', fontSize: 12,
                    }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {link}
                        </span>
                        <button className="btn btn-ghost btn-sm" onClick={copy}>
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? ' Copied' : ' Copy'}
                        </button>
                    </div>
                    <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        The link is saved as an invite row with email blank. Tracking, expiry, and
                        revoke work just like an emailed invite.
                    </p>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    );
}
