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
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      if (error) {
        console.warn('Role fetch error:', error.message);
        return null;
      }
      return data?.role ?? null;
    } catch (err) {
      console.warn('Role fetch exception:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function initAuth() {
      try {
        // Check if we have hash tokens in URL (OAuth callback)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        // If we have tokens in hash, set the session manually
        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!error && data.session?.user && isMounted) {
            setUser(data.session.user);
            const r = await fetchRole(data.session.user.id);
            setRole(r);
            // Clean the URL hash
            window.history.replaceState(null, '', window.location.pathname);
            setLoading(false);
            return;
          }
        }

        // Normal session check
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          const u = session?.user ?? null;
          setUser(u);
          if (u) {
            const r = await fetchRole(u.id);
            setRole(r);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Auth init error:', err);
        if (isMounted) setLoading(false);
      }
    }

    initAuth();

    // Listen for auth changes (token refresh, sign out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

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
    // Explicitly redirect to this web app, not the mobile app deep links
    const redirectUrl = window.location.origin;
    console.log('OAuth redirectTo:', redirectUrl);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error('OAuth error:', error.message);
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
