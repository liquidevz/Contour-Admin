/**
 * Org → Domains
 *
 * Full domain management for an org:
 *   - List every attached domain (verified + pending)
 *   - Add a new domain (modal)
 *   - Per-row: copy DNS TXT record, change join policy, rotate token,
 *     trigger an immediate verification run, remove
 *   - Per-row: expandable verification history (last 20 checks)
 *
 * Powered by RPCs in migration 069.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    Globe, Plus, Loader2, Copy, Check, RefreshCw, Trash2, ChevronDown, ChevronRight,
    BadgeCheck, ShieldAlert, Zap,
} from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    orgListDomains, orgAddDomain, orgRemoveDomain, orgRecheckDomain,
    orgSetDomainJoinPolicy, orgListDomainCheckLogs,
    triggerDnsVerifyEdgeFn,
    type OrgDomainRow, type DomainCheckLogRow, type JoinPolicy,
} from '../../lib/org';
import { OrgPageShell, Modal, FormField } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';

const POLICIES: { value: JoinPolicy; label: string; hint: string }[] = [
    { value: 'auto_join',        label: 'Auto-join',        hint: 'Anyone with this domain auto-joins as a member.' },
    { value: 'request_approval', label: 'Request approval', hint: 'New users sit in pending until an admin approves.' },
    { value: 'invite_only',      label: 'Invite only',      hint: 'Only admins can add members — no domain auto-join.' },
];

export default function OrgDomainsPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows] = useState<OrgDomainRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [logs, setLogs] = useState<Record<string, DomainCheckLogRow[]>>({});

    // Add-domain modal
    const [addOpen, setAddOpen] = useState(false);
    const [aDomain, setADomain] = useState('');
    const [aPolicy, setAPolicy] = useState<JoinPolicy>('invite_only');
    const [adding, setAdding] = useState(false);
    const [addErr, setAddErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true); setError(null);
        try { setRows(await orgListDomains(orgId)); }
        catch (e: any) { setError(e?.message ?? 'Failed to load domains'); }
        finally { setLoading(false); }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    const handleAdd = async () => {
        if (!orgId || aDomain.trim().length < 3) return;
        setAdding(true); setAddErr(null);
        try {
            await orgAddDomain(orgId, aDomain.trim(), aPolicy);
            setAddOpen(false); setADomain(''); setAPolicy('invite_only');
            await load();
        } catch (e: any) {
            setAddErr(e?.message ?? 'Could not add domain');
        } finally { setAdding(false); }
    };

    const handleRemove = (d: OrgDomainRow) => {
        confirm({
            title: `Remove ${d.domain}?`,
            message: 'Teammates with this email domain will no longer auto-join.',
            confirmText: 'Remove', variant: 'danger',
            onConfirm: async () => {
                setBusyId(d.id);
                try { await orgRemoveDomain(d.id); await load(); showToast(`${d.domain} removed`); }
                catch (e: any) { showToast(e?.message ?? 'Could not remove', 'error'); }
                finally { setBusyId(null); }
            },
        });
    };

    const handleRotate = (d: OrgDomainRow) => {
        confirm({
            title: `Rotate token for ${d.domain}?`,
            message: 'The previously-published TXT record will stop working until you republish the new one.',
            confirmText: 'Rotate', variant: 'warning',
            onConfirm: async () => {
                setBusyId(d.id);
                try { await orgRecheckDomain(d.id, true); await load(); showToast('Token rotated'); }
                catch (e: any) { showToast(e?.message ?? 'Could not rotate', 'error'); }
                finally { setBusyId(null); }
            },
        });
    };

    const handleVerifyNow = async (d: OrgDomainRow) => {
        setBusyId(d.id);
        try {
            const result = await triggerDnsVerifyEdgeFn(d.id);
            await load();
            if (expandedId === d.id) await loadLogs(d.id);

            if (!result) {
                showToast(`DNS check failed for ${d.domain}. Try again in a moment.`, 'error');
                return;
            }
            if (result.resolved) {
                showToast(`${result.domain} verified ✓`);
            } else {
                showToast(
                    `Not verified — couldn't find the expected TXT record. DNS may take a few minutes to propagate.`,
                    'error',
                );
            }
        } catch (e: any) {
            showToast(e?.message ?? 'Could not trigger verification', 'error');
        } finally { setBusyId(null); }
    };

    const handlePolicy = async (d: OrgDomainRow, p: JoinPolicy) => {
        setBusyId(d.id);
        try { await orgSetDomainJoinPolicy(d.id, p); await load(); showToast('Join policy updated'); }
        catch (e: any) { showToast(e?.message ?? 'Could not update', 'error'); }
        finally { setBusyId(null); }
    };

    const copy = async (txt: string, id: string) => {
        try {
            await navigator.clipboard.writeText(txt);
            setCopiedId(id);
            setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
        } catch { /* ok */ }
    };

    const loadLogs = async (domainId: string) => {
        try {
            const log = await orgListDomainCheckLogs(domainId);
            setLogs((m) => ({ ...m, [domainId]: log }));
        } catch { /* ok */ }
    };

    const toggleExpand = async (id: string) => {
        if (expandedId === id) { setExpandedId(null); return; }
        setExpandedId(id);
        if (!logs[id]) await loadLogs(id);
    };

    return (
        <OrgPageShell
            title="Domains"
            subtitle="Verify and manage the email domains attached to your workspace. Verified domains enable auto-join."
            icon={<Globe size={20} />}
            require="adminTier"
            actions={
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" onClick={() => load()}>
                        <RefreshCw size={14} /> <span style={{ marginLeft: 6 }}>Refresh</span>
                    </button>
                    <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
                        <Plus size={14} /> <span style={{ marginLeft: 6 }}>Add domain</span>
                    </button>
                </div>
            }
        >
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {loading ? (
                <div style={{ padding: 24, color: 'var(--text-muted,#8a8a96)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Loader2 size={14} className="spin" /> Loading…
                </div>
            ) : rows.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted,#8a8a96)' }}>
                    No domains attached yet.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {rows.map((d) => {
                        const dnsRecord = `contour-verify=${d.verification_token}`;
                        const isExpanded = expandedId === d.id;
                        return (
                            <section key={d.id} style={card}>
                                {/* Header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Globe size={16} style={{ color: 'var(--text-muted,#8a8a96)' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <strong style={{ fontSize: 14 }}>{d.domain}</strong>
                                            {d.verified ? (
                                                <span style={badge('#22c55e')}>
                                                    <BadgeCheck size={11} /> verified
                                                </span>
                                            ) : (
                                                <span style={badge('#eab308')}>
                                                    <ShieldAlert size={11} /> pending
                                                </span>
                                            )}
                                            {d.verification_method === 'admin_override' && (
                                                <span style={{ ...badge('#a5a8ff'), background: 'rgba(99,102,241,0.12)' }}>
                                                    admin asserted
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)', marginTop: 2 }}>
                                            {d.verified_at
                                                ? `Verified ${new Date(d.verified_at).toLocaleString()}`
                                                : `Added ${new Date(d.created_at).toLocaleDateString()}`}
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => toggleExpand(d.id)}
                                        title="Verification log"
                                    >
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                </div>

                                {/* Body */}
                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {/* DNS record (only if not verified) */}
                                    {!d.verified && (
                                        <div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)', marginBottom: 4 }}>
                                                Add this TXT record at the root of <strong>{d.domain}</strong>:
                                            </div>
                                            <div style={dnsBox}>
                                                <code style={{ flex: 1, wordBreak: 'break-all' }}>{dnsRecord}</code>
                                                <button className="btn btn-ghost btn-sm" onClick={() => copy(dnsRecord, d.id)} title="Copy">
                                                    {copiedId === d.id ? <Check size={12} /> : <Copy size={12} />}
                                                </button>
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)', marginTop: 4 }}>
                                                After publishing, DNS may take a few minutes to propagate. The system
                                                auto-checks every 5 minutes, or click <strong>Verify now</strong>.
                                            </div>
                                        </div>
                                    )}

                                    {/* Join policy */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>Join policy:</span>
                                        <select
                                            value={d.join_policy}
                                            onChange={(e) => handlePolicy(d, e.target.value as JoinPolicy)}
                                            disabled={busyId === d.id || !d.verified}
                                            className="input-field"
                                            style={{ padding: '4px 8px', fontSize: 12 }}
                                            title={!d.verified ? 'Verify the domain first' : ''}
                                        >
                                            {POLICIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                                        </select>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)' }}>
                                            {POLICIES.find((p) => p.value === d.join_policy)?.hint}
                                        </span>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {!d.verified && (
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => handleVerifyNow(d)}
                                                disabled={busyId === d.id}
                                            >
                                                {busyId === d.id ? <Loader2 size={12} className="spin" /> : <Zap size={12} />}
                                                <span style={{ marginLeft: 4 }}>Verify now</span>
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleRotate(d)}
                                            disabled={busyId === d.id}
                                        >
                                            <RefreshCw size={12} /> <span style={{ marginLeft: 4 }}>Rotate token</span>
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => handleRemove(d)}
                                            disabled={busyId === d.id}
                                            style={{ marginLeft: 'auto', color: '#ef4444' }}
                                        >
                                            <Trash2 size={12} /> <span style={{ marginLeft: 4 }}>Remove</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Verification log */}
                                {isExpanded && (
                                    <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle,#2a2a35)', paddingTop: 12 }}>
                                        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)', marginBottom: 8 }}>
                                            Verification history
                                        </div>
                                        {!logs[d.id] ? (
                                            <Loader2 size={12} className="spin" />
                                        ) : logs[d.id].length === 0 ? (
                                            <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)' }}>
                                                No checks recorded yet.
                                            </div>
                                        ) : (
                                            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                {logs[d.id].map((l) => (
                                                    <li key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                                        <span style={badge(l.resolved ? '#22c55e' : '#ef4444')}>
                                                            {l.resolved ? 'pass' : 'miss'}
                                                        </span>
                                                        <span style={{ color: 'var(--text-muted,#8a8a96)' }}>
                                                            {new Date(l.checked_at).toLocaleString()}
                                                        </span>
                                                        {l.notes && (
                                                            <span style={{ color: '#ef4444', fontSize: 11 }}>{l.notes}</span>
                                                        )}
                                                        {l.found_tokens && l.found_tokens.length > 0 && !l.resolved && (
                                                            <span style={{ color: 'var(--text-muted,#8a8a96)', fontSize: 11, fontFamily: 'monospace' }}>
                                                                found: {l.found_tokens.slice(0, 2).join(', ')}{l.found_tokens.length > 2 ? '…' : ''}
                                                            </span>
                                                        )}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}

            <Modal
                open={addOpen}
                onClose={() => !adding && setAddOpen(false)}
                title="Add a domain"
                footer={
                    <>
                        <button className="btn btn-ghost" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleAdd} disabled={adding || aDomain.trim().length < 3}>
                            {adding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                            <span style={{ marginLeft: 6 }}>Add</span>
                        </button>
                    </>
                }
            >
                <FormField label="Domain" hint="The bare domain — e.g. acme.com, not www.acme.com or @acme.com">
                    <input
                        type="text"
                        value={aDomain}
                        onChange={(e) => setADomain(e.target.value)}
                        placeholder="acme.com"
                        className="input-field"
                        style={{ width: '100%' }}
                        autoFocus
                    />
                </FormField>
                <FormField label="Join policy" hint={POLICIES.find((p) => p.value === aPolicy)?.hint}>
                    <select value={aPolicy} onChange={(e) => setAPolicy(e.target.value as JoinPolicy)}
                        className="input-field" style={{ width: '100%' }}>
                        {POLICIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                </FormField>
                {addErr && <div className="alert alert-error">{addErr}</div>}
            </Modal>
            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}

const card: React.CSSProperties = {
    background: 'var(--bg-elevated,#14141c)',
    border: '1px solid var(--border-subtle,#2a2a35)',
    borderRadius: 8, padding: 14,
};
const dnsBox: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--bg-primary,#0a0a0f)', padding: 8, borderRadius: 6,
    fontFamily: 'monospace', fontSize: 12,
};
function badge(color: string): React.CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '2px 6px', borderRadius: 999, fontSize: 10,
        background: color + '22', color, fontWeight: 500,
    };
}
