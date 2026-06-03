import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase-server";

/**
 * Player sign-out. Clears the Supabase Auth session cookies and redirects
 * home. Does not affect the admin HMAC cookie.
 *
 * POST-only so it can't be triggered by a random link.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });
  const { supabase } = createSupabaseRouteHandlerClient(request, response);
  await supabase.auth.signOut();
  return response;
}
