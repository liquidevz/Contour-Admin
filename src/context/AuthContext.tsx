import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchRoleFromDB(userId: string): Promise<string | null> {
  // Try admins table first (has the current user)
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (!error && data?.role) return data.role;
  } catch (_) {}

  // Try user_roles table as fallback
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data?.role) return data.role;
  } catch (_) {}

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);

  const resolveSession = useCallback(async (session: Session | null) => {
    if (!mountedRef.current) return;

    const u = session?.user ?? null;
    setUser(u);

    if (u) {
      // Give Supabase client 200ms to settle auth headers after a fresh session
      await new Promise(r => setTimeout(r, 200));
      if (!mountedRef.current) return;

      const r = await fetchRoleFromDB(u.id);
      if (mountedRef.current) setRole(r);
    } else {
      setRole(null);
    }

    if (mountedRef.current) setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!isConfigured) {
      setLoading(false);
      return;
    }

    // 1. Get existing session immediately on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        resolveSession(session);
      }
    });

    // Absolute safety net — 6 seconds max
    const safety = setTimeout(() => {
      if (mountedRef.current && loading) setLoading(false);
    }, 6000);

    // 2. Listen for future sign-in / sign-out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === 'INITIAL_SESSION') {
        // Already handled by getSession() above — skip to avoid double-init
        if (!initializedRef.current) {
          initializedRef.current = true;
          resolveSession(session);
        }
        return;
      }
      resolveSession(session);
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      clearTimeout(safety);
    };
  }, []); // intentionally empty — run once on mount

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) setError(e.message);
    return { error: e };
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    await supabase.auth.signOut();
    if (mountedRef.current) {
      setUser(null);
      setRole(null);
    }
  }, []);

  const refreshRole = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const r = await fetchRoleFromDB(user.id);
    if (mountedRef.current) { setRole(r); setLoading(false); }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, role, loading, error, signInWithEmail, signOut, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
