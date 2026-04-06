import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  role: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string): Promise<string | null> => {
    console.log('[Auth] Fetching role for user:', userId);

    // Method 1: Try RPC (SECURITY DEFINER — bypasses RLS)
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_my_role');
      if (!rpcError && rpcData) {
        console.log('[Auth] Role via RPC:', rpcData);
        return rpcData as string;
      }
      if (rpcError) console.warn('[Auth] RPC failed:', rpcError.message, rpcError.code);
    } catch (err) {
      console.warn('[Auth] RPC exception:', err);
    }

    // Method 2: Direct query (needs RLS policy for own role)
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      if (!error && data?.role) {
        console.log('[Auth] Role via direct query:', data.role);
        return data.role;
      }
      if (error) console.warn('[Auth] Direct query failed:', error.message, error.code);
    } catch (err) {
      console.warn('[Auth] Direct query exception:', err);
    }

    console.warn('[Auth] No role found for user:', userId);
    return null;
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // Just get the existing session — do NOT manually parse hash tokens.
    // Supabase JS client handles the OAuth callback hash automatically
    // via onAuthStateChange. Manual setSession causes lock conflicts.
    async function initAuth() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[Auth] getSession error:', error.message);
        }

        if (!isMounted) return;

        const u = session?.user ?? null;
        console.log('[Auth] Init session:', u ? u.email : 'none');
        setUser(u);

        if (u) {
          const r = await fetchRole(u.id);
          if (isMounted) setRole(r);
        }

        if (isMounted) setLoading(false);
      } catch (err) {
        console.error('[Auth] Init error:', err);
        if (isMounted) setLoading(false);
      }
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        console.log('[Auth] State change:', event, session?.user?.email);

        const u = session?.user ?? null;
        setUser(u);

        if (u && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          const r = await fetchRole(u.id);
          if (isMounted) {
            setRole(r);
            setLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          setRole(null);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signInWithGoogle = async () => {
    const redirectUrl = window.location.origin;
    console.log('[Auth] OAuth redirectTo:', redirectUrl);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error('[Auth] OAuth error:', error.message);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
