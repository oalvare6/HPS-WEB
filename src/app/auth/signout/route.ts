import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server";

/**
 * Player sign-out. Clears the Supabase Auth session cookies and redirects
 * home. Does not affect the admin HMAC cookie.
 *
 * POST-only so it can't be triggered by a random link — a GET version would be
 * fired by link prefetching and by crawlers, signing people out at random.
 *
 * ⚠ This route is excluded from the middleware matcher on purpose
 * (`src/middleware.ts`). Middleware calls `getUser()`, which refreshes an
 * expiring session and attaches new `sb-*` cookies to its own response; those
 * get merged with the deletions set below and can win, so sign-out silently
 * does nothing. If you ever put this path back under the matcher, sign-out
 * breaks intermittently and looks like a UI bug.
 *
 * `scope: "local"` clears this browser only. A global sign-out revokes every
 * refresh token on the account, which would kick the same person off their
 * other devices — not what "sign out" means to a player.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });

  // The redirect target renders the header, which reads the session. A cached
  // copy of the signed-in header would make sign-out look like it failed.
  response.headers.set("Cache-Control", "no-store, max-age=0");

  const { supabase } = createSupabaseRouteHandlerClient(request, response);

  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (err) {
    // An already-expired session throws rather than no-ops. The cookies still
    // need clearing, which the fallback below guarantees.
    console.error("[auth/signout] signOut failed:", err);
  }

  // Belt and braces: if `signOut` bailed before the storage adapter ran, the
  // session cookies would survive and the player would stay signed in. Expire
  // every Supabase auth cookie we can see, including the `.0`/`.1` chunks a
  // large session gets split across.
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-") && name.includes("auth-token")) {
      response.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
  }

  return response;
}
