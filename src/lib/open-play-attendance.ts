/**
 * The database half of open play (D7): who is coming tonight, and who owes the
 * door price.
 *
 * Kept separate from `open-play-free-entry.ts` on purpose. That module is the
 * rule and stays pure so its branch table can be tested without a database
 * (scripts/test-open-play-free-entry.ts) — the same split `signup-state.ts`
 * uses. This module is the only place that reads rows to feed it.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isOpenPlay } from "@/lib/event-kind";
import {
  parseFreeEntryTournamentIds,
  resolveDoorPriceCents,
  resolveOpenPlayEntitlement,
  type FreeEntryRegistrationSnapshot,
  type OpenPlayEntitlement,
} from "@/lib/open-play-free-entry";
import type { SignupWaiverType } from "@/lib/signup-state";
import type { Contact } from "@/lib/types";

/** The event fields this decision needs. Kept narrow so callers can `.select()` exactly these. */
export type OpenPlayEventForEntitlement = {
  id: string;
  kind?: string | null;
  entry_fee_cents: number | null;
  drop_in_fee_cents: number;
  free_entry_tournament_ids?: string[] | null;
};

/**
 * Does this person owe the door price for this night?
 *
 * **This is the only correct way to answer that question.** The rule is simple
 * enough to reproduce from the JavaScript bundle, so a request body claiming
 * "I'm free" would be a free-entry vulnerability — the answer is derived here,
 * from rows the caller does not control.
 *
 * Returns `must_pay` for a contact we cannot identify, and for any event whose
 * config is empty or unreadable. Both are the safe direction: the worst case is
 * somebody being asked for $15 they can dispute at the field, rather than the
 * night being given away.
 */
export async function loadOpenPlayEntitlement(input: {
  contact: Pick<
    Contact,
    "id" | "waiver_type" | "waiver_signed_at" | "waiver_expires_at"
  > | null;
  event: OpenPlayEventForEntitlement;
  waiverType: SignupWaiverType;
}): Promise<OpenPlayEntitlement> {
  const { contact, event, waiverType } = input;

  const freeEntryTournamentIds = parseFreeEntryTournamentIds(
    event.free_entry_tournament_ids
  );
  const doorPriceCents = resolveDoorPriceCents(event);

  // Nothing configured means nobody is comped, so there is no reason to go and
  // read this person's history. Short-circuiting also means the common case —
  // every event that has never been configured — costs zero extra queries.
  if (freeEntryTournamentIds.length === 0 || !contact) {
    return resolveOpenPlayEntitlement({
      contact,
      registrations: [],
      freeEntryTournamentIds,
      doorPriceCents,
      waiverType,
    });
  }

  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select("tournament_id, team_id, payment_status, cancelled_at")
    .eq("contact_id", contact.id)
    .in("tournament_id", freeEntryTournamentIds)
    .is("cancelled_at", null);

  if (error) {
    // Fail closed. A database hiccup must not hand out free entry — the player
    // can be let in manually at the field, which is recoverable; a comp that
    // nobody authorised is not.
    console.error(
      "[open-play] free-entry lookup failed, defaulting to must_pay:",
      error.message
    );
    return resolveOpenPlayEntitlement({
      contact,
      registrations: [],
      freeEntryTournamentIds,
      doorPriceCents,
      waiverType,
    });
  }

  return resolveOpenPlayEntitlement({
    contact,
    registrations: (data ?? []) as FreeEntryRegistrationSnapshot[],
    freeEntryTournamentIds,
    doorPriceCents,
    waiverType,
  });
}

/** What the signup screen needs to say "you're in free, and here's why". */
export type OpenPlayFreeEntryNotice = {
  viaTournamentId: string;
  /** Null only if the conferring tournament was deleted between the two reads. */
  viaTournamentTitle: string | null;
};

/**
 * The same question as `loadOpenPlayEntitlement`, asked one screen earlier.
 *
 * That function decides the money at the moment somebody confirms. This one
 * exists because deciding correctly is not the same as *saying so*: without it
 * the signup card shows a door price and asks "how are you paying?", the player
 * picks a method for a fee they do not owe, and only then does the server
 * quietly comp them. The charge was always right; the screen was wrong.
 *
 * Returns null for anything that is not a comped open-play spot — every
 * tournament, every un-entitled player, every failure — so a caller can render
 * the result unconditionally and a fault degrades to "you owe the door price",
 * which is the same safe direction the entitlement rule itself takes.
 *
 * ⚠ This is a display hint and nothing more. It must never be the thing that
 * decides what somebody is charged: it runs against the roster as it was one
 * page-load ago, and the browser could be lying about having seen it. The
 * authority stays in `/api/register/join`, which re-derives the entitlement at
 * write time. The two agreeing is a convenience; only the write-time answer is
 * binding.
 *
 * The title is resolved here rather than passed as an id because the id is not
 * an explanation. "You're on the Community Cup roster" is what settles a
 * question at the field; a UUID is not.
 */
export async function loadOpenPlayFreeEntry(input: {
  contact: Pick<
    Contact,
    "id" | "waiver_type" | "waiver_signed_at" | "waiver_expires_at"
  > | null;
  event: OpenPlayEventForEntitlement;
  waiverType: SignupWaiverType;
}): Promise<OpenPlayFreeEntryNotice | null> {
  if (!isOpenPlay(input.event)) return null;

  const entitlement = await loadOpenPlayEntitlement(input);
  if (entitlement.kind !== "free") return null;

  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select("title")
    .eq("id", entitlement.viaTournamentId)
    .maybeSingle();

  if (error) {
    // Still free — we just cannot name the reason. Saying "you're in free"
    // without the why beats charging somebody who is entitled.
    console.error(
      "[open-play] could not name the conferring tournament:",
      error.message
    );
  }

  return {
    viaTournamentId: entitlement.viaTournamentId,
    viaTournamentTitle: data?.title ?? null,
  };
}

export type OpenPlayAttendee = {
  firstName: string;
  lastInitial: string;
};

/**
 * The public "who's coming" list for one open-play night.
 *
 * Surnames are truncated by `public.open_play_attendees()` **in SQL**, not here
 * and not in the component. If a full surname reached this process it would
 * also reach the RSC payload, and a list that looks private in the UI while
 * shipping full names down the wire is worse than no list at all.
 *
 * The function is hard-scoped to `kind = 'open_play'` in the database, so this
 * can never publish a tournament roster even if called with the wrong id.
 * Returns an empty list on any failure — an event page must not 500 because the
 * attendee list is unavailable.
 */
export async function getOpenPlayAttendees(
  eventId: string
): Promise<OpenPlayAttendee[]> {
  const { data, error } = await supabaseAdmin.rpc("open_play_attendees", {
    p_event_id: eventId,
  });

  if (error) {
    console.error("[open-play] attendee list failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as { first_name: string; last_initial: string }[];
  return rows.map((r) => ({
    firstName: r.first_name,
    lastInitial: r.last_initial ?? "",
  }));
}

/** "Omar A." — one place, so the list and the admin view never disagree. */
export function attendeeDisplayName(a: OpenPlayAttendee): string {
  return a.lastInitial ? `${a.firstName} ${a.lastInitial}.` : a.firstName;
}
