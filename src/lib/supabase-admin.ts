import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function ensureClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // #region agent log
  console.error("[supabase-admin] init", {
    hypothesisId: "A,B,C,D",
    hasUrl: Boolean(url),
    urlLength: typeof url === "string" ? url.length : 0,
    hasServiceRoleKey: Boolean(key),
    serviceRoleKeyLength: typeof key === "string" ? key.length : 0,
    nodeEnv: process.env.NODE_ENV,
    nextRuntime: process.env.NEXT_RUNTIME ?? null,
    nextPhase: process.env.NEXT_PHASE ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
  // #endregion

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }

  if (!key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }

  _client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _client;
}

// Lazy proxy: defers env var validation until the first method call so
// the module is safe to import during Next.js page-data collection at build
// time, while still throwing a clear error when actually used at runtime
// without proper env vars. Mirrors the pattern in `src/lib/stripe.ts`.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = ensureClient();
    const value = client[prop as keyof SupabaseClient];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
