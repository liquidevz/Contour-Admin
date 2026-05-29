/**
 * ScopeContext (Admin web)
 *
 * Mirrors the mobile-app ScopeContext on the web. Holds:
 *   - scope: { type: 'personal' | 'org' | 'platform', orgId, role, membership }
 *   - memberships: every org the signed-in user belongs to (active or invited)
 *   - platformRole: their platform-admin role (if any) — drives whether the
 *     "Super Admin" scope is offered in the switcher
 *
 * The scope determines what the AdminLayout sidebar shows and what page
 * data is filtered to. Persisted per-user in localStorage so refresh
 * lands the user back in the same workspace they were last viewing.
 *
 * Critically, this provider is ADDITIVE: it does not modify AuthContext
 * or the existing platform-admin pages. Those pages keep working when
 * the active scope is 'platform'.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { orgMyMemberships, type OrgMembership, type OrgRole } from '../lib/org';

/**
 * IMPORTANT — bug fix history:
 *   v1 of this provider latched the "scope restored" flag as soon as
 *   memberships finished loading. But role from AuthContext arrives
 *   on a SEPARATE clock (a 200ms MFA-check delay then a profile fetch).
 *   So on first paint we'd often see `role === null` → isPlatformAdmin
 *   was false → we defaulted superadmins into PERSONAL_SCOPE, which
 *   renders a sidebar with only "Overview". Every Users / Marketplace
 *   / etc. nav entry vanished and the page looked broken.
 *
 *   v2 fixes that by:
 *     1. Requiring authLoading === false before restoring scope (so
 *        role is settled and isPlatformAdmin is accurate).
 *     2. Never latching scope into PERSONAL for a platform admin; if
 *        we picked Personal earlier and isPlatformAdmin later becomes
 *        true, we re-elevate to PLATFORM_SCOPE on the next tick.
 *     3. Locking restoredFor only after we made a meaningful decision.
 */

const PLATFORM_ROLES = new Set(['admin', 'superadmin', 'analyst', 'moderator', 'release_manager', 'support']);

type ScopeType = 'personal' | 'org' | 'platform';

export interface Scope {
    type: ScopeType;
    orgId: string | null;
    role: OrgRole | null;
    membership: OrgMembership | null;
}

const PERSONAL_SCOPE: Scope = { type: 'personal', orgId: null, role: null, membership: null };
const PLATFORM_SCOPE: Scope = { type: 'platform', orgId: null, role: null, membership: null };

