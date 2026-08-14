import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server";

/**
 * OAuth callback. Supabase Auth redirects the player here after they finish the
 * Google consent screen. We exchange the short-lived `code` for a real session
 * cookie via PKCE, then redirect to `next` (validated) or `/me`.
 *
 * ⚠ This route only ever runs if its own URL is in the Supabase Redirect URLs
 * allow-list. When it is not, Supabase sends the code to the Site URL instead
 * and this handler is never reached — the symptom is a player landing on an
 * unfamiliar hostname with no session and no error. See docs/AUTH-CONFIG.md §1.
 *
 * Recovery handling was removed with password sign-in (D5) — there is no
 * password to recover. A stray `type=recovery` link from before the change now
 * lands on `/me` with a valid session, which is harmless and better than
 * pointing at a page that no longer exists.
 *
 * Error paths land on `/login?error=<reason>` so the page can surface them.
 * OAuth provider errors arrive as `?error=...&error_description=...` with no
 * `code`, so we check those before attempting the exchange.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");
  const providerErrorDescription = url.searchParams.get("error_description");
  const next = sanitizeNextPath(url.searchParams.get("next"));

  // OAuth providers redirect back with `?error=...` when the user cancels
  // the consent screen, the provider rejects the request, or the redirect
  // URL allow-list is misconfigured. Surface the description directly so
  // operators can see what the provider actually said.
  if (providerError) {
    console.error(
      "[auth/callback] provider error:",
      providerError,
      providerErrorDescription
    );
    return NextResponse.redirect(
      buildLoginErrorUrl(url, "oauth_failed", providerErrorDescription)
    );
  }

  if (!code) {
    return NextResponse.redirect(buildLoginErrorUrl(url, "missing_code"));
  }

  const target = new URL(next ?? "/me", url.origin);
  const response = NextResponse.redirect(target);
  const { supabase } = createSupabaseRouteHandlerClient(request, response);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(buildLoginErrorUrl(url, "exchange_failed"));
  }

  return response;
}

function sanitizeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function buildLoginErrorUrl(
  currentUrl: URL,
  reason: string,
  description?: string | null
): URL {
  const login = new URL("/login", currentUrl.origin);
  login.searchParams.set("error", reason);
  if (description) {
    login.searchParams.set("error_description", description);
  }
  return login;
}
