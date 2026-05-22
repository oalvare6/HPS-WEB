import { getSiteSetting } from "@/lib/site-settings";
import { HeaderClient } from "@/components/layout/header-client";
import { getCurrentPlayer } from "@/lib/player-auth";

/**
 * Server-rendered header. Resolves the player's auth status and display
 * name through the cached `getCurrentPlayer` helper, so a single
 * Supabase auth round-trip is shared with anything else on the page that
 * also needs the player surface (e.g. the page itself).
 *
 * Failures here must never break the header for anonymous visitors.
 */
export async function Header() {
  const statusItems = await getSiteSetting("home.status_pills");

  let isAuthed = false;
  let displayName: string | null = null;
  try {
    const player = await getCurrentPlayer();
    if (player) {
      isAuthed = true;
      displayName = pickDisplayName(player);
    }
  } catch {
    isAuthed = false;
    displayName = null;
  }

  return (
    <HeaderClient
      statusItems={statusItems}
      isAuthed={isAuthed}
      displayName={displayName}
    />
  );
}

function pickDisplayName(
  player: NonNullable<Awaited<ReturnType<typeof getCurrentPlayer>>>
): string {
  const first = (player.contact.first_name ?? "").trim();
  if (first) return first;
  return player.email;
}
