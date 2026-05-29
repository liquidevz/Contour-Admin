/**
 * Organisation module — Supabase RPC wrappers.
 *
 * Mirrors the mobile-app lib/org.ts so the two clients share
 * one API surface against migrations 057–073. All RPCs are
 * defined in those migrations; RLS enforces every operation
 * server-side regardless of which client calls.
 *
 * ── Data isolation guarantee ──
 * Every org table is protected by an RLS policy that requires
 * `user_is_org_member(org_id, auth.uid())` (see 057_org_foundation.sql
 * §RLS). Direct `supabase.from()` queries on the client are limited
 * by those policies — even if a page forgets to `.eq('org_id', X)`,
 * the user only sees rows for orgs they belong to.
 *
 * Tables enforcing per-org isolation via RLS:
 *   - organizations              (via owner/member RLS)
 *   - organization_members       (read = member of same org)
 *   - organization_domains       (read = member of same org)
 *   - organization_invites       (read/write = admin tier of same org)
 *   - organization_audit_log     (read = admin tier; insert via SECURITY DEFINER only)
 *   - teams + team_members       (scoped via parent org)
 *   - org_projects, org_tasks    (scoped via parent org)
 *   - org_transactions           (scoped via parent org)
 *   - org_events                 (scoped via parent org)
 *
 * Client-side `.eq('org_id', orgId)` is therefore defence-in-depth
 * and a performance optimization (smaller result set), not a
 * security boundary.
 */

import { supabase } from './supabase';

export type OrgRole = 'owner' | 'admin' | 'manager' | 'member' | 'guest';
export type OrgMemberStatus = 'active' | 'invited' | 'suspended' | 'left';
export type OrgStatus = 'pending_claim' | 'active' | 'suspended' | 'deleted';
export type OrgPlan = 'free' | 'pro' | 'business' | 'enterprise';
export type JoinPolicy = 'auto_join' | 'request_approval' | 'invite_only';
export type TeamRole = 'team_lead' | 'team_member' | 'team_guest';

export interface OrgMembership {
    org_id: string;
    org_name: string;
    org_slug: string;
    org_logo_url: string | null;
    org_status: OrgStatus;
    role: OrgRole;
    status: OrgMemberStatus;
    joined_at: string | null;
}

