/**
 * Super Admin → Organisations
 *
 * - Lists every org on the platform.
 * - "Create org" — superadmin shortcut that mints a new org (skips
 *   the work-email / DNS-verification dance) via admin_create_organization.
 * - Drill in — calls admin_enter_org so the superadmin becomes an
 *   admin member, switches scope to that org, navigates to its
 *   Members page. Entry is audited so org owners can see platform
 *   staff joined.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2, ExternalLink, BadgeCheck, ShieldOff,
    CheckCircle2, Loader2, Power, RefreshCw, Plus, X, AlertCircle, Trash2,
} from 'lucide-react';
import Page from '../components/ui/Page';
import SearchFilter from '../components/ui/SearchFilter';
import { TableSkeleton } from '../components/ui/Skeletons';
import ConfirmModal from '../components/ui/ConfirmModal';
import { toast } from '../components/ui/Toast';
import { CredentialsHandoffModal, type CredentialsHandoff } from '../components/org';
import { useScope } from '../context/ScopeContext';
import { edgeInvoke } from '../lib/edgeInvoke';
import {
    adminListOrganizations, adminSetOrgStatus, adminVerifyOrgDomain,
    adminEnterOrg, adminGetOrgSummary,
    type AdminOrgRow, type OrgStatus, type OrgPlan,
} from '../lib/org';

type LifecycleAction =
    | { kind: 'suspend';   org: AdminOrgRow }
    | { kind: 'reactivate'; org: AdminOrgRow }
    | { kind: 'archive';   org: AdminOrgRow }
    | { kind: 'verify';    org: AdminOrgRow }
    | null;

const STATUS_FILTERS: Array<{ value: OrgStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'pending_claim', label: 'Pending claim' },
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'deleted', label: 'Deleted' },
];

const PLANS: OrgPlan[] = ['free', 'pro', 'business', 'enterprise'];

function slugify(s: string): string {
    return s.toLowerCase().trim()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export default function OrganisationsPage() {
    const navigate = useNavigate();
    const { isPlatformAdmin, refresh: refreshScope, switchToOrg } = useScope();

    const [rows, setRows] = useState<AdminOrgRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<OrgStatus | 'all'>('all');
    const [busyId, setBusyId] = useState<string | null>(null);

    // Create-org modal — now bundles "create org + first admin" into one
    // call to the provision-business-user edge function (action=create_org).
    // The legacy admin_create_organization RPC is retained server-side for
    // back-compat but we route through the edge fn so the new admin gets a
    // proper auth.users row + temp password + force_password_change=true.
    const [createOpen, setCreateOpen] = useState(false);
    const [cName, setCName] = useState('');
    const [cSlug, setCSlug] = useState('');
    const [cSlugTouched, setCSlugTouched] = useState(false);
    const [cDomain, setCDomain] = useState('');
    const [cPlan, setCPlan] = useState<OrgPlan>('free');
    const [cAdminEmail, setCAdminEmail] = useState('');
    const [cAdminName, setCAdminName] = useState('');
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);
    // After provisioning, surface the one-time temp password to the staff
    // so they can hand it off if the email fails to land.
    const [credsHandoff, setCredsHandoff] = useState<CredentialsHandoff | null>(null);

    const effectiveCSlug = cSlugTouched ? cSlug : slugify(cName);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const data = await adminListOrganizations({
                search: search.trim() || undefined,
                status: statusFilter === 'all' ? null : statusFilter,
                limit: 100,
            });
            setRows(data);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load organisations');
        } finally { setLoading(false); }
    }, [search, statusFilter]);

    useEffect(() => { void load(); }, [load]);

    const handleCreate = async () => {
        const name = cName.trim();
        const adminEmail = cAdminEmail.trim().toLowerCase();
        const domain = cDomain.trim().toLowerCase();
        if (name.length < 2 || effectiveCSlug.length < 2) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
            setCreateErr('First admin email is required.');
            return;
        }
        if (!domain) {
            setCreateErr('Primary domain is required (e.g. acme.com).');
            return;
        }
        setCreating(true); setCreateErr(null);
        try {
            // Edge function does the heavy lifting: creates auth.users with
            // a temp password, wires the owner membership + profile, sends
            // the welcome email, and returns the temp password for handoff.
            const data = await edgeInvoke<{ ok: boolean; user_id: string; org_id: string; temp_password: string }>(
                'provision-business-user',
                {
                    action:    'create_org',
                    email:     adminEmail,
                    full_name: cAdminName.trim() || null,
                    org_name:  name,
                    slug:      effectiveCSlug,
                    domain,
                },
            );

            setCredsHandoff({
                org_name: name,
                email: adminEmail,
                temp_password: data.temp_password,
            });
            setCreateOpen(false);
            setCName(''); setCSlug(''); setCSlugTouched(false); setCDomain(''); setCPlan('free');
            setCAdminEmail(''); setCAdminName('');
            await load();
        } catch (e: any) {
            setCreateErr(e?.message ?? 'Could not create organisation');
        } finally { setCreating(false); }
    };

    // Lifecycle confirmation state. A single ConfirmModal renders for whichever
    // action is queued. Severity scales with blast radius:
    //   verify     → low      (single click)
    //   suspend    → medium   (acknowledged checkbox)
    //   reactivate → medium
    //   archive    → high     (typed-confirm = org slug)
    const [pending, setPending] = useState<LifecycleAction>(null);
    const [lifecycleBusy, setLifecycleBusy] = useState(false);

    const runLifecycle = async () => {
        if (!pending) return;
        const org = pending.org;
        setLifecycleBusy(true);
        setBusyId(org.id);
        try {
            switch (pending.kind) {
                case 'suspend':
                    await adminSetOrgStatus(org.id, 'suspended');
                    toast.success(`${org.name} suspended`, { detail: 'Members can no longer sign in.' });
                    break;
                case 'reactivate':
                    await adminSetOrgStatus(org.id, 'active');
                    toast.success(`${org.name} reactivated`);
                    break;
                case 'archive':
                    await adminSetOrgStatus(org.id, 'deleted');
                    toast.success(`${org.name} archived`, { detail: 'Data is retained, sign-in is blocked.' });
                    break;
                case 'verify': {
                    if (!org.primary_domain) throw new Error('No primary domain to verify');
                    const summary = await adminGetOrgSummary(org.id);
                    const primary = summary.domains.find((d) => d.domain === org.primary_domain);
                    if (!primary) throw new Error('Primary domain row not found');
                    await adminVerifyOrgDomain(primary.id);
                    toast.success(`${org.primary_domain} verified`);
                    break;
                }
            }
            setPending(null);
            await load();
        } catch (e: any) {
            toast.error('Action failed', { detail: e?.message ?? 'Unknown error' });
        } finally {
            setLifecycleBusy(false);
            setBusyId(null);
        }
    };

    /**
     * Drill into an org. Steps:
     *   1. Call admin_enter_org → server makes the superadmin an
     *      'admin' member of the target org (audited).
     *   2. refreshScope() to reload memberships in the client.
     *   3. switchToOrg() to flip the active scope to that org.
     *   4. Navigate to /org/members.
     */
    const drillIn = async (org: AdminOrgRow) => {
        setBusyId(org.id);
        try {
            await adminEnterOrg(org.id);
            await refreshScope();
            switchToOrg(org.id);
            navigate('/org/members');
        } catch (e: any) {
            toast.error('Could not enter organisation', { detail: e?.message });
        } finally { setBusyId(null); }
    };

    if (!isPlatformAdmin) {
        return (
            <Page title="Organisations" subtitle="Super-admin only.">
                <p className="muted">You don't have permission to view this page.</p>
            </Page>
        );
    }

    return (
        <Page
            title="Organisations"
            subtitle="All workspaces on the platform. Create, search, suspend, verify domains, and drill in."
            icon={<Building2 size={20} />}
            actions={
                <div className="btn-group">
                    <button className="btn btn-ghost" onClick={() => load()}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                        <Plus size={14} /> Create org
                    </button>
                </div>
            }
        >
            {/* Filters — SearchFilter handles debounce + chip dropdowns */}
            <SearchFilter
                query={search}
                onQueryChange={setSearch}
                placeholder="Search name, slug, domain, owner email…"
                chips={[
                    {
                        key: 'status',
                        label: 'Status',
                        value: statusFilter === 'all' ? null : statusFilter,
                        onChange: (v) => setStatusFilter((v as OrgStatus) ?? 'all'),
                        options: STATUS_FILTERS.filter(s => s.value !== 'all').map(s => ({
                            value: s.value, label: s.label,
                        })),
                    },
                ]}
                rightExtra={
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 500 }}>
                        {rows.length} org{rows.length === 1 ? '' : 's'}
                    </span>
                }
            />

            {error && (
                <div className="alert alert-error" style={{ marginBottom: 16, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--status-error-subtle)', color: 'var(--status-error)', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {loading ? (
                <div className="data-card">
                    <TableSkeleton rows={6} cols={9} />
                </div>
            ) : rows.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">
                        <Building2 size={24} />
                    </div>
                    <h3>No organisations found</h3>
                    <p>Click "Create org" to add your first organisation.</p>
                </div>
            ) : (
                <div className="data-card">
                    <div className="data-table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Organisation</th>
                                    <th>Owner</th>
                                    <th>Domain</th>
                                    <th>Status</th>
                                    <th>Plan</th>
                                    <th>Members</th>
                                    <th>Teams</th>
                                    <th>Created</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((o) => (
                                    <tr key={o.id}>
                                        <td>
                                            <div className="user-cell">
                                                <div className="user-cell-avatar">
                                                    {o.logo_url
                                                        ? <img src={o.logo_url} alt="" />
                                                        : (o.name ?? '?')[0]?.toUpperCase()}
                                                </div>
                                                <div className="user-cell-info">
                                                    <div className="user-cell-name">{o.name}</div>
                                                    <div className="user-cell-sub">/{o.slug}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{o.owner_email ?? '—'}</td>
                                        <td>
                                            {o.primary_domain ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                    {o.primary_domain}
                                                    {o.primary_verified
                                                        ? <BadgeCheck size={12} style={{ color: 'var(--status-success)' }} />
                                                        : <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '2px 6px' }}>unverified</span>}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td><OrgStatusBadge status={o.status} /></td>
                                        <td style={{ textTransform: 'capitalize' }}>{o.plan}</td>
                                        <td>{o.member_count}</td>
                                        <td>{o.team_count}</td>
                                        <td>{new Date(o.created_at).toLocaleDateString()}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div className="btn-group">
                                                {busyId === o.id ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <>
                                                        {o.primary_domain && !o.primary_verified && (
                                                            <button
                                                                className="btn btn-ghost btn-sm btn-icon"
                                                                onClick={() => setPending({ kind: 'verify', org: o })}
                                                                title="Force-verify domain"
                                                            >
                                                                <CheckCircle2 size={14} />
                                                            </button>
                                                        )}
                                                        {o.status === 'active' ? (
                                                            <button
                                                                className="btn btn-ghost btn-sm btn-icon"
                                                                onClick={() => setPending({ kind: 'suspend', org: o })}
                                                                title="Suspend"
                                                            >
                                                                <ShieldOff size={14} />
                                                            </button>
                                                        ) : o.status === 'suspended' ? (
                                                            <button
                                                                className="btn btn-ghost btn-sm btn-icon"
                                                                onClick={() => setPending({ kind: 'reactivate', org: o })}
                                                                title="Reactivate"
                                                            >
                                                                <Power size={14} />
                                                            </button>
                                                        ) : null}
                                                        {o.status !== 'deleted' && (
                                                            <button
                                                                className="btn btn-ghost btn-sm btn-icon"
                                                                onClick={() => setPending({ kind: 'archive', org: o })}
                                                                title="Archive (mark deleted)"
                                                                style={{ color: '#ef4444' }}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                        <button className="btn btn-primary btn-sm" onClick={() => drillIn(o)} title="Enter org admin">
                                                            <ExternalLink size={14} /> Manage
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Create org modal ─────────────────────────────────── */}
            <CreateOrgModal
                open={createOpen}
                onClose={() => !creating && setCreateOpen(false)}
                name={cName}
                onNameChange={setCName}
                slug={effectiveCSlug}
                onSlugChange={(val) => { setCSlugTouched(true); setCSlug(slugify(val)); }}
                domain={cDomain}
                onDomainChange={setCDomain}
                plan={cPlan}
                onPlanChange={setCPlan}
                adminEmail={cAdminEmail}
                onAdminEmailChange={setCAdminEmail}
                adminName={cAdminName}
                onAdminNameChange={setCAdminName}
                error={createErr}
                busy={creating}
                onSubmit={handleCreate}
            />

            {/* ── Credentials handoff modal (shown once after create) ── */}
            <CredentialsHandoffModal
                creds={credsHandoff}
                onClose={() => setCredsHandoff(null)}
            />

            {/* ── Lifecycle confirmation modal ── */}
            <ConfirmModal
                open={pending !== null}
                onClose={() => !lifecycleBusy && setPending(null)}
                onConfirm={runLifecycle}
                busy={lifecycleBusy}
                {...buildLifecycleCopy(pending)}
            />
        </Page>
    );
}

/* ───────── lifecycle copy builder ─────────
 * Severity scales with blast radius:
 *   verify     → low
 *   suspend    → medium (signed-in users get kicked next request)
 *   reactivate → medium
 *   archive    → high (typed-confirm = slug)
 */
function buildLifecycleCopy(pending: LifecycleAction): {
    title: string;
    body: string;
    consequences?: string[];
    severity: 'low' | 'medium' | 'high';
    confirmLabel: string;
    typedConfirm?: string;
    typedConfirmPrompt?: React.ReactNode;
} {
    if (!pending) {
        return { title: '', body: '', severity: 'low', confirmLabel: 'Confirm' };
    }
    const { org } = pending;

    switch (pending.kind) {
        case 'verify':
            return {
                title: `Force-verify ${org.primary_domain}?`,
                body: `This skips the DNS challenge for ${org.name} and trusts your attestation.`,
                severity: 'low',
                confirmLabel: 'Verify',
            };
        case 'suspend':
            return {
                title: `Suspend ${org.name}?`,
                body: `Members will lose access immediately and the workspace becomes read-only for superadmins only.`,
                consequences: [
                    'Block all sign-ins from members of this org',
                    'Pause cron jobs and integrations',
                    'Retain all data (this is reversible)',
                ],
                severity: 'medium',
                confirmLabel: 'Suspend',
            };
        case 'reactivate':
            return {
                title: `Reactivate ${org.name}?`,
                body: `Members regain access on next sign-in. Pause flags on integrations are not auto-restored.`,
                severity: 'medium',
                confirmLabel: 'Reactivate',
            };
        case 'archive':
            return {
                title: `Archive ${org.name}?`,
                body: `This marks the org as deleted. Data is retained for compliance but sign-ins are blocked.`,
                consequences: [
                    'Block all sign-ins permanently',
                    'Disable integrations and cron jobs',
                    'Preserve audit log and content for compliance',
                    'Reversible only by direct DB update',
                ],
                severity: 'high',
                confirmLabel: 'Archive',
                typedConfirm: org.slug,
                typedConfirmPrompt: <span>Type <code>{org.slug}</code> to archive</span>,
            };
    }
}

/* ───────── UI Components ───────── */

interface CreateOrgModalProps {
    open: boolean;
    onClose: () => void;
    name: string;
    onNameChange: (val: string) => void;
    slug: string;
    onSlugChange: (val: string) => void;
    domain: string;
    onDomainChange: (val: string) => void;
    plan: OrgPlan;
    onPlanChange: (val: OrgPlan) => void;
    adminEmail: string;
    onAdminEmailChange: (val: string) => void;
    adminName: string;
    onAdminNameChange: (val: string) => void;
    error: string | null;
    busy: boolean;
    onSubmit: () => void;
}

function CreateOrgModal({
    open, onClose, name, onNameChange, slug, onSlugChange,
    domain, onDomainChange, plan, onPlanChange,
    adminEmail, onAdminEmailChange, adminName, onAdminNameChange,
    error, busy, onSubmit,
}: CreateOrgModalProps) {
    if (!open) return null;

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim());
    const canSubmit = !busy && name.trim().length >= 2 && slug.length >= 2 && emailValid && domain.trim().length >= 3;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <div className="modal-header">
                    <h2 id="modal-title">Create organisation + first admin</h2>
                    <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={busy} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body">
                    <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                        Provisions an active organisation and creates the first admin (owner)
                        with an auto-generated temp password. The user is forced to change
                        their password on first sign-in.
                        <br /><br />
                        <strong>Domain verification:</strong> the primary domain starts as
                        <em> unverified</em>. After creation, you (or the new admin) must add
                        a TXT record to its DNS and click <strong>Recheck</strong> on the
                        Domains page. Until verified, the domain only acts as a label —
                        invites and DNS-based auto-join are not unlocked.
                    </p>

                    <div style={{ display: 'grid', gap: 16 }}>
                        <FormField label="Organisation name" required>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => onNameChange(e.target.value)}
                                placeholder="Acme Inc."
                                className="input-field"
                                autoFocus
                                disabled={busy}
                            />
                        </FormField>

                        <FormField label="Slug" hint="Lowercase letters, numbers, hyphens." required>
                            <input
                                type="text"
                                value={slug}
                                onChange={(e) => onSlugChange(e.target.value)}
                                placeholder="acme"
                                className="input-field"
                                disabled={busy}
                            />
                        </FormField>

                        <FormField label="Primary domain" hint="Inserted unverified — TXT record must be added before invites unlock. join_policy stays invite_only." required>
                            <input
                                type="text"
                                value={domain}
                                onChange={(e) => onDomainChange(e.target.value)}
                                placeholder="acme.com"
                                className="input-field"
                                disabled={busy}
                            />
                        </FormField>

                        <FormField label="Plan" required>
                            <select
                                value={plan}
                                onChange={(e) => onPlanChange(e.target.value as OrgPlan)}
                                className="select-field"
                                disabled={busy}
                            >
                                {PLANS.map((p) => (
                                    <option key={p} value={p} style={{ textTransform: 'capitalize' }}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                        </FormField>

                        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

                        <FormField label="First admin — full name" hint="Shown in greetings; optional.">
                            <input
                                type="text"
                                value={adminName}
                                onChange={(e) => onAdminNameChange(e.target.value)}
                                placeholder="Jane Smith"
                                className="input-field"
                                disabled={busy}
                            />
                        </FormField>

                        <FormField label="First admin — work email" required>
                            <input
                                type="email"
                                value={adminEmail}
                                onChange={(e) => onAdminEmailChange(e.target.value)}
                                placeholder="jane@acme.com"
                                className="input-field"
                                disabled={busy}
                            />
                        </FormField>
                    </div>

                    {error && (
                        <div className="auth-error" style={{ marginTop: 16 }}>
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={onSubmit}
                        disabled={!canSubmit}
                    >
                        {busy ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                Creating…
                            </>
                        ) : (
                            <>
                                <Plus size={14} />
                                Create
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

function FormField({ label, hint, required, children }: {
    label: string;
    hint?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="form-group">
            <label className="form-label">
                {label}
                {required && <span style={{ color: 'var(--status-error)', marginLeft: 4 }}>*</span>}
            </label>
            {children}
            {hint && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {hint}
                </div>
            )}
        </div>
    );
}

function OrgStatusBadge({ status }: { status: OrgStatus }) {
    const statusMap: Record<OrgStatus, string> = {
        active: 'badge-active',
        pending_claim: 'badge-pending',
        suspended: 'badge-warning',
        deleted: 'badge-inactive',
    };

    return (
        <span className={`badge ${statusMap[status] || 'badge-info'}`}>
            {status.replace('_', ' ')}
        </span>
    );
}
