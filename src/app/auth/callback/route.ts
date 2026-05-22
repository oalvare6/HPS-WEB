import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Magic-link / OTP / recovery / OAuth callback. Supabase Auth redirects the
 * player here after they click an email link or finish a Google / Apple
 * consent screen. We exchange the short-lived `code` for a real session
 * cookie via PKCE, then redirect to `next` (validated) or `/me` — except
 * for `type=recovery`, which defaults to `/auth/reset` so the player lands
 * on the "set a new password" surface.
 *
 * Error paths land on `/login?error=<reason>` so the form can surface them.
 * OAuth provider errors arrive as `?error=...&error_description=...` with
 * no `code`, so we check those before attempting the exchange.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const providerError = url.searchParams.get("error");
  const providerErrorDescription = url.searchParams.get("error_description");
  const explicitNext = sanitizeNextPath(url.searchParams.get("next"));
  // For password-recovery flows we mint links via `?next=/auth/reset`, but
  // be defensive: a Supabase project misconfiguration that drops the `next`
  // could otherwise dump a recovering user back on `/me` with a normal
  // session and no UI to set a new password.
  const next =
    explicitNext ?? (type === "recovery" ? "/auth/reset" : null);

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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    const reason = type === "recovery" ? "recovery_expired" : "exchange_failed";
    return NextResponse.redirect(buildLoginErrorUrl(url, reason));
  }

  const target = new URL(next ?? "/me", url.origin);
  return NextResponse.redirect(target);
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
