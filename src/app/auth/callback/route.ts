import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Magic-link / OTP callback. Supabase Auth redirects the player here after
 * they click the link in their inbox. We exchange the short-lived `code`
 * for a real session cookie via PKCE, then redirect to `next` (validated)
 * or `/me`.
 *
 * Error paths land on `/login?error=<reason>` so the form can surface them.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = sanitizeNextPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(buildLoginErrorUrl(url, "missing_code"));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(buildLoginErrorUrl(url, "exchange_failed"));
  }

  const target = new URL(next ?? "/me", url.origin);
  return NextResponse.redirect(target);
}

function sanitizeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function buildLoginErrorUrl(currentUrl: URL, reason: string): URL {
  const login = new URL("/login", currentUrl.origin);
  login.searchParams.set("error", reason);
  return login;
}
