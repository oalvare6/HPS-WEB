"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Browser-side Supabase client for player auth flows (magic-link login,
 * sign-out, etc.). Singleton — only one instance per browser tab so the
 * session cookie writes are consistent.
 *
 * Admin code does not use this. Server code uses
 * `createSupabaseServerClient` instead.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }
  if (!anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable."
    );
  }

  _client = createBrowserClient(url, anonKey);
  return _client;
}
