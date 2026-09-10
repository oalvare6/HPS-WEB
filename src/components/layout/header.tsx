import { getSiteSetting } from "@/lib/site-settings";
import { HeaderClient } from "@/components/layout/header-client";
import type { HeaderWaiverStatus } from "@/components/layout/WaiverStatusLine";
import { getCurrentPlayer } from "@/lib/player-auth";
import { isContactWaiverValid } from "@/lib/contacts";
import type { Contact } from "@/lib/types";

/**
 * Server-rendered header. Resolves the player's auth status, display name and
 * waiver standing through the cached `getCurrentPlayer` helper, so a single
 * Supabase auth round-trip is shared with anything else on the page that
 * also needs the player surface (e.g. the page itself).
 *
 * Failures here must never break the header for anonymous visitors.
 */
export async function Header() {
  /*
    The operator's pills only (facility status). The live "Registration open"
    dot is derived from the events on the homepage hero (lib/status-pills.ts)
    and deliberately NOT here: this header is baked into the static pages
    (/about, the legal pages) at build time, so a registration claim in it
    would be frozen at the last deploy — the stale-flag failure Stage 2.0
    exists to remove. The setting's default no longer says "Registration Open"
    for the same reason.
  */
  const statusItems = await getSiteSetting("home.status_pills");

  let isAuthed = false;
  let displayName: string | null = null;
  let waiverStatus: HeaderWaiverStatus | null = null;
  try {
    const player = await getCurrentPlayer();
    if (player) {
      isAuthed = true;
      displayName = pickDisplayName(player);
      waiverStatus = describeWaiver(player.contact);
    }
  } catch {
    isAuthed = false;
    displayName = null;
    waiverStatus = null;
  }

  return (
    <HeaderClient
      statusItems={statusItems}
      isAuthed={isAuthed}
      displayName={displayName}
      waiverStatus={waiverStatus}
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

/**
 * The one-line waiver answer a signed-in player wants from the header: are they
 * cleared to play, and until when.
 *
 * Validity comes from `isContactWaiverValid` rather than a date comparison
 * written here — it also enforces the type match, which is why an adult waiver
 * does not silently cover a youth registration.
 */
function describeWaiver(contact: Contact): HeaderWaiverStatus {
  if (!contact.waiver_type || !contact.waiver_signed_at) {
    return { tone: "warn", label: "Waiver needed" };
  }
  if (!isContactWaiverValid(contact, contact.waiver_type)) {
    return { tone: "warn", label: "Waiver expired" };
  }
  const expires = contact.waiver_expires_at
    ? formatDate(contact.waiver_expires_at)
    : null;
  return {
    tone: "ok",
    label: expires ? `Waiver good through ${expires}` : "Waiver on file",
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
