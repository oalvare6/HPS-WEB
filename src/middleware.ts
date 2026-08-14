import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase-server";

/**
 * Phase 6 middleware.
 *
 * - Refreshes the Supabase auth session cookie on every matched request via
 *   `@supabase/ssr`. This is what keeps magic-link sessions alive across
 *   Server Components.
 * - Protects `/me/*`: anonymous visitors are redirected to
 *   `/login?next=<original-path>`.
 *
 * Does NOT touch admin auth (HMAC cookie via `src/lib/app-signing.ts`). The
 * two cookie namespaces are independent.
 */
export async function middleware(request: NextRequest) {
  const { supabase, response } = createSupabaseMiddlewareClient(request);

  if (!supabase) {
    // Env vars missing — fail open. The dev/preview site keeps working; the
    // player auth flow will surface its own error when the route runs.
    return response;
  }

  // IMPORTANT: do not insert code between the client creation above and the
  // `getUser()` call below. The session-refresh side effect lands during
  // this call and must be the first thing we do.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  // Player-facing routes that REQUIRE a session. Everything else under
  // /auth/* (callback, claim, signout), /login, /register/*, /pay/* and
  // /api/me/* is intentionally NOT gated here — those pages read the session
  // themselves and decide what to show.
  //
  // `/register` and `/pay` in particular must stay open to anonymous visitors:
  // signing up and paying do not require an account, and gating them would put
  // a sign-in wall in front of the only thing the business needs to happen.
  const isProtected = pathname === "/me" || pathname.startsWith("/me/");

  if (isProtected && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    redirect.searchParams.set("next", pathname + (request.nextUrl.search || ""));
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  // Run on everything except Next.js internals and static assets. We need
  // session refresh on regular page navigations, not just on /me/*.
  //
  // `/auth/signout` is EXCLUDED deliberately, and removing it from this list
  // breaks sign-out. The `getUser()` call above refreshes an expiring session
  // and writes fresh `sb-*` cookies onto the middleware response; the sign-out
  // route then writes cookie *deletions* onto its own. Next merges both sets of
  // Set-Cookie headers and the refreshed pair can win, leaving the player
  // signed in with nothing on screen to explain why. The route reads and clears
  // the session itself and must not have it refreshed underneath.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon\\.png|apple-icon\\.png|brand/|auth/signout|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml)$).*)",
  ],
};