export interface Organization {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    website: string | null;
    plan: OrgPlan;
    status: OrgStatus;
    default_locale: string | null;
    default_timezone: string | null;
    primary_domain_id: string | null;
    owner_user_id: string | null;
    settings: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface OrgMemberRow {
    user_id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
    role: OrgRole;
    status: OrgMemberStatus;
    job_title: string | null;
    department: string | null;
    manager_user_id: string | null;
    joined_at: string | null;
    last_active_at: string | null;
}

export interface OrgInviteRow {
    id: string;
    org_id: string;
    /** Email is now nullable — phone-only invites and shareable links can both omit it. */
    email: string | null;
    /** Phone-only invite path (migration 081/084). */
    phone: string | null;
    role: OrgRole;
    team_ids: string[];
    token: string;
    /** opened/failed/converted added in 081. */
    status: 'pending' | 'opened' | 'accepted' | 'revoked' | 'expired' | 'failed' | 'converted';
    invited_by: string | null;
    accepted_at: string | null;
    /** When the recipient first opened the link (081). */
    opened_at: string | null;
    /** Captured by the email sender on the last failed delivery, if any. */
    last_error: string | null;
    expires_at: string;
    created_at: string;
}

export interface TeamRow {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    parent_team_id: string | null;
    lead_user_id: string | null;
    color: string | null;
    icon: string | null;
    member_count: number;
    archived_at: string | null;
    created_at: string;
}

export interface TeamDetail {
    team: {
        id: string;
        org_id: string;
        name: string;
        slug: string;
        description: string | null;
        parent_team_id: string | null;
        lead_user_id: string | null;
        color: string | null;
        icon: string | null;
        archived_at: string | null;
        created_at: string;
        updated_at: string;
    };
    members: Array<{
        user_id: string;
        email: string | null;
        display_name: string | null;
        avatar_url: string | null;
        role: TeamRole;
        added_at: string;
    }>;
}

/* ───────────── membership & switcher ───────────── */

export async function orgMyMemberships(): Promise<OrgMembership[]> {
    const { data, error } = await supabase.rpc('org_my_memberships');
    if (error) throw error;
    return (data ?? []) as OrgMembership[];
}

/* ───────────── members ───────────── */

export async function orgListMembers(orgId: string): Promise<OrgMemberRow[]> {
    const { data, error } = await supabase.rpc('org_list_members', { p_org_id: orgId });
    if (error) throw error;
    return (data ?? []) as OrgMemberRow[];
}

export async function orgUpdateMember(input: {
    orgId: string;
    userId: string;
    role?: OrgRole;
    status?: OrgMemberStatus;
    jobTitle?: string;
    department?: string;
    managerUserId?: string;
}): Promise<void> {
    const { error } = await supabase.rpc('org_update_member', {
        p_org_id: input.orgId,
        p_user_id: input.userId,
        p_role: input.role ?? null,
        p_status: input.status ?? null,
        p_job_title: input.jobTitle ?? null,
        p_department: input.department ?? null,
        p_manager_user_id: input.managerUserId ?? null,
    });
    if (error) throw error;
}

export async function orgRemoveMember(orgId: string, userId: string): Promise<void> {
    const { error } = await supabase.rpc('org_remove_member', {
        p_org_id: orgId,
        p_user_id: userId,
    });
    if (error) throw error;
}

export async function orgTransferOwnership(orgId: string, toUserId: string): Promise<void> {
    const { error } = await supabase.rpc('org_transfer_ownership', {
        p_org_id: orgId,
        p_to_user_id: toUserId,
    });
    if (error) throw error;
}

/* ───────────── invites ───────────── */

export async function orgInviteMemberPhone(input: {
    orgId: string;
    phone: string;
    role?: OrgRole;
    teamIds?: string[];
}): Promise<{ ok: boolean; invite_id: string; token: string; expires_at: string; phone: string; role: OrgRole }> {
    const { data, error } = await supabase.rpc('org_invite_member_phone', {
        p_org_id:   input.orgId,
        p_phone:    input.phone,
        p_role:     input.role ?? 'member',
        p_team_ids: input.teamIds ?? [],
    });
    if (error) throw error;
    return data;
}

export async function orgInviteMember(input: {
    orgId: string;
    email: string;
    role?: OrgRole;
    teamIds?: string[];
}) {
    const { data, error } = await supabase.rpc('org_invite_member', {
        p_org_id: input.orgId,
        p_email: input.email,
        p_role: input.role ?? 'member',
        p_team_ids: input.teamIds ?? [],
    });
    if (error) throw error;
    return data as {
        ok: boolean; invite_id: string; token: string; expires_at: string;
        email: string; role: OrgRole;
    };
}

export async function orgRevokeInvite(inviteId: string): Promise<void> {
    const { error } = await supabase.rpc('org_revoke_invite', { p_invite_id: inviteId });
    if (error) throw error;
}

export async function orgResendInvite(inviteId: string) {
    const { data, error } = await supabase.rpc('org_resend_invite', { p_invite_id: inviteId });
    if (error) throw error;
    return data as { ok: boolean; token: string; expires_at: string };
}

export async function orgListInvites(orgId: string): Promise<OrgInviteRow[]> {
    const { data, error } = await supabase
        .from('organization_invites')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as OrgInviteRow[];
}

/* ───────────── teams ───────────── */

export async function teamList(orgId: string): Promise<TeamRow[]> {
    const { data, error } = await supabase.rpc('team_list', { p_org_id: orgId });
    if (error) throw error;
    return (data ?? []) as TeamRow[];
}

export async function teamGet(teamId: string): Promise<TeamDetail> {
    const { data, error } = await supabase.rpc('team_get', { p_team_id: teamId });
    if (error) throw error;
    return data as TeamDetail;
}

export async function teamCreate(input: {
    orgId: string;
    name: string;
    slug?: string;
    parentTeamId?: string;
}): Promise<string> {
    const { data, error } = await supabase.rpc('team_create', {
        p_org_id: input.orgId,
        p_name: input.name,
        p_slug: input.slug ?? null,
        p_parent_team_id: input.parentTeamId ?? null,
    });
    if (error) throw error;
    return data as string;
}

export async function teamUpdate(input: {
    teamId: string;
    name?: string;
    description?: string;
    parentTeamId?: string;
    leadUserId?: string;
    color?: string;
    icon?: string;
}): Promise<void> {
    const { error } = await supabase.rpc('team_update', {
        p_team_id: input.teamId,
        p_name: input.name ?? null,
        p_description: input.description ?? null,
        p_parent_team_id: input.parentTeamId ?? null,
        p_lead_user_id: input.leadUserId ?? null,
        p_color: input.color ?? null,
        p_icon: input.icon ?? null,
    });
    if (error) throw error;
}

export async function teamArchive(teamId: string, archive = true): Promise<void> {
    const { error } = await supabase.rpc('team_archive', { p_team_id: teamId, p_archive: archive });
    if (error) throw error;
}

export async function teamAddMember(input: {
    teamId: string;
    userId: string;
    role?: TeamRole;
}): Promise<void> {
    const { error } = await supabase.rpc('team_add_member', {
        p_team_id: input.teamId,
        p_user_id: input.userId,
        p_role: input.role ?? 'team_member',
    });
    if (error) throw error;
}

export async function teamRemoveMember(teamId: string, userId: string): Promise<void> {
    const { error } = await supabase.rpc('team_remove_member', {
        p_team_id: teamId,
        p_user_id: userId,
    });
    if (error) throw error;
}

/* ───────────── domain verification ───────────── */

/* ───────────── domain management (P2.x) ───────────── */

export interface OrgDomainRow {
    id: string;
    org_id: string;
    domain: string;
    verified: boolean;
    verification_token: string;
    verification_method: 'dns_txt' | 'email' | 'admin_override' | null;
    join_policy: JoinPolicy;
    verified_at: string | null;
    created_at: string;
}

export interface DomainCheckLogRow {
    id: number;
    checked_at: string;
    resolved: boolean;
    found_tokens: string[] | null;
    expected_token: string | null;
    notes: string | null;
}

export async function orgListDomains(orgId: string): Promise<OrgDomainRow[]> {
    const { data, error } = await supabase
        .from('organization_domains')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at');
    if (error) throw error;
    return (data ?? []) as OrgDomainRow[];
}

export async function orgAddDomain(orgId: string, domain: string, joinPolicy: JoinPolicy = 'invite_only') {
    const { data, error } = await supabase.rpc('org_add_domain', {
        p_org_id: orgId,
        p_domain: domain,
        p_join_policy: joinPolicy,
    });
    if (error) throw error;
    return data as { ok: boolean; id: string; domain: string; dns_record: { host: string; type: 'TXT'; value: string } };
}

export async function orgRemoveDomain(domainId: string) {
    const { error } = await supabase.rpc('org_remove_domain', { p_domain_id: domainId });
    if (error) throw error;
}

export async function orgRecheckDomain(domainId: string, rotateToken = false) {
    const { data, error } = await supabase.rpc('org_recheck_domain', {
        p_domain_id: domainId,
        p_rotate_token: rotateToken,
    });
    if (error) throw error;
    return data as { ok: boolean; domain: string; verified: boolean; dns_record: { host: string; type: 'TXT'; value: string } };
}

export async function orgSetDomainJoinPolicy(domainId: string, joinPolicy: JoinPolicy) {
    const { error } = await supabase
        .from('organization_domains')
        .update({ join_policy: joinPolicy })
        .eq('id', domainId);
    if (error) throw error;
}

export async function orgListDomainCheckLogs(domainId: string, limit = 20): Promise<DomainCheckLogRow[]> {
    const { data, error } = await supabase.rpc('org_list_domain_check_logs', {
        p_domain_id: domainId,
        p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as DomainCheckLogRow[];
}

export async function orgBulkInvite(orgId: string, emails: string[], role: OrgRole = 'member') {
    const { data, error } = await supabase.rpc('org_bulk_invite', {
        p_org_id: orgId,
        p_emails: emails,
        p_role: role,
    });
    if (error) throw error;
    return data as {
        ok: boolean;
        results: Array<{ email: string; ok: boolean; error?: string; invite_id?: string; token?: string }>;
    };
}

export async function orgResendInviteEmailOnly(inviteId: string) {
    const { error } = await supabase.rpc('org_resend_invite_email_only', { p_invite_id: inviteId });
    if (error) throw error;
}

/**
 * Trigger the verify-org-domains edge function. Two modes:
 *   - No argument → kicks off the cron-style batch run, returns nothing useful.
 *   - With domainId → runs a synchronous DNS check on that one domain
 *     (bypassing the cron throttle) and returns the actual pass/fail
 *     result so the admin UI can show "Verified ✓" / "TXT not found yet"
 *     immediately.
 */
export interface DnsVerifyResult {
    domain: string;
    resolved: boolean;
    found: string[];
    expected: string;
    notes: string | null;
}

export async function triggerDnsVerifyEdgeFn(domainId?: string): Promise<DnsVerifyResult | null> {
    try {
        const { data, error } = await supabase.functions.invoke('verify-org-domains', {
            body: domainId ? { domain_id: domainId } : undefined,
        });
        if (error) throw error;
        const res = (data ?? {}) as { result?: DnsVerifyResult | null };
        return res.result ?? null;
    } catch (err) {
        // Surface the error to the caller; the Domains page formats it.
        throw err;
    }
}

export async function orgRequestDomainVerification(
    orgId: string,
    domain: string,
    method: 'dns_txt' | 'email' = 'dns_txt',
) {
    const { data, error } = await supabase.rpc('org_request_domain_verification', {
        p_org_id: orgId,
        p_domain: domain,
        p_method: method,
    });
    if (error) throw error;
    return data as {
        ok: boolean;
        domain: string;
        method: 'dns_txt' | 'email';
        token: string;
        dns_record: { host: string; type: 'TXT'; value: string } | null;
    };
}

/* ───────────── super-admin ops (platform_admin only) ───────────── */

export interface AdminOrgRow {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    plan: OrgPlan;
    status: OrgStatus;
    owner_user_id: string | null;
    owner_email: string | null;
    primary_domain: string | null;
    primary_verified: boolean;
    member_count: number;
    team_count: number;
    created_at: string;
    updated_at: string;
}

export async function adminListOrganizations(input: {
    search?: string;
    status?: OrgStatus | null;
    limit?: number;
    offset?: number;
} = {}): Promise<AdminOrgRow[]> {
    const { data, error } = await supabase.rpc('admin_list_organizations', {
        p_search: input.search ?? null,
        p_status: input.status ?? null,
        p_limit: input.limit ?? 50,
        p_offset: input.offset ?? 0,
    });
    if (error) throw error;
    return (data ?? []) as AdminOrgRow[];
}

export async function adminSetOrgStatus(orgId: string, status: OrgStatus): Promise<void> {
    const { error } = await supabase.rpc('admin_set_org_status', {
        p_org_id: orgId,
        p_status: status,
    });
    if (error) throw error;
}

export async function adminVerifyOrgDomain(domainId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_verify_org_domain', {
        p_domain_id: domainId,
    });
    if (error) throw error;
}

export async function adminCreateOrganization(input: {
    name: string;
    slug: string;
    ownerUserId?: string;
    domain?: string;
    logoUrl?: string;
    website?: string;
    plan?: OrgPlan;
}): Promise<{ ok: boolean; org_id: string; slug: string; domain: string | null }> {
    const { data, error } = await supabase.rpc('admin_create_organization', {
        p_name: input.name,
        p_slug: input.slug,
        p_owner_user_id: input.ownerUserId ?? null,
        p_domain: input.domain ?? null,
        p_logo_url: input.logoUrl ?? null,
        p_website: input.website ?? null,
        p_plan: input.plan ?? 'free',
    });
    if (error) throw error;
    return data;
}

export async function adminEnterOrg(orgId: string): Promise<{ ok: boolean; role: OrgRole }> {
    const { data, error } = await supabase.rpc('admin_enter_org', { p_org_id: orgId });
    if (error) throw error;
    return data;
}

export async function adminGetOrgSummary(orgId: string) {
    const { data, error } = await supabase.rpc('admin_get_org_summary', {
        p_org_id: orgId,
    });
    if (error) throw error;
    return data as {
        org: any;
        domains: Array<{
            id: string; domain: string; verified: boolean;
            join_policy: JoinPolicy; verified_at: string | null;
        }>;
        members: { total: number; active: number; invited: number; suspended: number };
    };
}

/* ───────────── join requests (migration 079/080) ───────────── */

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'expired';

export interface JoinRequestRow {
    id:               string;
    user_id:          string;
    email_at_request: string;
    display_name:     string | null;
    message:          string | null;
    status:           JoinRequestStatus;
    desired_role:     string;
    reviewed_by:      string | null;
    reviewed_at:      string | null;
    decision_note:    string | null;
    created_at:       string;
    expires_at:       string;
}

export async function orgListJoinRequests(input: {
    orgId:   string;
    status?: JoinRequestStatus | 'all';
    limit?:  number;
    offset?: number;
}): Promise<JoinRequestRow[]> {
    const { data, error } = await supabase.rpc('org_list_join_requests', {
        p_org_id: input.orgId,
        p_status: input.status ?? 'pending',
        p_limit:  input.limit ?? 50,
        p_offset: input.offset ?? 0,
    });
    if (error) throw error;
    return (data ?? []) as JoinRequestRow[];
}

export async function orgApproveJoinRequest(input: {
    requestId: string;
    role?:     OrgRole;
    note?:     string;
}) {
    const { data, error } = await supabase.rpc('org_approve_join_request', {
        p_request_id: input.requestId,
        p_role:       input.role ?? 'member',
        p_note:       input.note ?? null,
    });
    if (error) throw error;
    return data;
}

export async function orgRejectJoinRequest(requestId: string, note?: string) {
    const { error } = await supabase.rpc('org_reject_join_request', {
        p_request_id: requestId,
        p_note:       note ?? null,
    });
    if (error) throw error;
}

/* ───────────── departments (migration 079/080) ───────────── */

export interface DepartmentRow {
    id:                   string;
    name:                 string;
    slug:                 string;
    description:          string | null;
    parent_department_id: string | null;
    head_user_id:         string | null;
    head_display_name:    string | null;
    member_count:         number;
    archived_at:          string | null;
    created_at:           string;
}

export async function departmentList(orgId: string, includeArchived = false): Promise<DepartmentRow[]> {
    const { data, error } = await supabase.rpc('department_list', {
        p_org_id: orgId,
        p_include_archived: includeArchived,
    });
    if (error) throw error;
    return (data ?? []) as DepartmentRow[];
}

export async function departmentCreate(input: {
    orgId:        string;
    name:         string;
    slug?:        string;
    description?: string;
    parentId?:    string;
    headUserId?:  string;
}): Promise<string> {
    const { data, error } = await supabase.rpc('department_create', {
        p_org_id:               input.orgId,
        p_name:                 input.name,
        p_slug:                 input.slug ?? null,
        p_description:          input.description ?? null,
        p_parent_department_id: input.parentId ?? null,
        p_head_user_id:         input.headUserId ?? null,
    });
    if (error) throw error;
    return data as string;
}

export async function departmentUpdate(input: {
    departmentId: string;
    name?:        string;
    description?: string;
    parentId?:    string;
    headUserId?:  string;
}): Promise<void> {
    const { error } = await supabase.rpc('department_update', {
        p_department_id:        input.departmentId,
        p_name:                 input.name ?? null,
        p_description:          input.description ?? null,
        p_parent_department_id: input.parentId ?? null,
        p_head_user_id:         input.headUserId ?? null,
    });
    if (error) throw error;
}

export async function departmentArchive(departmentId: string, archive = true): Promise<void> {
    const { error } = await supabase.rpc('department_archive', {
        p_department_id: departmentId,
        p_archive:       archive,
    });
    if (error) throw error;
}

/* ───────────── member status history (migration 079/080) ───────────── */

export interface MemberHistoryRow {
    id:              string;
    changed_by:      string | null;
    changed_by_name: string | null;
    old_role:        string | null;
    new_role:        string | null;
    old_status:      string | null;
    new_status:      string | null;
    reason:          string | null;
    created_at:      string;
}

export async function memberHistory(input: {
    orgId:  string;
    userId: string;
    limit?: number;
    offset?: number;
}): Promise<MemberHistoryRow[]> {
    const { data, error } = await supabase.rpc('member_history', {
        p_org_id:  input.orgId,
        p_user_id: input.userId,
        p_limit:   input.limit ?? 50,
        p_offset:  input.offset ?? 0,
    });
    if (error) throw error;
    return (data ?? []) as MemberHistoryRow[];
}

/* ───────────── custom roles (migration 081/082) ───────────── */

export interface CustomRoleRow {
    id:               string;
    name:             string;
    slug:             string;
    description:      string | null;
    base_role:        'admin' | 'manager' | 'member' | 'guest';
    is_archived:      boolean;
    member_count:     number;
    permission_count: number;
    created_at:       string;
}

export async function orgCustomRoleList(orgId: string, includeArchived = false): Promise<CustomRoleRow[]> {
    const { data, error } = await supabase.rpc('org_custom_role_list', {
        p_org_id: orgId, p_include_archived: includeArchived,
    });
    if (error) throw error;
    return (data ?? []) as CustomRoleRow[];
}

export async function orgCustomRoleCreate(input: {
    orgId: string; name: string; slug?: string; description?: string;
    baseRole?: 'admin' | 'manager' | 'member' | 'guest';
}): Promise<string> {
    const { data, error } = await supabase.rpc('org_custom_role_create', {
        p_org_id: input.orgId, p_name: input.name,
        p_slug: input.slug ?? null, p_description: input.description ?? null,
        p_base_role: input.baseRole ?? 'member',
    });
    if (error) throw error;
    return data as string;
}

export async function orgCustomRoleUpdate(input: {
    roleId: string; name?: string; description?: string;
    baseRole?: 'admin' | 'manager' | 'member' | 'guest';
}): Promise<void> {
    const { error } = await supabase.rpc('org_custom_role_update', {
        p_role_id: input.roleId, p_name: input.name ?? null,
        p_description: input.description ?? null,
        p_base_role: input.baseRole ?? null,
    });
    if (error) throw error;
}

export async function orgCustomRoleArchive(roleId: string, archive = true): Promise<void> {
    const { error } = await supabase.rpc('org_custom_role_archive', {
        p_role_id: roleId, p_archive: archive,
    });
    if (error) throw error;
}

/**
 * Replace the permission set for a custom role with the given keys.
 * Keys are strings like 'member.invite', 'audit.view' — sourced from
 * the public.permissions table's (resource, action) tuple.
 */
export async function orgCustomRoleSetPermissions(roleId: string, permissionKeys: string[]): Promise<void> {
    const { error } = await supabase.rpc('org_custom_role_set_permissions', {
        p_role_id: roleId, p_permission_keys: permissionKeys,
    });
    if (error) throw error;
}

export async function orgAssignCustomRole(orgId: string, userId: string, customRoleId: string | null): Promise<void> {
    const { error } = await supabase.rpc('org_assign_custom_role', {
        p_org_id: orgId, p_user_id: userId, p_custom_role_id: customRoleId,
    });
    if (error) throw error;
}

/**
 * Permission row — derived from the composite-primary-key `permissions`
 * table from 057 §10. We synthesise a `key` of the form `resource.action`
 * since the table itself has no surrogate id and no `key` column.
 */
export interface PermissionRow {
    key:         string;   // 'member.invite', 'audit.view', etc.
    scope:       string;
    role:        string;
    resource:    string;
    action:      string;
    allow:       boolean;
}

export async function permissionsList(): Promise<PermissionRow[]> {
    const { data, error } = await supabase
        .from('permissions')
        .select('scope, role, resource, action, allow')
        .eq('allow', true)
        .order('resource')
        .order('action');
    if (error) throw error;
    // De-duplicate to one row per (resource, action) — multiple roles in
    // `permissions` may grant the same key, but for the custom-role picker
    // we just want the distinct list of capabilities.
    const seen = new Set<string>();
    const out: PermissionRow[] = [];
    for (const r of (data ?? []) as any[]) {
        const key = `${r.resource}.${r.action}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, scope: r.scope, role: r.role, resource: r.resource, action: r.action, allow: r.allow });
    }
    return out;
}

/** Returns the permission keys currently assigned to a custom role. */
export async function customRolePermissionKeys(roleId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from('organization_custom_role_permissions')
        .select('permission_key')
        .eq('custom_role_id', roleId);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.permission_key as string);
}

/* ───────────── branding / locale / defaults (082) ───────────── */

export async function orgUpdateBranding(input: {
    orgId: string;
    brandColor?: string | null;
    coverUrl?:   string | null;
    industry?:   string | null;
    orgType?:    'company' | 'agency' | 'startup' | 'school' | 'nonprofit' | 'club' | 'internal_team' | 'other' | null;
}): Promise<void> {
    const { error } = await supabase.rpc('org_update_branding', {
        p_org_id:      input.orgId,
        p_brand_color: input.brandColor ?? null,
        p_cover_url:   input.coverUrl   ?? null,
        p_industry:    input.industry   ?? null,
        p_org_type:    input.orgType    ?? null,
    });
    if (error) throw error;
}

export async function orgUpdateLocale(input: {
    orgId: string;
    currency?:      string;
    timezone?:      string;
    workWeekStart?: 'sunday' | 'monday' | 'saturday';
    workWeekDays?:  string[];
    dateFormat?:    string;
    timeFormat?:    string;
}): Promise<void> {
    const { error } = await supabase.rpc('org_update_locale', {
        p_org_id:          input.orgId,
        p_currency:        input.currency      ?? null,
        p_timezone:        input.timezone      ?? null,
        p_work_week_start: input.workWeekStart ?? null,
        p_work_week_days:  input.workWeekDays  ?? null,
        p_date_format:     input.dateFormat    ?? null,
        p_time_format:     input.timeFormat    ?? null,
    });
    if (error) throw error;
}

export async function orgUpdateDefaults(orgId: string, defaultMemberRole: 'admin' | 'manager' | 'member' | 'guest'): Promise<void> {
    const { error } = await supabase.rpc('org_update_defaults', {
        p_org_id: orgId, p_default_member_role: defaultMemberRole,
    });
    if (error) throw error;
}

/* ───────────── invite enhancements (082) ───────────── */

export async function orgCreateShareLink(orgId: string, role: 'admin' | 'manager' | 'member' | 'guest' = 'member', expiresDays = 14): Promise<{ ok: boolean; token: string; id: string }> {
    const { data, error } = await supabase.rpc('org_create_share_link', {
        p_org_id: orgId, p_role: role, p_expires_days: expiresDays,
    });
    if (error) throw error;
    return data;
}

export async function orgInviteMarkOpened(token: string): Promise<void> {
    const { error } = await supabase.rpc('org_invite_mark_opened', { p_token: token });
    if (error) throw error;
}

/* ───────────── department assignment (082) ───────────── */

export async function orgAssignDepartment(orgId: string, userIds: string[], departmentId: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('org_assign_department', {
        p_org_id: orgId, p_user_ids: userIds, p_department_id: departmentId,
    });
    if (error) throw error;
    return (data?.affected ?? 0) as number;
}

/* ───────────── sign-in throttle (082) ───────────── */

export async function signInRateCheck(email: string): Promise<{ ok: boolean; retry_after_seconds?: number; reason?: string }> {
    const { data, error } = await supabase.rpc('sign_in_rate_check', { p_email: email });
    if (error) throw error;
    return data;
}

export async function signInRecordAttempt(email: string, succeeded: boolean, errorMsg?: string): Promise<void> {
    try {
        await supabase.rpc('sign_in_record_attempt', {
            p_email: email, p_succeeded: succeeded, p_error_msg: errorMsg ?? null,
        });
    } catch { /* best-effort metric — never block sign-in on a logging failure */ }
}

/* ───────────── member activity (081 view) ───────────── */

export interface MemberActivityRow {
    id:              string;
    actor_user_id:   string | null;
    action:          string;
    resource_type:   string | null;
    resource_id:     string | null;
    activity_bucket: 'task' | 'project' | 'comment' | 'invite' | 'member' | 'department' | 'team' | 'other';
    after:           any;
    created_at:      string;
}

export async function orgMemberActivity(input: {
    orgId:   string;
    bucket?: MemberActivityRow['activity_bucket'] | null;
    limit?:  number;
    offset?: number;
}): Promise<MemberActivityRow[]> {
    let q = supabase
        .from('organization_member_activity')
        .select('id, actor_user_id, action, resource_type, resource_id, activity_bucket, after, created_at')
        .eq('org_id', input.orgId)
        .order('created_at', { ascending: false })
        .range(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 50) - 1);
    if (input.bucket) q = q.eq('activity_bucket', input.bucket);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MemberActivityRow[];
}

/* ───────────── audit log (migration 073) ───────────── */

export interface AuditRow {
    id:             string;
    created_at:     string;
    actor_user_id:  string | null;
    actor_email:    string | null;
    actor_name:     string | null;
    action:         string;
    resource_type:  string | null;
    resource_id:    string | null;
    before:         any;
    after:          any;
}

export async function orgAuditList(input: {
    orgId:        string;
    actorId?:     string | null;
    action?:      string | null;
    resourceType?: string | null;
    since?:       string | null;
    until?:       string | null;
    limit?:       number;
    offset?:      number;
}): Promise<AuditRow[]> {
    const { data, error } = await supabase.rpc('org_audit_list', {
        p_org_id:        input.orgId,
        p_actor_id:      input.actorId ?? null,
        p_action:        input.action ?? null,
        p_resource_type: input.resourceType ?? null,
        p_since:         input.since ?? null,
        p_until:         input.until ?? null,
        p_limit:         input.limit ?? 50,
        p_offset:        input.offset ?? 0,
    });
    if (error) throw error;
    return (data ?? []) as AuditRow[];
}

/* ───────────── dashboard summary (migration 073) ───────────── */

export interface OrgDashboardSummary {
    members: {
        total:     number;
        active:    number;
        invited:   number;
        suspended: number;
    };
    pending_invites:   number;
    pending_approvals: number;
    recent_audit_7d:   number;
    active_projects:   number;
    computed_at:       string;
}

export async function orgDashboardSummary(orgId: string): Promise<OrgDashboardSummary> {
    const { data, error } = await supabase.rpc('org_dashboard_summary', { p_org_id: orgId });
    if (error) throw error;
    return data as OrgDashboardSummary;
}

/* ───────────── client-side gates (decorative; RLS enforces) ───────────── */

export function canManageMembers(role: OrgRole | null): boolean {
    return role === 'owner' || role === 'admin';
}
export function canManageTeams(role: OrgRole | null): boolean {
    return role === 'owner' || role === 'admin' || role === 'manager';
}
export function isAdminTier(role: OrgRole | null): boolean {
    return role === 'owner' || role === 'admin';
}
