/**
 * Org → Approvals
 *
 * Pending-approval queue for transactions. Owners/admins approve,
 * reject, or mark-executed. Submitter cannot approve their own.
 */

import { useCallback, useEffect, useState } from 'react';
import {
    CheckCheck, X, Loader2, RefreshCw, IndianRupee, Receipt, CheckCircle2,
} from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import {
    txnListPendingForOrg, txnApprove, txnReject, txnMarkExecuted,
    type PendingTxnRow,
} from '../../lib/approvals';
import { OrgPageShell, Avatar } from '../../components/org';
import { useOrgDialog, OrgConfirmModal, useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
    draft:            { bg: 'rgba(138,138,150,0.15)', color: '#b0b0bc' },
    pending_approval: { bg: 'rgba(234,179,8,0.15)',   color: '#eab308' },
    approved:         { bg: 'rgba(34,197,94,0.15)',   color: '#22c55e' },
    rejected:         { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444' },
    executed:         { bg: 'rgba(99,102,241,0.15)',  color: '#a5a8ff' },
};

function formatAmount(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
    } catch {
        return `${currency} ${amount}`;
    }
}

export default function OrgApprovalsPage() {
    const { scope } = useScope();
    const orgId = scope.orgId;
    const { dialog, confirm, close, run } = useOrgDialog();
    const { toast, show: showToast } = useOrgToast();

    const [rows, setRows] = useState<PendingTxnRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true); setError(null);
        try { setRows(await txnListPendingForOrg(orgId)); }
        catch (e: any) { setError(e?.message ?? 'Failed to load queue'); }
        finally { setLoading(false); }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    const handleApprove = (r: PendingTxnRow) => {
        confirm({
            title: 'Approve transaction?',
            message: `${formatAmount(r.amount, r.currency)} from ${r.submitter_name ?? 'submitter'}`,
            confirmText: 'Approve', variant: 'info',
            onConfirm: async () => {
                setBusyId(r.id);
                try { await txnApprove(r.id); await load(); showToast('Transaction approved'); }
                catch (e: any) { showToast(e?.message ?? 'Could not approve', 'error'); }
                finally { setBusyId(null); }
            },
        });
    };

    const handleReject = (r: PendingTxnRow) => {
        confirm({
            title: 'Reject transaction?',
            message: `${formatAmount(r.amount, r.currency)} from ${r.submitter_name ?? 'submitter'}`,
            confirmText: 'Reject', variant: 'danger',
            onConfirm: async () => {
                setBusyId(r.id);
                try { await txnReject(r.id); await load(); showToast('Transaction rejected'); }
                catch (e: any) { showToast(e?.message ?? 'Could not reject', 'error'); }
                finally { setBusyId(null); }
            },
        });
    };

    const handleMarkExecuted = async (r: PendingTxnRow) => {
        setBusyId(r.id);
        try { await txnMarkExecuted(r.id); await load(); showToast('Marked as executed'); }
        catch (e: any) { showToast(e?.message ?? 'Could not mark executed', 'error'); }
        finally { setBusyId(null); }
    };

    return (
        <OrgPageShell
            title="Approvals"
            subtitle="Transactions awaiting your decision. Drafts shown for visibility."
            icon={<Receipt size={20} />}
            require="adminTier"
            actions={
                <button className="btn btn-ghost" onClick={() => load()}>
                    <RefreshCw size={14} /> <span style={{ marginLeft: 6 }}>Refresh</span>
                </button>
            }
        >
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {loading ? (
                <div style={{ padding: 24, color: 'var(--text-muted,#8a8a96)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Loader2 size={14} className="spin" /> Loading queue…
                </div>
            ) : rows.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted,#8a8a96)' }}>
                    Nothing pending. 🎉
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle,#2a2a35)', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-elevated,#14141c)', textAlign: 'left' }}>
                                <th style={th}>Submitter</th>
                                <th style={th}>Amount</th>
                                <th style={th}>Category</th>
                                <th style={th}>Contact</th>
                                <th style={th}>Date</th>
                                <th style={th}>Status</th>
                                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const s = STATUS_STYLES[r.approval_status] ?? STATUS_STYLES.draft;
                                return (
                                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-subtle,#2a2a35)' }}>
                                        <td style={td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <Avatar name={r.submitter_name} url={r.submitter_avatar} size={32} />
                                                <span style={{ fontSize: 13 }}>{r.submitter_name ?? '—'}</span>
                                            </div>
                                        </td>
                                        <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                {r.currency === 'INR' && <IndianRupee size={11} />}
                                                {formatAmount(r.amount, r.currency)}
                                            </span>
                                        </td>
                                        <td style={td}>{r.category ?? '—'}</td>
                                        <td style={td}>{r.contact_name ?? '—'}</td>
                                        <td style={td}>{r.transaction_date ? new Date(r.transaction_date).toLocaleDateString() : '—'}</td>
                                        <td style={td}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 999,
                                                background: s.bg, color: s.color,
                                                fontSize: 11, fontWeight: 500, textTransform: 'capitalize',
                                            }}>
                                                {r.approval_status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {busyId === r.id && <Loader2 size={14} className="spin" />}
                                            {busyId !== r.id && r.approval_status === 'pending_approval' && (
                                                <>
                                                    <button className="btn btn-primary btn-sm"
                                                        onClick={() => handleApprove(r)}
                                                        title="Approve">
                                                        <CheckCheck size={12} /> <span style={{ marginLeft: 4 }}>Approve</span>
                                                    </button>
                                                    <button className="btn btn-ghost btn-sm"
                                                        onClick={() => handleReject(r)}
                                                        style={{ marginLeft: 4 }}
                                                        title="Reject">
                                                        <X size={12} /> <span style={{ marginLeft: 4 }}>Reject</span>
                                                    </button>
                                                </>
                                            )}
                                            {busyId !== r.id && r.approval_status === 'draft' && (
                                                <span style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)' }}>
                                                    Waiting for submitter to request approval
                                                </span>
                                            )}
                                            {busyId !== r.id && r.approval_status === 'approved' && (
                                                <button className="btn btn-ghost btn-sm"
                                                    onClick={() => handleMarkExecuted(r)}>
                                                    <CheckCircle2 size={12} /> <span style={{ marginLeft: 4 }}>Mark executed</span>
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <OrgConfirmModal dialog={dialog} onClose={close} onConfirm={run} />
            <OrgToastBanner toast={toast} />
        </OrgPageShell>
    );
}

const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)', fontWeight: 600 };
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, verticalAlign: 'middle' };
