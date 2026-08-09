"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Singleton Supabase client for the workout app. Auth tokens are kept
 * in localStorage and refreshed automatically by the SDK; no manual
 * session plumbing required.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "wl_supabase_auth",
    },
  });
  return client;
}
