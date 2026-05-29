import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface MfaChallenge {
  factorId:    string;
  challengeId: string;
}

interface AuthState {
  user: User | null;
  role: string | null;
  /**
   * True when the signed-in user's profile carries
   * `force_password_change=true`. ProtectedRoute reads this and
   * redirects to /change-password unconditionally until the user
   * clears the flag via the `password_change_acknowledge` RPC.
   */
  forcePasswordChange: boolean;
  loading: boolean;
  error: string | null;
  mfaRequired: MfaChallenge | null;
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>;
  verifyMfa: (code: string) => Promise<{ error: any }>;
  cancelMfa: () => Promise<void>;
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

/**
 * Read profiles.force_password_change for the signed-in user.
 * Default false on any error — RLS is the actual security boundary;
 * this flag only drives UX.
 */
async function fetchForcePwChange(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('force_password_change')
      .eq('id', userId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.force_password_change);
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [forcePasswordChange, setForcePwChange] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState<MfaChallenge | null>(null);
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);

  const checkMfa = useCallback(async (): Promise<MfaChallenge | null> => {
    // Supabase exposes per-session AAL. If the user has a verified TOTP
    // factor, nextLevel becomes 'aal2' and the session must be elevated
    // before we trust them as an admin.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel === 'aal2' || aal.nextLevel !== 'aal2') return null;

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = (factors?.totp ?? []).find(f => f.status === 'verified');
    if (!verified) return null;

    const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({
      factorId: verified.id,
    });
    if (chalErr || !chal) return null;
    return { factorId: verified.id, challengeId: chal.id };
  }, []);

  const resolveSession = useCallback(async (session: Session | null) => {
    if (!mountedRef.current) return;

    const u = session?.user ?? null;
    setUser(u);

    if (u) {
      // Small delay to ensure Supabase client auth headers are set
      // This is critical for subsequent RLS queries to work correctly
      await new Promise(r => setTimeout(r, 100));
      if (!mountedRef.current) return;

      const challenge = await checkMfa();
      if (mountedRef.current) setMfaRequired(challenge);

      // Don't reveal the admin role until MFA is satisfied — the
      // ProtectedRoute check reads `role` so a missing role keeps
      // them on the Login screen even though Supabase thinks the
      // session is valid.
      const [r, mustChangePw] = challenge
        ? [null, false]
        : await Promise.all([fetchRoleFromDB(u.id), fetchForcePwChange(u.id)]);
      if (mountedRef.current) {
        setRole(r);
        setForcePwChange(mustChangePw);
      }
    } else {
      setRole(null);
      setForcePwChange(false);
      setMfaRequired(null);
    }

    if (mountedRef.current) setLoading(false);
  }, [checkMfa]);

  useEffect(() => {
    mountedRef.current = true;

    if (!isConfigured) {
      setLoading(false);
      return;
    }

    // 1. Get existing session immediately on mount - this is critical for page refresh
    // We need to restore the session synchronously before any redirects happen
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!initializedRef.current && mountedRef.current) {
          initializedRef.current = true;
          await resolveSession(session);
        }
      } catch (err) {
        console.error('[Auth] Failed to restore session:', err);
        if (mountedRef.current) setLoading(false);
      }
    })();

    // Absolute safety net — 6 seconds max
    const safety = setTimeout(() => {
      if (mountedRef.current && loading) {
        console.warn('[Auth] Safety timeout reached, forcing loading=false');
        setLoading(false);
      }
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

  const verifyMfa = useCallback(async (code: string) => {
    setError(null);
    if (!mfaRequired) return { error: new Error('No MFA challenge active') };
    const { error: e } = await supabase.auth.mfa.verify({
      factorId:    mfaRequired.factorId,
      challengeId: mfaRequired.challengeId,
      code,
    });
    if (e) { setError(e.message); return { error: e }; }
    // Elevation succeeded — re-resolve session so we pick up role.
    setMfaRequired(null);
    const { data: { session } } = await supabase.auth.getSession();
    await resolveSession(session);
    return { error: null };
  }, [mfaRequired, resolveSession]);

  const cancelMfa = useCallback(async () => {
    setMfaRequired(null);
    await supabase.auth.signOut();
    if (mountedRef.current) { setUser(null); setRole(null); }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    await supabase.auth.signOut();
    if (mountedRef.current) {
      setUser(null);
      setRole(null);
      setForcePwChange(false);
    }
  }, []);

  const refreshRole = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [r, mustChangePw] = await Promise.all([
      fetchRoleFromDB(user.id),
      fetchForcePwChange(user.id),
    ]);
    if (mountedRef.current) {
      setRole(r);
      setForcePwChange(mustChangePw);
      setLoading(false);
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user, role, forcePasswordChange, loading, error, mfaRequired,
      signInWithEmail, verifyMfa, cancelMfa, signOut, refreshRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
