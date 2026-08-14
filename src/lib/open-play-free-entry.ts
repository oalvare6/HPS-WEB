/**
 * Who walks into an open-play night without paying, and why (D7).
 *
 * ## The one thing this module exists to prevent
 *
 * A client-supplied "I'm free" flag. The rule below is simple enough that anyone
 * who reads the JavaScript bundle could reproduce it, and if the browser were
 * trusted to report the answer, forging free entry would be a one-line fetch.
 * So the decision is made here, server-side, from rows the caller cannot choose,
 * and the signup path asks this module rather than believing the request body.
 *
 * ## The rule, in words
 *
 * You get in free if you hold a live spot on a tournament the organiser named
 * for *this* night: not cancelled, assigned to a team, and not refunded.
 *
 * ### Why `team_id IS NOT NULL`
 *
 * A registration with no team is somebody who started signing up. Being on a
 * team is the point at which the owner has actually counted you into a season —
 * it is the same signal `progressByTeam` uses to decide who is really on a
 * roster. Without it, an abandoned half-finished signup for an $80 tournament
 * would buy free Fridays forever.
 *
 * ### Why `payment_method` is not consulted
 *
 * It is NULL on three of the four live Community Cup registrations, including
 * both players who paid $80 by card — it is only ever written on the manual
 * cash path. A rule that read it would charge $15 at the door to people who had
 * already paid, which is the single worst outcome this feature can produce.
 *
 * ## What this module deliberately does not decide
 *
 * Whether the event is selling at all. `acceptsRegistrations()` / `acceptsPayments()`
 * in `tournament-state.ts` own that, for open play exactly as for tournaments,
 * and they are derived from the calendar so they fail safe. Per the standing
 * rule in `lib/event-kind.ts`, `kind` decides words and panels — never money.
 * This module is only ever asked *after* those gates have said yes, and it only
 * answers "does this person owe the door price".
 *
 * The branch table is pure and lives in `resolveOpenPlayEntitlement`, so it can
 * be tested without a database — see scripts/test-open-play-free-entry.ts.
 */
import { isContactWaiverValid } from "@/lib/contacts";
import type { Contact, RegistrationPaymentStatus } from "@/lib/types";
import type { SignupWaiverType } from "@/lib/signup-state";

/**
 * Registration payment states that still count as holding a live spot.
 *
 * `pending` is in on purpose: a player who signed up and owes the entry fee is
 * still on the roster, and the owner's answer to "are they one of ours" is yes.
 *
 * `waived` is in because it means *the owner personally comped their $80*.
 * Leaving it out would have produced the sharpest possible version of this
 * feature's worst bug: the people he decided to let in free would be the exact
 * people charged $15 at the door. No row is in that state today, which is why
 * it was worth fixing before one is.
 *
 * `refunded` is out — they took their money back and left. `partial` is out:
 * it is unused in production and "paid us something once" is a weaker claim on
 * a free Friday than the owner having actively waived the fee.
 */
export const FREE_ENTRY_QUALIFYING_PAYMENT_STATUSES: readonly RegistrationPaymentStatus[] = [
  "paid",
  "pending",
  "waived",
];

/**
 * The only fields of a registration this decision may read. Narrow on purpose:
 * it is a standing reminder that name, email and `payment_method` are none of
 * this rule's business, and it lets the branch table be built by hand in a test.
 */
export type FreeEntryRegistrationSnapshot = {
  tournament_id: string | null;
  team_id: string | null;
  payment_status: RegistrationPaymentStatus;
  cancelled_at: string | null;
};

export type OpenPlayEntitlement =
  /**
   * We have no waiver on file for this person (or the one we have has lapsed or
   * is the wrong type). Nothing else matters yet — send them to sign, then ask
   * again. Free entry does not exempt anybody from a waiver.
   */
  | { kind: "waiver_required"; contactId: string }
  /**
   * In free. `viaTournamentId` is carried so the drop-in row can record *which*
   * tournament conferred it — the owner will want that the first time somebody
   * disputes it at the field, and "the system said so" is not an answer.
   */
  | { kind: "free"; contactId: string; viaTournamentId: string }
  /** Owes the door price. */
  | { kind: "must_pay"; contactId: string; amountCents: number };

