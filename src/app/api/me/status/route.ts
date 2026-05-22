import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/player-auth";

export const dynamic = "force-dynamic";

/**
 * Lightweight player auth-status probe. Used by client components that
 * need a fresh `{ authed, displayName }` without re-rendering a Server
 * Component layout (e.g. detecting a sign-out that happened in another
 * tab, or refreshing the header CTA after a client-side operation).
 *
 * Implementation note: `getCurrentPlayer` is `cache()`-wrapped, so when
 * this route runs as the second call inside a single request it's free.
 * `Cache-Control: no-store` ensures we never serve a stale answer from a
 * CDN edge that thinks two different users share the same response.
 */
export async function GET() {
  const player = await getCurrentPlayer();

  if (!player) {
    return NextResponse.json(
      { authed: false, displayName: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const first = (player.contact.first_name ?? "").trim();
  const displayName = first || player.email;

  return NextResponse.json(
    { authed: true, displayName },
    { headers: { "Cache-Control": "no-store" } }
  );
}
