/**
 * Canonical admin platform-role model — the single source of truth for the
 * admin panel. Mirrors backend migration 039 (`user_roles` CHECK constraint:
 * 7 tiers) and its `has_permission(text)` helper.
 *
 * Before this file the panel had THREE disagreeing definitions
 * (adminAuth.AdminRole, RoleGate.Role, App.PLATFORM_ROLES). Everything now
 * imports from here so UI gating matches the server's RLS/RPC gating.
 *
 * Note: the panel gates the UI for clarity, but the *authoritative* checks live
 * server-side (RLS + SECURITY DEFINER RPCs). Hiding a nav item is UX, not
 * security — a determined request still hits a guarded RPC.
 */

export type AdminRole =
    | 'superadmin'
    | 'admin'
    | 'release_manager'
    | 'moderator'
    | 'analyst'
    | 'support'
    | 'user';

/** Roles that grant admin-panel access (everything except a plain app `user`). */
export const PLATFORM_ROLES: AdminRole[] = [
    'superadmin', 'admin', 'release_manager', 'moderator', 'analyst', 'support',
];

/** Authority rank — higher wins. Drives hasAtLeast(). */
const RANK: Record<AdminRole, number> = {
    user: 0, support: 1, analyst: 2, moderator: 3, release_manager: 4, admin: 5, superadmin: 6,
};

export const ROLE_LABELS: Record<AdminRole, string> = {
    superadmin: 'Super Admin', admin: 'Admin', release_manager: 'Release Manager',
    moderator: 'Moderator', analyst: 'Analyst', support: 'Support', user: 'User',
};

export const ROLE_COLORS: Record<AdminRole, string> = {
    superadmin: '#7C3AED', admin: '#2563EB', release_manager: '#0891B2',
    moderator: '#D97706', analyst: '#0D9488', support: '#6B7280', user: '#9CA3AF',
};

export function isAdminRole(role: string | null | undefined): role is AdminRole {
    return !!role && role in RANK;
}

/** True when the role grants admin-panel access (any tier above plain `user`). */
export function isPlatformRole(role: string | null | undefined): boolean {
    return isAdminRole(role) && role !== 'user';
}

export function roleLabel(role: string | null | undefined): string {
    return isAdminRole(role) ? ROLE_LABELS[role] : 'User';
}

export function roleColor(role: string | null | undefined): string {
    return isAdminRole(role) ? ROLE_COLORS[role] : ROLE_COLORS.user;
}

/** True when `role` is at least as authoritative as `min`. */
export function hasAtLeast(role: string | null | undefined, min: AdminRole): boolean {
    if (!isAdminRole(role)) return false;
    return RANK[role] >= RANK[min];
}

// ── Capability matrix ───────────────────────────────────────────────────────

export type AdminPermission =
    | 'users.view' | 'users.manage' | 'moderation' | 'notifications' | 'intelligence'
    | 'config' | 'releases' | 'observability' | 'analytics' | 'catalog' | 'orgs'
    | 'security' | 'roles';

/** Which roles may exercise each capability. Keep in sync with the plan matrix. */
const MATRIX: Record<AdminPermission, AdminRole[]> = {
    'users.view':    ['support', 'moderator', 'admin', 'superadmin'],
    'users.manage':  ['moderator', 'admin', 'superadmin'],
    'moderation':    ['moderator', 'admin', 'superadmin'],
    'notifications': ['admin', 'superadmin'],
    'intelligence':  ['release_manager', 'admin', 'superadmin'],
    'config':        ['release_manager', 'admin', 'superadmin'],
    'releases':      ['release_manager', 'admin', 'superadmin'],
    'observability': ['analyst', 'release_manager', 'admin', 'superadmin'],
    'analytics':     ['analyst', 'moderator', 'release_manager', 'admin', 'superadmin'],
    'catalog':       ['admin', 'superadmin'],
    'orgs':          ['support', 'moderator', 'admin', 'superadmin'],
    'security':      ['superadmin'],
    'roles':         ['superadmin'],
};

export function can(role: string | null | undefined, permission: AdminPermission): boolean {
    if (!isAdminRole(role)) return false;
    return MATRIX[permission].includes(role);
}

/**
 * Map a sidebar route to the capability it needs. Routes not listed here are
 * visible to any platform role (e.g. /dashboard, /settings).
 */
const ROUTE_PERMISSION: Record<string, AdminPermission> = {
    '/waitlist': 'users.manage',
    '/users': 'users.view',
    '/organisations': 'orgs',
    '/offers': 'moderation', '/wants': 'moderation', '/reports': 'moderation',
    '/messages': 'moderation',
    '/notifications': 'notifications', '/delivery-queue': 'notifications',
    '/match-engine': 'intelligence', '/match-analytics': 'analytics',
    '/feature-flags': 'config', '/remote-config': 'config',
    '/categories': 'catalog', '/tags': 'catalog', '/ontology': 'catalog',
    '/analytics': 'analytics', '/events': 'analytics', '/onboarding': 'analytics',
    '/audit-log': 'observability',
    '/errors': 'observability', '/latency': 'observability',
    '/edge-logs': 'observability', '/background-jobs': 'observability',
    '/ota': 'releases',
    '/admin-sessions': 'security', '/security': 'security',
};

export function canAccessRoute(role: string | null | undefined, to: string): boolean {
    const perm = ROUTE_PERMISSION[to];
    if (!perm) return true; // ungated route
    return can(role, perm);
}
