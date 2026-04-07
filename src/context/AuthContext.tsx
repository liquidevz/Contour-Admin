import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  loading: true,
  error: null,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

// Simple in-memory role cache to avoid re-fetching on every auth event
const roleCache = new Map<string, { role: string | null; ts: number }>();
const ROLE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prevent race conditions — track in-flight role fetches
  const roleFetchRef = useRef<string | null>(null);
  // Track if we've completed initial auth check
  const initializedRef = useRef(false);
  // Mounted ref for cleanup
  const mountedRef = useRef(true);

  const fetchRole = useCallback(async (userId: string, forceRefresh = false): Promise<string | null> => {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = roleCache.get(userId);
      if (cached && Date.now() - cached.ts < ROLE_CACHE_TTL) {
        console.log('[Auth] Role from cache:', cached.role);
        return cached.role;
      }
    }

    // Prevent duplicate in-flight requests for the same user
    if (roleFetchRef.current === userId && !forceRefresh) {
      console.log('[Auth] Skipping duplicate role fetch for:', userId);
      return role; // return current role while fetch is in progress
    }

    roleFetchRef.current = userId;
    console.log('[Auth] Fetching role for:', userId);

    try {
      // Method 1: RPC (SECURITY DEFINER — bypasses RLS)
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_my_role');
      if (!rpcError && rpcData) {
        console.log('[Auth] Role via RPC:', rpcData);
        roleCache.set(userId, { role: rpcData as string, ts: Date.now() });
        return rpcData as string;
      }
      if (rpcError) console.warn('[Auth] RPC error:', rpcError.message);
    } catch (err) {
      console.warn('[Auth] RPC exception:', err);
    }

    // Method 2: Direct query fallback
    try {
      const { data, error: queryError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      if (!queryError && data?.role) {
        console.log('[Auth] Role via query:', data.role);
        roleCache.set(userId, { role: data.role, ts: Date.now() });
        return data.role;
      }
      if (queryError) console.warn('[Auth] Query error:', queryError.message);
    } catch (err) {
      console.warn('[Auth] Query exception:', err);
    }

    console.warn('[Auth] No role found for:', userId);
    roleCache.set(userId, { role: null, ts: Date.now() });
    return null;
  }, [role]);

  // Single handler for processing auth state — used by both init and listener
  const handleAuthState = useCallback(async (
    event: AuthChangeEvent | 'INIT',
    session: Session | null
  ) => {
    if (!mountedRef.current) return;

    const u = session?.user ?? null;
    console.log('[Auth] Handle:', event, u?.email ?? 'no-user');

    setUser(u);

    if (u) {
      // Only fetch role on meaningful events, not on every TOKEN_REFRESHED
      const needsRoleFetch =
        event === 'INIT' ||
        event === 'SIGNED_IN' ||
        event === 'INITIAL_SESSION' ||
        // On token refresh, only fetch if we don't have a cached role
        (event === 'TOKEN_REFRESHED' && !roleCache.has(u.id));

      if (needsRoleFetch) {
        const r = await fetchRole(u.id);
        if (mountedRef.current) {
          setRole(r);
        }
      }
    } else {
      setRole(null);
      setError(null);
    }

    if (mountedRef.current) {
      setLoading(false);
    }
  }, [fetchRole]);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    mountedRef.current = true;

    // Use onAuthStateChange as the SINGLE source of truth.
    // Supabase v2 fires INITIAL_SESSION synchronously during subscription,
    // which includes the session from storage + handles OAuth redirect hash.
    // This eliminates the race condition between getSession() + onAuthStateChange.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mountedRef.current) return;

        // Mark as initialized on first event (INITIAL_SESSION)
        if (!initializedRef.current) {
          initializedRef.current = true;
        }

        await handleAuthState(event, session);
      }
    );

    // Safety net: if onAuthStateChange hasn't fired within 3 seconds,
    // force-check with getUser() + getSession() to prevent indefinite loading
    // getUser() is recommended by Supabase for server-validated sessions.
    const safetyTimeout = setTimeout(async () => {
      if (!mountedRef.current) return;
      if (!initializedRef.current) {
        console.warn('[Auth] Safety timeout — onAuthStateChange did not fire, falling back to getUser()');
        initializedRef.current = true;
        try {
          // 1. Get validated user from server
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          // 2. Get local session data (for tokens)
          const { data: { session } } = await supabase.auth.getSession();
          
          if (userError || !user) {
             await handleAuthState('INIT', null);
          } else {
             // Overwrite session user with validated user to be safe
             const validatedSession = session ? { ...session, user } : null;
             await handleAuthState('INIT', validatedSession);
          }
        } catch (err) {
          console.error('[Auth] Safety auth check error:', err);
          if (mountedRef.current) {
            setLoading(false);
            setError('Failed to check authentication status');
          }
        }
      }
    }, 3000);

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, [handleAuthState]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    const redirectUrl = window.location.origin;
    console.log('[Auth] OAuth redirect:', redirectUrl);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (oauthError) {
      console.error('[Auth] OAuth error:', oauthError.message);
      setError(oauthError.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    // Clear role cache on sign out
    roleCache.clear();
    roleFetchRef.current = null;
    initializedRef.current = false;

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Auth] Sign out error:', err);
    }
    // Force clear state even if signOut API fails
    setUser(null);
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading, error, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
