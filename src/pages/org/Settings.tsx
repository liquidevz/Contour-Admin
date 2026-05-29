/**
 * Org → Settings
 *
 * General workspace settings: name, slug (read-only), website,
 * timezone, status; branding (logo URL); access controls
 * (member/guest panel access); and a "Manage domains →" link out
 * to /org/domains (the dedicated domain page).
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Settings as SettingsIcon, Globe, Loader2, Save, ArrowRight, AlertTriangle,
} from 'lucide-react';
import { useScope } from '../../context/ScopeContext';
import { supabase } from '../../lib/supabase';
import { isAdminTier } from '../../lib/org';
import { OrgPageShell, OrgStatusBadge } from '../../components/org';
import { useOrgToast, OrgToastBanner } from '../../hooks/useOrgDialog';
import FileUpload from '../../components/ui/FileUpload';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { CardSkeleton } from '../../components/ui/Skeletons';
import { toast as globalToast } from '../../components/ui/Toast';
import { orgUpdateBranding, orgUpdateLocale, orgUpdateDefaults } from '../../lib/org';

interface OrgRow {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    website: string | null;
    default_timezone: string | null;
    status: 'pending_claim' | 'active' | 'suspended' | 'deleted';
    plan: 'free' | 'pro' | 'business' | 'enterprise';
    settings: Record<string, any>;
    primary_domain_id: string | null;
    // 079/081 extensions
    brand_color:         string | null;
    cover_url:           string | null;
    industry:            string | null;
    org_type:            string | null;
    currency:            string | null;
    work_week_start:     string | null;
    work_week_days:      string[] | null;
    date_format:         string | null;
    time_format:         string | null;
    default_member_role: string | null;
}

const ORG_TYPES = ['company','agency','startup','school','nonprofit','club','internal_team','other'] as const;
const WEEK_DAYS = ['mon','tue','wed','thu','fri','sat','sun'] as const;

type MemberPanelAccess = 'full' | 'limited' | 'none';
type GuestPanelAccess = 'read_only' | 'none';

export default function OrgSettingsPage() {
    const navigate = useNavigate();
    const { scope, refresh: refreshScope } = useScope();
    const orgId = scope.orgId;
    const canEdit = isAdminTier(scope.role);

    const [org, setOrg] = useState<OrgRow | null>(null);
    const [domainCount, setDomainCount] = useState(0);
    const [verifiedDomainCount, setVerifiedDomainCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [website, setWebsite] = useState('');
    const [timezone, setTimezone] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    // ── Branding + identity (079/081)
    const [brandColor, setBrandColor] = useState('');
    const [coverUrl, setCoverUrl]     = useState('');
    const [industry, setIndustry]     = useState('');
    const [orgType, setOrgType]       = useState('');
    // ── Locale (081)
    const [currency, setCurrency]     = useState('');
    const [workWeekStart, setWeekStart] = useState('');
    const [workWeekDays, setWeekDays]   = useState<string[]>([]);
    const [dateFormat, setDateFormat]   = useState('');
    const [timeFormat, setTimeFormat]   = useState('');
    // ── Defaults
    const [defaultRole, setDefaultRole] = useState<'admin'|'manager'|'member'|'guest'>('member');
    const [memberAccess, setMemberAccess] = useState<MemberPanelAccess>('limited');
    const [guestAccess, setGuestAccess] = useState<GuestPanelAccess>('none');
    const [saving, setSaving] = useState(false);
    const { toast, show: showToast } = useOrgToast();

    const load = useCallback(async () => {
        if (!orgId) { setLoading(false); return; }
        setLoading(true); setError(null);
        try {
            const { data: o, error: e1 } = await supabase
                .from('organizations').select('*').eq('id', orgId).single();
            if (e1) throw e1;
            setOrg(o as OrgRow);
            const row = o as OrgRow;
            setName(row.name);
            setWebsite(row.website ?? '');
            setTimezone(row.default_timezone ?? '');
            setLogoUrl(row.logo_url ?? '');
            setBrandColor(row.brand_color ?? '');
            setCoverUrl(row.cover_url ?? '');
            setIndustry(row.industry ?? '');
            setOrgType(row.org_type ?? '');
            setCurrency(row.currency ?? '');
            setWeekStart(row.work_week_start ?? '');
            setWeekDays(row.work_week_days ?? []);
            setDateFormat(row.date_format ?? '');
            setTimeFormat(row.time_format ?? '');
            setDefaultRole((row.default_member_role as any) ?? 'member');

            const s = ((o as OrgRow).settings ?? {}) as Record<string, any>;
            setMemberAccess((s.member_panel_access ?? 'limited') as MemberPanelAccess);
            setGuestAccess((s.guest_panel_access ?? 'none') as GuestPanelAccess);

            // Lightweight domain summary so the "Manage domains" link
            // shows useful counts.
            const { data: ds } = await supabase
                .from('organization_domains')
                .select('id, verified', { count: 'exact' })
                .eq('org_id', orgId);
            setDomainCount(ds?.length ?? 0);
            setVerifiedDomainCount((ds ?? []).filter((d: any) => d.verified).length);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load org settings');
        } finally { setLoading(false); }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    const [dangerOpen, setDangerOpen] = useState(false);
    const [dangerBusy, setDangerBusy] = useState(false);

    const handleSave = async () => {
        if (!orgId || !org) return;
        setSaving(true);
        try {
            // Branding + locale + defaults go through dedicated RPCs (server-
            // side validates org_type / week_start / role enums).
            await Promise.all([
                orgUpdateBranding({
                    orgId,
                    brandColor: brandColor.trim() || null,
                    coverUrl:   coverUrl.trim()   || null,
                    industry:   industry.trim()   || null,
                    orgType:    (orgType as any)  || null,
                }),
                orgUpdateLocale({
                    orgId,
                    currency:       currency.trim()      || undefined,
                    timezone:       timezone.trim()      || undefined,
                    workWeekStart:  (workWeekStart as any) || undefined,
                    workWeekDays:   workWeekDays.length ? workWeekDays : undefined,
                    dateFormat:     dateFormat.trim()    || undefined,
                    timeFormat:     timeFormat.trim()    || undefined,
                }),
                orgUpdateDefaults(orgId, defaultRole),
            ]).catch(() => { /* the direct update below still runs */ });
            const newSettings = {
                ...org.settings,
                member_panel_access: memberAccess,
                guest_panel_access: guestAccess,
            };
            const { error: e } = await supabase
                .from('organizations')
                .update({
                    name: name.trim(),
                    website: website.trim() || null,
                    default_timezone: timezone.trim() || null,
                    logo_url: logoUrl.trim() || null,
                    settings: newSettings,
                })
                .eq('id', orgId);
            if (e) throw e;
            await refreshScope();
            await load();
            showToast('Settings saved');
        } catch (e: any) {
            showToast(e?.message ?? 'Could not save', 'error');
        } finally { setSaving(false); }
    };

    const handleLogoUploaded = async (publicUrl: string) => {
        if (!orgId) return;
        try {
            await supabase.from('organizations').update({ logo_url: publicUrl }).eq('id', orgId);
            setLogoUrl(publicUrl);
            await refreshScope();
            globalToast.success('Logo updated');
        } catch (e: any) {
            globalToast.error('Could not save logo', { detail: e?.message });
        }
    };

    const handleArchive = async () => {
        if (!orgId) return;
        setDangerBusy(true);
        try {
            const { error } = await supabase.rpc('admin_set_org_status', {
                p_org_id: orgId, p_status: 'deleted',
            });
            if (error) throw error;
            globalToast.success('Organisation archived');
            setDangerOpen(false);
            navigate('/');
        } catch (e: any) {
            globalToast.error('Could not archive', { detail: e?.message });
        } finally { setDangerBusy(false); }
    };

    if (loading) {
        return (
            <OrgPageShell title="Org Settings" icon={<SettingsIcon size={20} />}>
                <CardSkeleton lines={6} />
                <div style={{ height: 16 }} />
                <CardSkeleton lines={4} />
            </OrgPageShell>
        );
    }
    if (error || !org) {
        return (
            <OrgPageShell title="Org Settings" icon={<SettingsIcon size={20} />}>
                <div className="alert alert-error">{error ?? 'Not found'}</div>
            </OrgPageShell>
        );
    }

    return (
        <OrgPageShell
            title="Org Settings"
            subtitle="General workspace settings, branding, and access controls."
            icon={<SettingsIcon size={20} />}
            require="adminTier"
        >
            {/* General */}
            <section style={panel}>
                <h3 style={panelTitle}>General</h3>
                <div style={grid2}>
                    <Field label="Name">
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                            disabled={!canEdit} className="input-field" style={{ width: '100%' }} />
                    </Field>
                    <Field label="Slug" hint="Read-only. Used in URLs and invites.">
                        <input type="text" value={org.slug} disabled className="input-field" style={{ width: '100%' }} />
                    </Field>
                    <Field label="Website">
                        <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)}
                            disabled={!canEdit} placeholder="https://example.com"
                            className="input-field" style={{ width: '100%' }} />
                    </Field>
                    <Field label="Default timezone">
                        <input type="text" value={timezone} onChange={(e) => setTimezone(e.target.value)}
                            disabled={!canEdit} placeholder="Asia/Kolkata"
                            className="input-field" style={{ width: '100%' }} />
                    </Field>
                    <Field label="Plan">
                        <input type="text" value={org.plan} disabled className="input-field" style={{ width: '100%', textTransform: 'capitalize' }} />
                    </Field>
                    <Field label="Status">
                        <OrgStatusBadge status={org.status} />
                    </Field>
                </div>
            </section>

            {/* Branding */}
            <section style={{ ...panel, marginTop: 20 }}>
                <h3 style={panelTitle}>Branding</h3>
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                    {canEdit ? (
                        <FileUpload
                            folder={`${orgId}/logo`}
                            variant="logo"
                            currentUrl={logoUrl || null}
                            onUploaded={handleLogoUploaded}
                        />
                    ) : (
                        <div style={{
                            width: 120, height: 120, borderRadius: 8,
                            background: 'var(--bg-primary,#0a0a0f)',
                            border: '1px solid var(--border-subtle,#2a2a35)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden',
                        }}>
                            {logoUrl
                                ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-muted)' }}>{org.name[0]?.toUpperCase() ?? '?'}</span>
                            }
                        </div>
                    )}
                    <div style={{ flex: 1 }}>
                        <Field label="Logo URL" hint="Square image (PNG/JPG/SVG, up to 5 MB). Uploaded directly to org-assets storage.">
                            <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                                disabled={!canEdit}
                                placeholder="https://…/logo.png"
                                className="input-field" style={{ width: '100%' }} />
                        </Field>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                            Drop a file on the square to upload, or paste a CDN URL here and click Save.
                        </p>
                    </div>
                </div>
            </section>

            {/* Identity (079/081) */}
            <section style={{ ...panel, marginTop: 20 }}>
                <h3 style={panelTitle}>Identity</h3>
                <div style={grid2}>
                    <Field label="Brand colour" hint="Used as the accent across the mobile app for this org.">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                                type="color"
                                value={brandColor || '#0f5c52'}
                                onChange={(e) => setBrandColor(e.target.value)}
                                disabled={!canEdit}
                                style={{ width: 44, height: 32, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}
                            />
                            <input
                                type="text"
                                value={brandColor}
                                onChange={(e) => setBrandColor(e.target.value)}
                                disabled={!canEdit}
                                placeholder="#0F5C52"
                                className="input-field"
                                style={{ width: 130 }}
                            />
                        </div>
                    </Field>
                    <Field label="Cover image" hint="Wide hero banner on the workspace home. Drop a 1600×400 image.">
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            {canEdit && (
                                <FileUpload
                                    folder={`${orgId}/cover`}
                                    variant="generic"
                                    currentUrl={coverUrl || null}
                                    onUploaded={async (publicUrl) => {
                                        setCoverUrl(publicUrl);
                                        try {
                                            await orgUpdateBranding({ orgId: orgId!, coverUrl: publicUrl });
                                            globalToast.success('Cover updated');
                                        } catch (e: any) {
                                            globalToast.error('Save failed', { detail: e?.message });
                                        }
                                    }}
                                />
                            )}
                            <input
                                type="url" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)}
                                disabled={!canEdit}
                                placeholder="https://…/cover.jpg"
                                className="input-field" style={{ flex: 1 }}
                            />
                        </div>
                        {coverUrl && (
                            <div style={{
                                marginTop: 10,
                                width: '100%', height: 80, borderRadius: 6,
                                backgroundImage: `url(${coverUrl})`,
                                backgroundSize: 'cover', backgroundPosition: 'center',
                                border: '1px solid var(--border-subtle)',
                            }} />
                        )}
                    </Field>
                    <Field label="Organisation type">
                        <select
                            value={orgType}
                            onChange={(e) => setOrgType(e.target.value)}
                            disabled={!canEdit}
                            className="input-field" style={{ width: '100%' }}
                        >
                            <option value="">— Unspecified —</option>
                            {ORG_TYPES.map((t) => (
                                <option key={t} value={t} style={{ textTransform: 'capitalize' }}>
                                    {t.replace('_', ' ')}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Industry">
                        <input
                            type="text" value={industry} onChange={(e) => setIndustry(e.target.value)}
                            disabled={!canEdit}
                            placeholder="e.g. SaaS, Fintech, Logistics"
                            className="input-field" style={{ width: '100%' }}
                        />
                    </Field>
                </div>
            </section>

            {/* Locale + working hours (081) */}
            <section style={{ ...panel, marginTop: 20 }}>
                <h3 style={panelTitle}>Locale &amp; working hours</h3>
                <div style={grid2}>
                    <Field label="Currency" hint="ISO 4217 — e.g. INR, USD, EUR.">
                        <input
                            type="text" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                            disabled={!canEdit}
                            placeholder="INR"
                            className="input-field" style={{ width: 120 }}
                        />
                    </Field>
                    <Field label="Work week starts on">
                        <select
                            value={workWeekStart}
                            onChange={(e) => setWeekStart(e.target.value)}
                            disabled={!canEdit}
                            className="input-field" style={{ width: '100%' }}
                        >
                            <option value="">— Unspecified —</option>
                            <option value="monday">Monday</option>
                            <option value="sunday">Sunday</option>
                            <option value="saturday">Saturday</option>
                        </select>
                    </Field>
                    <Field label="Date format" hint="e.g. DD/MM/YYYY">
                        <input
                            type="text" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}
                            disabled={!canEdit}
                            placeholder="DD/MM/YYYY"
                            className="input-field" style={{ width: '100%' }}
                        />
                    </Field>
                    <Field label="Time format" hint="12 or 24">
                        <input
                            type="text" value={timeFormat} onChange={(e) => setTimeFormat(e.target.value)}
                            disabled={!canEdit}
                            placeholder="24"
                            className="input-field" style={{ width: '100%' }}
                        />
                    </Field>
                </div>
                <div style={{ marginTop: 12 }}>
                    <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
                        Working days
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {WEEK_DAYS.map((d) => {
                            const active = workWeekDays.includes(d);
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() => setWeekDays((cur) => active ? cur.filter((x) => x !== d) : [...cur, d])}
                                    style={{
                                        padding: '6px 12px', borderRadius: 6, fontSize: 12, textTransform: 'uppercase',
                                        border: '1px solid var(--border-subtle)',
                                        background: active ? 'rgba(99,102,241,0.18)' : 'transparent',
                                        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                                        cursor: canEdit ? 'pointer' : 'default',
                                    }}
                                >
                                    {d}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Member defaults */}
            <section style={{ ...panel, marginTop: 20 }}>
                <h3 style={panelTitle}>Member defaults</h3>
                <div style={grid2}>
                    <Field label="Default role for new members" hint="Assigned when someone joins via auto-join or approved request.">
                        <select
                            value={defaultRole}
                            onChange={(e) => setDefaultRole(e.target.value as any)}
                            disabled={!canEdit}
                            className="input-field" style={{ width: '100%' }}
                        >
                            <option value="admin">admin</option>
                            <option value="manager">manager</option>
                            <option value="member">member</option>
                            <option value="guest">guest</option>
                        </select>
                    </Field>
                </div>
            </section>

            {/* Access controls */}
            <section style={{ ...panel, marginTop: 20 }}>
                <h3 style={panelTitle}>Access</h3>
                <p style={hintP}>
                    Control what regular members and guests can see in the admin panel. Admin
                    and owner are always granted full access regardless of these settings.
                </p>
                <div style={grid2}>
                    <Field label="Member panel access" hint={memberHint(memberAccess)}>
                        <select value={memberAccess} onChange={(e) => setMemberAccess(e.target.value as MemberPanelAccess)}
                            disabled={!canEdit} className="input-field" style={{ width: '100%' }}>
                            <option value="full">Full — see everything admins see</option>
                            <option value="limited">Limited — own work + directory only</option>
                            <option value="none">None — mobile app only</option>
                        </select>
                    </Field>
                    <Field label="Guest panel access" hint={guestHint(guestAccess)}>
                        <select value={guestAccess} onChange={(e) => setGuestAccess(e.target.value as GuestPanelAccess)}
                            disabled={!canEdit} className="input-field" style={{ width: '100%' }}>
                            <option value="read_only">Read-only — single project / team</option>
                            <option value="none">None</option>
                        </select>
                    </Field>
                </div>
            </section>

            {/* Domains link-out */}
            <section style={{ ...panel, marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 8,
                        background: 'rgba(99,102,241,0.15)', color: '#a5a8ff',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Globe size={20} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>Email domains</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted,#8a8a96)', marginTop: 2 }}>
                            {verifiedDomainCount} verified · {domainCount - verifiedDomainCount} pending · {domainCount} total
                        </div>
                    </div>
                    <button className="btn btn-ghost" onClick={() => navigate('/org/domains')}>
                        Manage domains <ArrowRight size={14} style={{ marginLeft: 6 }} />
                    </button>
                </div>
            </section>

            {/* Save */}
            {canEdit && (
                <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                        <span style={{ marginLeft: 6 }}>Save changes</span>
                    </button>
                </div>
            )}

            {/* Danger zone (owner only) */}
            {scope.role === 'owner' && (
                <section style={{
                    ...panel,
                    marginTop: 40,
                    borderColor: 'rgba(239,68,68,0.3)',
                    background: 'rgba(239,68,68,0.04)',
                }}>
                    <h3 style={{ ...panelTitle, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={16} /> Danger zone
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>Archive this organisation</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                Members lose access immediately. Data retained for compliance.
                                Reversible only by a platform superadmin.
                            </div>
                        </div>
                        <button
                            className="btn"
                            style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                            onClick={() => setDangerOpen(true)}
                        >
                            Archive…
                        </button>
                    </div>
                </section>
            )}

            <OrgToastBanner toast={toast} />

            <ConfirmModal
                open={dangerOpen}
                onClose={() => !dangerBusy && setDangerOpen(false)}
                onConfirm={handleArchive}
                title={`Archive ${org.name}?`}
                body={
                    <p style={{ margin: 0 }}>
                        Every member will lose access to this workspace immediately. The
                        data is retained for compliance, but this is irreversible from
                        the org admin side — only a platform superadmin can restore it.
                    </p>
                }
                consequences={[
                    'Block sign-in for every member',
                    'Disable all integrations and cron jobs',
                    'Preserve audit log and content',
                ]}
                severity="high"
                confirmLabel="Archive organisation"
                typedConfirm={org.slug}
                typedConfirmPrompt={<span>Type <code>{org.slug}</code> to archive</span>}
                busy={dangerBusy}
            />
        </OrgPageShell>
    );
}

function memberHint(v: MemberPanelAccess): string {
    return v === 'full'    ? 'Members get the same admin panel as admins. Most teams should NOT pick this.'
         : v === 'limited' ? 'Members see only their own tasks, the directory, and their profile. Recommended.'
         :                   'Members cannot sign in to the admin panel at all; mobile app only.';
}
function guestHint(v: GuestPanelAccess): string {
    return v === 'read_only' ? 'Guests can view the single project / team they were added to.'
                             : 'Guests cannot sign in to the admin panel.';
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-muted,#8a8a96)', marginBottom: 4 }}>
                {label}
            </label>
            {children}
            {hint && <div style={{ fontSize: 11, color: 'var(--text-muted,#8a8a96)', marginTop: 4 }}>{hint}</div>}
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
const hintP: React.CSSProperties = { color: 'var(--text-muted,#8a8a96)', fontSize: 13, marginTop: 0, marginBottom: 14 };
