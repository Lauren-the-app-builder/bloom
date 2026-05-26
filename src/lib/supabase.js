import { createClient } from '@supabase/supabase-js';

// Vite exposes env vars prefixed with VITE_*
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn('[bloom] Supabase env vars missing. Sync disabled.');
}

export const supabase = (url && anonKey)
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Implicit flow puts the access token in the URL hash, so the
        // landing tab can read it without needing a PKCE code verifier
        // from the originating tab. Critical for iOS Safari where the
        // mail app opens the magic link in a brand-new tab.
        flowType: 'implicit',
        storage: window.localStorage,
        storageKey: 'bloom:auth',
      },
    })
  : null;

export const isSupabaseConfigured = !!supabase;
