import { supabase } from './supabase';
import { hasAtLeast, type AdminRole } from './roles';

// Canonical role type now lives in lib/roles.ts (7 tiers, matches migration 039).
export type { AdminRole };

export async function getAdminRole(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();
  return data?.role ?? null;
}

/** Require at least `min` authority (default: admin). Throws otherwise. */
export async function requireAdmin(min: AdminRole = 'admin') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const role = await getAdminRole();
  if (!hasAtLeast(role, min))
    throw new Error('Insufficient permissions');
  return { user, role };
}
