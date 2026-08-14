/**
 * Where one person stands on one event — loaded once, rendered by two screens.
 *
 * ## Why this exists
 *
 * The site already knew the answer and only told you on `/register`. Everywhere
 * else, the button was a property of the *event*: `tournamentPrimaryCta` reads
 * `registration_open` and `payments_open` and nothing about the visitor. So a
 * player who had signed up, picked a team and signed a waiver still saw
 * **"Sign up to play"** on the event page — the operator's report: *"it still
 * says register even though I am registered."*
 *
 * The load-bearing decision here is what this module does **not** contain: no
 * branch logic of its own. It loads rows and hands them to `resolveSignupState`,
 * the same function `/register` has always used, whose 16-case branch table is
 * covered by `scripts/test-signup-state.ts`. Two screens, one answer, one place
 * to change it. A second copy of "is this player square with us" is exactly how
 * this codebase ended up with three copies of "record a signed waiver" and three
 * ways to express team membership.
 *
 * ⚠ **This module never calls DocuSeal.** `/register` and `/pay` reconcile
 * against DocuSeal before deciding, because they are about to block a player at
 * a gate. The event page only routes people to those screens, and it is the
 * most-visited page on the site — putting a 6-second third-party round trip in
 * its render path would be paying for a check whose answer nobody acts on here.
 * See `lib/waiver-reconcile.ts`.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  defaultWaiverTypeFor,
  resolveSignupState,
  type SignupRegistrationSnapshot,
  type SignupState,
} from "@/lib/signup-state";
import { acceptsPayments, acceptsRegistrations } from "@/lib/tournament-state";
import type { Contact, Tournament } from "@/lib/types";

/** The slice of a contact this module needs. `/register` passes the whole row. */
export type StandingContact = Pick<
  Contact,
  "id" | "waiver_type" | "waiver_signed_at" | "waiver_expires_at"
>;

export type EventStanding = {
  state: SignupState;
  /** The registration behind the state, when there is one. */
  registration: SignupRegistrationSnapshot | null;
  /** Resolved team name, so callers don't each run the same lookup. */
  teamName: string | null;
  /** `"$80.00"`, or null when the event has no fee configured. */
  entryFeeLabel: string | null;
};

/**
 * The most recent **live** registration this person holds for this event.
 *
 * A lookup failure returns null rather than throwing: on `/register` that falls
 * through to the full form (always safe — the API rejects a duplicate), and on
 * the event page it falls through to the signed-out CTA. Both are the answer we
 * would have given anyway before this feature existed.
 *
 * ⚠ `cancelled_at is null` is the load-bearing filter here. This one function
 * feeds both `/register` and the `/events/[slug]` CTA, so without it a player
 * who has just cancelled is still told "You're on the roster" on the two screens
 * most likely to be the next thing they look at.
 */
export async function findEventRegistration(
  tournamentId: string,
  contactId: string
): Promise<SignupRegistrationSnapshot | null> {
  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select("id, payment_status, waiver_signed, team_id, payment_method")
    .eq("tournament_id", tournamentId)
    .eq("contact_id", contactId)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[event-standing] registration lookup failed:", error.message);
    return null;
  }
  return (data as SignupRegistrationSnapshot) ?? null;
}

export async function teamNameFor(teamId: string | null): Promise<string | null> {
  if (!teamId) return null;
  const { data } = await supabaseAdmin
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .maybeSingle();
  return data?.name ?? null;
}

export function formatFee(
  cents: number | null,
  fallback: number | null
): string | null {
  const value = cents != null ? cents / 100 : fallback;
  if (value == null) return null;
  return `$${value.toFixed(2)}`;
}

/**
 * Load everything the two screens need about this person and this event.
 *
 * `registrationOverride` exists for `/register`, which reconciles the waiver
 * with DocuSeal *before* resolving state and must be able to feed the corrected
 * row back in — otherwise a player who just signed would be told to sign again
 * on the very screen built to stop that happening.
 */
export async function loadEventStanding({
  event,
  contact,
  waiverTypeParam,
  registrationOverride,
}: {
  event: Tournament;
  contact: StandingContact | null;
  /** `?type=youth` from the URL, when the visitor asked for a specific waiver. */
  waiverTypeParam?: string | null;
  registrationOverride?: SignupRegistrationSnapshot | null;
}): Promise<EventStanding> {
  const registration =
    registrationOverride !== undefined
      ? registrationOverride
      : contact
        ? await findEventRegistration(event.id, contact.id)
        : null;

  const state = resolveSignupState({
    contact,
    registration,
    waiverType: defaultWaiverTypeFor(contact, waiverTypeParam),
    canRegister: acceptsRegistrations(event),
    canPay: acceptsPayments(event),
  });

  return {
    state,
    registration,
    teamName: await teamNameFor(registration?.team_id ?? null),
    entryFeeLabel: formatFee(event.entry_fee_cents, event.entry_fee),
  };
}