export type OpenPlayEntitlementInput = {
  contact: Pick<
    Contact,
    "id" | "waiver_type" | "waiver_signed_at" | "waiver_expires_at"
  > | null;
  /**
   * Every registration this person holds across all events. Filtering happens
   * here rather than in the query so the branch table is testable and so there
   * is exactly one definition of "qualifying".
   */
  registrations: FreeEntryRegistrationSnapshot[];
  /** `tournaments.free_entry_tournament_ids` for the night being joined. */
  freeEntryTournamentIds: string[];
  /** The door price in cents, already resolved from the event. */
  doorPriceCents: number;
  waiverType: SignupWaiverType;
};

/**
 * The single qualifying registration, or null. Exported because the admin view
 * needs to answer "why is this person free" for a row that already exists.
 */
export function findQualifyingRegistration(
  registrations: FreeEntryRegistrationSnapshot[],
  freeEntryTournamentIds: string[]
): FreeEntryRegistrationSnapshot | null {
  // An empty list is the default for every event, and it means "nobody is
  // comped". Bailing here rather than falling through a filter keeps that the
  // loudest possible behaviour.
  if (freeEntryTournamentIds.length === 0) return null;

  const qualifying = new Set(freeEntryTournamentIds);

  return (
    registrations.find(
      (r) =>
        r.tournament_id !== null &&
        qualifying.has(r.tournament_id) &&
        r.cancelled_at === null &&
        r.team_id !== null &&
        FREE_ENTRY_QUALIFYING_PAYMENT_STATUSES.includes(r.payment_status)
    ) ?? null
  );
}

export function resolveOpenPlayEntitlement(
  input: OpenPlayEntitlementInput
): OpenPlayEntitlement {
  const {
    contact,
    registrations,
    freeEntryTournamentIds,
    doorPriceCents,
    waiverType,
  } = input;

  // Somebody we have never seen cannot be on a roster, so they cannot be free —
  // and they certainly have no waiver. `must_pay` with no contact id is not
  // representable, which is deliberate: the caller must resolve a contact first.
  if (!contact) {
    return { kind: "waiver_required", contactId: "" };
  }

  // The waiver is a legal gate, not a commercial one, so it comes first and is
  // never skipped for a free player. A comped Community Cup regular with a
  // lapsed waiver signs again before they play.
  if (!isContactWaiverValid(contact, waiverType)) {
    return { kind: "waiver_required", contactId: contact.id };
  }

  const qualifying = findQualifyingRegistration(
    registrations,
    freeEntryTournamentIds
  );

  if (qualifying?.tournament_id) {
    return {
      kind: "free",
      contactId: contact.id,
      viaTournamentId: qualifying.tournament_id,
    };
  }

  return { kind: "must_pay", contactId: contact.id, amountCents: doorPriceCents };
}

/**
 * What an open-play night charges at the door.
 *
 * `entry_fee_cents` is the source of truth — the `kind` migration says so
 * explicitly ("an open-play night has one price, and that is what
 * `entry_fee_cents` already holds"), and the live row carries 1500 there.
 * `drop_in_fee_cents` is the fallback only because `/api/stripe/checkout`
 * already falls back that way, and having two places disagree about tonight's
 * price is worse than either answer.
 */
export function resolveDoorPriceCents(
  event: Pick<
    { entry_fee_cents: number | null; drop_in_fee_cents: number },
    "entry_fee_cents" | "drop_in_fee_cents"
  >
): number {
  const entry = event.entry_fee_cents;
  if (typeof entry === "number" && entry > 0) return entry;
  const dropIn = event.drop_in_fee_cents;
  if (typeof dropIn === "number" && dropIn > 0) return dropIn;
  return 0;
}

/**
 * Narrow whatever came back from the database (or an admin form post) into a
 * clean id list.
 *
 * Written defensively because the column is a Postgres array arriving through
 * PostgREST: an un-migrated database returns `undefined`, and a hand-edited row
 * can hold nulls. Anything unrecognised degrades to "no free entry", which is
 * the safe direction — the same way `resolveEventKind` degrades to 'tournament'.
 */
export function parseFreeEntryTournamentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v === "string" && UUID_RE.test(v)) seen.add(v.toLowerCase());
  }
  return [...seen];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
