import { supabase } from './supabase';

export type AdminRole = 'admin' | 'superadmin' | 'moderator';

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

export async function requireAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const role = await getAdminRole();
  if (!role || !['admin', 'superadmin'].includes(role))
    throw new Error('Insufficient permissions');
  return { user, role };
}
