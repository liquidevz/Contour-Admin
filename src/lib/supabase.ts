import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    // Use localStorage for session persistence — most reliable across refreshes
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // Automatically refresh the session before it expires
    autoRefreshToken: true,
    // Detect session from URL hash after OAuth redirect
    detectSessionInUrl: true,
    // Use PKCE flow for better security with OAuth
    flowType: 'pkce',
    // Persist sessions across tabs / refreshes
    persistSession: true,
  },
});
