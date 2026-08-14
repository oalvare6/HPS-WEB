import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import {
  ADMIN_COOKIE_NAME,
  adminSessionSecondsRemaining,
  setAdminSessionCookie,
  shouldRenewAdminSession,
} from "@/lib/admin-session";

export const dynamic = "force-dynamic";

/**
 * Is the current visitor an admin? Called by `AdminGate` on every admin page
 * load, which makes it the natural place to slide the session forward.
 *
 * Renewal is what stops the "log in again, every single day" complaint: an
 * owner who opens the dashboard at least once a fortnight is never logged out,
 * while a session nobody touches still expires on its own.
 */
export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) {
    // Distinguish "your session ran out" from "you were never logged in" so the
    // login screen can say which, instead of appearing for no visible reason.
    const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
    const remaining = token ? adminSessionSecondsRemaining(token) : null;
    const expired = remaining !== null && remaining <= 0;

    const body = await unauthorized.json().catch(() => ({}));
    return NextResponse.json(
      { ...body, reason: expired ? "expired" : "unauthenticated" },
      { status: unauthorized.status }
    );
  }

  const response = NextResponse.json({ ok: true });

  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  const adminUser = process.env.ADMIN_USER;
  // `verifyAdmin` already proved the signature and the user match; this only
  // decides whether the remaining lifetime is short enough to be worth
  // re-issuing.
  if (token && adminUser && shouldRenewAdminSession(token)) {
    try {
      setAdminSessionCookie(response, adminUser);
    } catch (err) {
      // A signing failure must not log the owner out of a session that is
      // still perfectly valid — they simply don't get the extension.
      console.error("[admin/me] session renewal failed:", err);
    }
  }

  return response;
}
