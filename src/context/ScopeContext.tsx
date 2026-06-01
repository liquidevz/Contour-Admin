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
    const [loading, setLoading] = useState(true);
    const initialized = useRef(false);

    const isPlatformAdmin = !!platformRoleStr && PLATFORM_ROLES.has(platformRoleStr);

    // Single effect to handle everything - load memberships and restore scope
    useEffect(() => {
        // Reset on user change
        if (!user) {
            setMemberships([]);
            setScope(PERSONAL_SCOPE);
            setLoading(false);
            initialized.current = false;
            try {
                if (typeof window !== 'undefined') {
                    Object.keys(window.localStorage)
                        .filter((k) => k.startsWith('contour.scope.'))
                        .forEach((k) => window.localStorage.removeItem(k));
                }
            } catch { /* ok */ }
            return;
        }

        // Wait for auth to finish loading
        if (authLoading) return;

        // Only initialize once per user
        if (initialized.current) return;
        initialized.current = true;

        // Load memberships and restore scope
        (async () => {
            setLoading(true);
            
            // Fetch memberships
            let membershipList: OrgMembership[] = [];
            try {
                membershipList = await orgMyMemberships();
                setMemberships(membershipList);
            } catch (err) {
                console.warn('[Scope] failed to load memberships', err);
                setMemberships([]);
            }

            // Restore scope based on current route
            const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
            const isOnOrgRoute = currentPath.startsWith('/org/');

            try {
                const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey(user.id)) : null;
                
                // If on org route, force org scope
                if (isOnOrgRoute) {
                    if (raw) {
                        const parsed = JSON.parse(raw) as { type: ScopeType; orgId?: string };
                        if (parsed.type === 'org' && parsed.orgId) {
                            const m = membershipList.find((x) => x.org_id === parsed.orgId && x.status === 'active');
                            if (m) {
                                setScope(buildOrgScope(m));
                                setLoading(false);
                                return;
                            }
                        }
                    }
                    // Use first available org
                    const firstOrg = membershipList.find((m) => m.status === 'active');
                    if (firstOrg) {
                        setScope(buildOrgScope(firstOrg));
                        setLoading(false);
                        return;
                    }
                }

                // Not on org route - restore saved scope or use default
                if (raw) {
                    const parsed = JSON.parse(raw) as { type: ScopeType; orgId?: string };
                    
                    if (parsed.type === 'platform' && isPlatformAdmin) {
                        setScope(PLATFORM_SCOPE);
                    } else if (parsed.type === 'org' && parsed.orgId) {
                        const m = membershipList.find((x) => x.org_id === parsed.orgId && x.status === 'active');
                        if (m) {
                            setScope(buildOrgScope(m));
                        } else if (isPlatformAdmin) {
                            setScope(PLATFORM_SCOPE);
                        } else {
                            const firstOrg = membershipList.find((x) => x.status === 'active');
                            setScope(firstOrg ? buildOrgScope(firstOrg) : PERSONAL_SCOPE);
                        }
                    } else if (parsed.type === 'personal') {
                        setScope(isPlatformAdmin ? PLATFORM_SCOPE : PERSONAL_SCOPE);
                    } else {
                        setScope(isPlatformAdmin ? PLATFORM_SCOPE : PERSONAL_SCOPE);
                    }
                } else {
                    // No saved scope - use defaults
                    if (isPlatformAdmin) {
                        setScope(PLATFORM_SCOPE);
                    } else {
                        const firstOrg = membershipList.find((m) => m.status === 'active');
                        setScope(firstOrg ? buildOrgScope(firstOrg) : PERSONAL_SCOPE);
                    }
                }
            } catch (err) {
                console.warn('[Scope] restore failed', err);
                if (isPlatformAdmin) {
                    setScope(PLATFORM_SCOPE);
                } else {
                    const firstOrg = membershipList.find((m) => m.status === 'active');
                    setScope(firstOrg ? buildOrgScope(firstOrg) : PERSONAL_SCOPE);
                }
            }
            
            setLoading(false);
        })();
    }, [user, authLoading, isPlatformAdmin]);

    // Persist scope changes to localStorage
    useEffect(() => {
        if (!user || typeof window === 'undefined' || !initialized.current) return;
        const payload = JSON.stringify({
            type: scope.type,
            orgId: scope.orgId ?? undefined,
        });
        try {
            window.localStorage.setItem(storageKey(user.id), payload);
        } catch { /* ok */ }
    }, [scope, user]);

    const switchToPersonal = useCallback(() => setScope(PERSONAL_SCOPE), []);
    
    const switchToPlatform = useCallback(() => {
        if (isPlatformAdmin) setScope(PLATFORM_SCOPE);
    }, [isPlatformAdmin]);
    
    const switchToOrg = useCallback((orgId: string) => {
        const m = memberships.find((x) => x.org_id === orgId && x.status === 'active');
        if (m) setScope(buildOrgScope(m));
    }, [memberships]);

    const refresh = useCallback(async () => {
        if (!user) return;
        try {
            const list = await orgMyMemberships();
            setMemberships(list);
        } catch (err) {
            console.warn('[Scope] refresh failed', err);
        }
    }, [user]);

    const value = useMemo<ScopeContextValue>(() => ({
        scope,
        memberships,
        isPlatformAdmin,
        loading,
        switchToPersonal,
        switchToPlatform,
        switchToOrg,
        refresh,
    }), [scope, memberships, isPlatformAdmin, loading, switchToPersonal, switchToPlatform, switchToOrg, refresh]);

    return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
    const ctx = useContext(ScopeContext);
    if (!ctx) {
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