interface ScopeContextValue {
    scope: Scope;
    memberships: OrgMembership[];
    /** True if the signed-in user has a platform-admin role (admin/superadmin/etc.). */
    isPlatformAdmin: boolean;
    loading: boolean;
    switchToPersonal: () => void;
    switchToPlatform: () => void;
    switchToOrg: (orgId: string) => void;
    refresh: () => Promise<void>;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

function storageKey(userId: string): string {
    return `contour.scope.${userId}`;
}

function buildOrgScope(m: OrgMembership): Scope {
    return { type: 'org', orgId: m.org_id, role: m.role, membership: m };
}

export function ScopeProvider({ children }: { children: ReactNode }) {
    const { user, role: platformRoleStr, loading: authLoading } = useAuth();
    const [memberships, setMemberships] = useState<OrgMembership[]>([]);
    const [scope, setScope] = useState<Scope>(PERSONAL_SCOPE);
    const [loading, setLoading] = useState(false);
    const restoredFor = useRef<string | null>(null);

    const isPlatformAdmin = !!platformRoleStr && PLATFORM_ROLES.has(platformRoleStr);

    const refresh = useCallback(async () => {
        if (!user) {
            setMemberships([]);
            setScope(isPlatformAdmin ? PLATFORM_SCOPE : PERSONAL_SCOPE);
            return;
        }
        setLoading(true);
        try {
            const list = await orgMyMemberships();
            setMemberships(list);
        } catch (err) {
            // Most likely cause: the org migrations haven't been applied yet
            // to the DB this admin is pointed at. Don't crash — surface empty.
            // eslint-disable-next-line no-console
            console.warn('[Scope] failed to load memberships', err);
            setMemberships([]);
        } finally {
            setLoading(false);
        }
    }, [user, isPlatformAdmin]);

    useEffect(() => {
        if (!user) {
            setMemberships([]);
            setScope(PERSONAL_SCOPE);
            restoredFor.current = null;
            // Drop stale scope from previous user to avoid the next sign-in
            // landing on a workspace they no longer have access to.
            try {
                if (typeof window !== 'undefined') {
                    Object.keys(window.localStorage)
                        .filter((k) => k.startsWith('contour.scope.'))
                        .forEach((k) => window.localStorage.removeItem(k));
                }
            } catch { /* ok */ }
            return;
        }
        // Start loading memberships immediately without blocking
        void refresh();
    }, [user, refresh]);

    // Restore last-selected scope after BOTH auth and memberships settle.
    // Critically: we wait for !authLoading so `role` (and therefore
    // `isPlatformAdmin`) is accurate before we pick a default scope.
    useEffect(() => {
        if (!user) return;
        if (authLoading) return;     // wait for role to land
        if (loading) return;         // wait for memberships
        if (restoredFor.current === user.id) return;

        try {
            const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey(user.id)) : null;

            if (!raw) {
                // Default: platform admins land on Super Admin; others
                // on the first active org, else Personal.
                if (isPlatformAdmin) {
                    setScope(PLATFORM_SCOPE);
                } else {
                    const firstOrg = memberships.find((m) => m.status === 'active');
                    setScope(firstOrg ? buildOrgScope(firstOrg) : PERSONAL_SCOPE);
                }
                restoredFor.current = user.id;
                return;
            }

            const parsed = JSON.parse(raw) as { type: ScopeType; orgId?: string };
            if (parsed.type === 'platform' && isPlatformAdmin) {
                setScope(PLATFORM_SCOPE);
            } else if (parsed.type === 'org' && parsed.orgId) {
                const m = memberships.find((x) => x.org_id === parsed.orgId && x.status === 'active');
                if (m) setScope(buildOrgScope(m));
                else if (isPlatformAdmin) setScope(PLATFORM_SCOPE);
                else setScope(PERSONAL_SCOPE);
            } else if (parsed.type === 'personal' && isPlatformAdmin) {
                // Defensive: a stale "personal" value should NOT downgrade
                // a platform admin into a Personal scope where the sidebar
                // shows almost nothing. Upgrade to Platform.
                setScope(PLATFORM_SCOPE);
            } else {
                setScope(PERSONAL_SCOPE);
            }
            restoredFor.current = user.id;
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[Scope] restore failed', err);
        }
    }, [user, authLoading, memberships, loading, isPlatformAdmin]);

    // Safety net: if role becomes available LATER (e.g. auth-state-change
    // post-MFA) and we're still sitting in PERSONAL_SCOPE for a platform
    // admin, elevate to PLATFORM_SCOPE so the sidebar shows up.
    useEffect(() => {
        if (!user || authLoading) return;
        if (isPlatformAdmin && scope.type === 'personal') {
            setScope(PLATFORM_SCOPE);
        }
    }, [user, authLoading, isPlatformAdmin, scope.type]);

    // Persist scope on change.
    useEffect(() => {
        if (!user || typeof window === 'undefined') return;
        const payload = JSON.stringify({
            type: scope.type,
            orgId: scope.orgId ?? undefined,
        });
        try { window.localStorage.setItem(storageKey(user.id), payload); } catch { /* ok */ }
    }, [scope, user]);

    const switchToPersonal = useCallback(() => setScope(PERSONAL_SCOPE), []);
    const switchToPlatform = useCallback(() => {
        if (isPlatformAdmin) setScope(PLATFORM_SCOPE);
    }, [isPlatformAdmin]);
    const switchToOrg = useCallback((orgId: string) => {
        const m = memberships.find((x) => x.org_id === orgId && x.status === 'active');
        if (m) setScope(buildOrgScope(m));
    }, [memberships]);

    const value = useMemo<ScopeContextValue>(() => ({
        scope, memberships, isPlatformAdmin, loading,
        switchToPersonal, switchToPlatform, switchToOrg, refresh,
    }), [scope, memberships, isPlatformAdmin, loading,
        switchToPersonal, switchToPlatform, switchToOrg, refresh]);

    return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
    const ctx = useContext(ScopeContext);
    if (!ctx) {
        // Fallback shim — keeps legacy code calling useScope() from crashing.
        return {
            scope: PERSONAL_SCOPE,
            memberships: [],
            isPlatformAdmin: false,
            loading: false,
            switchToPersonal: () => {},
            switchToPlatform: () => {},
            switchToOrg: () => {},
            refresh: async () => {},
        };
    }
    return ctx;
}

export function useOrgId(): string | null {
    return useScope().scope.orgId;
}
export function useOrgRole(): OrgRole | null {
    return useScope().scope.role;
}
