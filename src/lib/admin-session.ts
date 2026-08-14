import type { NextResponse } from "next/server";
import { signAdminSessionCookieValue } from "@/lib/app-signing";

export const ADMIN_COOKIE_NAME = "admin_token";

/**
 * How long an admin session lasts.
 *
 * This was 8 hours, which meant logging in Tuesday night and being locked out
 * Wednesday morning, every single time. The owner runs events from a phone at
 * the field; a login prompt at kickoff is worse than the marginal risk of a
 * longer-lived cookie on a device they control. Renewal below means an actively
 * used session never lapses, while a genuinely abandoned one still does.
 */
export const ADMIN_SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

/** Re-issue once the session is past its halfway point. */
const RENEW_AFTER_SEC = ADMIN_SESSION_MAX_AGE_SEC / 2;

export function setAdminSessionCookie(response: NextResponse, adminUser: string): void {
  response.cookies.set(ADMIN_COOKIE_NAME, signAdminSessionCookieValue(adminUser, ADMIN_SESSION_MAX_AGE_SEC), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // `strict` drops the cookie on any top-level navigation that starts
    // somewhere else — a WhatsApp message, a text, an emailed link — which is
    // exactly how the owner opens the dashboard at the field. `lax` still
    // withholds it from cross-site POSTs, which is the attack that matters.
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SEC,
  });
}

/**
 * Seconds left on a session cookie, or null if it can't be read. Signature
 * verification is `verifyAdminSessionCookieValue`'s job — this only peeks at
 * the expiry, so never treat a number here as proof the token is genuine.
 */
export function adminSessionSecondsRemaining(token: string): number | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const payload = JSON.parse(
      Buffer.from(token.slice(0, dot), "base64url").toString("utf8")
    ) as { exp?: number };
    if (typeof payload.exp !== "number") return null;
    return payload.exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

/** True once a verified session is past halfway and worth re-issuing. */
export function shouldRenewAdminSession(token: string): boolean {
  const remaining = adminSessionSecondsRemaining(token);
  if (remaining === null) return false;
  return remaining < RENEW_AFTER_SEC;
}
