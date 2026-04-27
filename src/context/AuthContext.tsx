import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  debugLog: string[];
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Simple in-memory role cache to avoid re-fetching on every auth event
const roleCache = new Map<string, { role: string | null; ts: number }>();
const ROLE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const roleRef = useRef<string | null>(null);
  const roleFetchRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const mountedRef = useRef(true);

  const addLog = useCallback((msg: string) => {
    console.log(`[Auth] ${msg}`);
    setDebugLog(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  // Update roleRef whenever role state changes
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  const fetchRole = useCallback(async (userId: string, forceRefresh = false): Promise<string | null> => {
    if (!forceRefresh) {
      const cached = roleCache.get(userId);
      if (cached && Date.now() - cached.ts < ROLE_CACHE_TTL) return cached.role;
    }

    if (roleFetchRef.current === userId && !forceRefresh) return roleRef.current;
    roleFetchRef.current = userId;

    addLog(`Fetching role for user ${userId.substring(0, 8)}...`);

    // Attempt 1: RPC with Retry
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const rpcPromise = supabase.rpc('admin_get_my_role');
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500));
        const response = await Promise.race([rpcPromise, timeoutPromise]) as any;
        
        if (response.error) {
          addLog(`RPC Attempt ${attempt} error: ${response.error.message}`);
        } else if (response.data) {
          addLog(`Role found via RPC: ${response.data}`);
          roleCache.set(userId, { role: response.data as string, ts: Date.now() });
          return response.data as string;
        } else {
          addLog(`RPC Attempt ${attempt} returned null data`);
        }
      } catch (err: any) {
        addLog(`RPC Attempt ${attempt} exception: ${err.message}`);
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 500));
    }

    // Attempt 2: Direct Table Query with Retry
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { data, error: qErr } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle();
        
        if (qErr) {
          addLog(`Query Attempt ${attempt} error: ${qErr.message}`);
        } else if (data?.role) {
          addLog(`Role found via Query: ${data.role}`);
          roleCache.set(userId, { role: data.role, ts: Date.now() });
          return data.role;
        } else {
          addLog(`Query Attempt ${attempt} returned no row`);
        }
      } catch (err: any) {
        addLog(`Query Attempt ${attempt} exception: ${err.message}`);
      }
      if (attempt < 2) await new Promise(r => setTimeout(r, 500));
    }

    addLog('Role fetch failed across all methods and retries.');
    roleCache.set(userId, { role: null, ts: Date.now() });
    return null;
  }, [addLog]);

  const handleAuthState = useCallback(async (
    event: AuthChangeEvent | 'INIT',
    session: Session | null,
    isInitial = false
  ) => {
    if (!mountedRef.current) return;

    const u = session?.user ?? null;
    addLog(`Handling ${event} for ${u?.email || 'no-user'}`);
    
    setUser(u);

    if (u) {
      const needsRoleFetch =
        event === 'SIGNED_IN' ||
        event === 'INITIAL_SESSION' ||
        event === 'INIT' ||
        (event === 'TOKEN_REFRESHED' && !roleRef.current);

      if (needsRoleFetch) {
        // Wait for auth to settle
        if (isInitial) await new Promise(r => setTimeout(r, 400));
        
        const r = await fetchRole(u.id);
        if (mountedRef.current) {
          setRole(r);
          roleRef.current = r;
        }
      }
    } else {
      setRole(null);
      roleRef.current = null;
    }

    if (mountedRef.current) {
      setLoading(false);
      if (isInitial) initializedRef.current = true;
    }
  }, [fetchRole, addLog]);

  useEffect(() => {
    mountedRef.current = true;

    if (!isConfigured) {
      setLoading(false);
      return;
    }

    const initialize = async () => {
      if (initializedRef.current) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await handleAuthState('INIT', session, true);
      } catch (err: any) {
        addLog(`Initialization crash: ${err.message}`);
        if (mountedRef.current) setLoading(false);
      } finally {
        if (mountedRef.current) initializedRef.current = true;
      }
    };

    const safetyTimer = setTimeout(() => {
      if (mountedRef.current && loading) {
        addLog('Safety timeout triggered');
        setLoading(false);
      }
    }, 8000);

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event !== 'INITIAL_SESSION') {
          await handleAuthState(event, session);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, [handleAuthState, loading, addLog]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    addLog(`Attempting sign in for ${email}...`);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        addLog(`Sign in error: ${signInError.message}`);
        setError(signInError.message);
        return { error: signInError };
      }
      addLog('Sign in success');
      return { error: null };
    } catch (err: any) {
      addLog(`Sign in exception: ${err.message}`);
      setError(err.message || 'An unexpected error occurred');
      return { error: err };
    }
  }, [addLog]);

  const signOut = useCallback(async () => {
    setError(null);
    roleCache.clear();
    roleFetchRef.current = null;
    addLog('Signing out...');
    try {
      await supabase.auth.signOut();
    } catch (err: any) {
      addLog(`Sign out error: ${err.message}`);
    } finally {
      if (mountedRef.current) {
        setUser(null);
        setRole(null);
        roleRef.current = null;
      }
    }
  }, [addLog]);

  const refreshRole = useCallback(async () => {
    if (user) {
      setLoading(true);
      const r = await fetchRole(user.id, true);
      if (mountedRef.current) {
        setRole(r);
        setLoading(false);
      }
    }
  }, [user, fetchRole]);

  return (
    <AuthContext.Provider value={{ user, role, loading, error, debugLog, signInWithEmail, signOut, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
