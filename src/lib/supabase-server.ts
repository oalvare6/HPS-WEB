import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client bound to the request's cookies (Server
 * Components and Route Handlers). Reads/writes the auth session cookies
 * issued by `@supabase/ssr`.
 *
 * Use this for player-facing pages and APIs. Admin code keeps using
 * `supabaseAdmin` from `src/lib/supabase-admin.ts`.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }
  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as CookieOptions);
          }
        } catch {
          // `cookies().set` throws in pure Server Component reads. Safe to
          // ignore here: the middleware refreshes the session cookie on the
          // next request.
        }
      },
    },
  });
}

/**
 * Middleware-side Supabase client. Returns both the client and a mutable
 * `NextResponse` that has the refreshed cookies attached. Caller is
 * responsible for returning `response` (or a redirect built from it) so the
 * browser actually receives the refreshed cookies.
 *
 * This mirrors the @supabase/ssr middleware recipe exactly. Do not put any
 * code between `createSupabaseMiddlewareClient` and the first call to
 * `supabase.auth.getUser()` — that ordering is required for the session
 * refresh to land in `response.cookies`.
 */
export function createSupabaseMiddlewareClient(request: NextRequest): {
  supabase: SupabaseClient;
  response: NextResponse;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    // Fail open: if env vars are missing (e.g. preview build), just pass the
    // request through. Player-facing routes will surface a clear error
    // separately.
    return {
      supabase: null as unknown as SupabaseClient,
      response: NextResponse.next({ request }),
    };
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies
          .getAll()
          .map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options as CookieOptions);
        }
      },
    },
  });

  return { supabase, response };
}

/**
 * Route Handler Supabase client. Binds auth cookie writes to the outgoing
 * `NextResponse` the handler returns (redirect or otherwise). Use this in
 * `/auth/callback` and `/auth/signout` — never `createSupabaseServerClient()`
 * followed by a fresh `NextResponse.redirect()`, or session cookies never
 * reach the browser.
 *
 * Pass the same `response` object you intend to return after
 * `exchangeCodeForSession` / `signOut`.
 */
export function createSupabaseRouteHandlerClient(
  request: NextRequest,
  response: NextResponse
): { supabase: SupabaseClient } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }
  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.");
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies
          .getAll()
          .map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options as CookieOptions);
        }
      },
    },
  });

  return { supabase };
}
