import { createClient } from "@supabase/supabase-js";

/**
 * Only the Supabase project URL and publishable/anon key belong in the browser.
 * Database access is protected by Postgres Row Level Security, never by hiding
 * the publishable key. Do not put a service-role key in VITE_* variables.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isHostedJournalConfigured = supabase !== null;
