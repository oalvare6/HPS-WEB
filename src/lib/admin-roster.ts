/**
 * The Roster screen's shape and rules (Track A3).
 *
 * One row = one person playing one event, which is the model Track B3 makes
 * real with `roster_entries`. Until then this module stitches the two tables
 * that currently hold that information — `registrations` (season players) and
 * `drop_ins` (one-night guests) — into a single list, so the owner has one
 * screen that answers "who is playing Friday and who still owes me money".
 */
import { WAIVER_VALIDITY_DAYS } from "@/lib/contacts";

export type RosterRole = "player" | "guest";

/** Where a row's waiver ✓ came from, so an override can be told from a signature. */
export type WaiverEvidence =
  | "document" // a real signed PDF is on file
  | "signed" // marked signed, but no document link was ever stored
  | "override" // an admin ticked the box; there is no signature
  | "none";

export type RosterRow = {
  /** `registrations.id` or `drop_ins.id` — unique within the roster. */
  id: string;
  role: RosterRole;
  contactId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
  waiverOk: boolean;
  waiverEvidence: WaiverEvidence;
  waiverExpiresAt: string | null;
  paid: boolean;
  paymentStatus: string;
  /** Flagged by `linkRegistrationToContact` when email and phone disagree. */
  needsReview: boolean;
  /** True for a walk-in added from this screen with details still missing. */
  incomplete: boolean;
  createdAt: string;
};

export type RosterTeam = { id: string; name: string; color: string | null };

export type RosterTotals = {
  signedUp: number;
  paid: number;
  unpaid: number;
  waiverOnFile: number;
  waiverMissing: number;
  guests: number;
  unassigned: number;
};

export type RosterPayload = {
  rows: RosterRow[];
  teams: RosterTeam[];
  totals: RosterTotals;
};

/**
 * Placeholder written into the NOT NULL columns `registrations` still has, when
 * the owner adds a walk-in with nothing but a name and a phone number.
 *
 * Track A does not reshape `registrations`, and five of its columns reject
 * NULL. Rather than make the owner type an email, a date of birth and an
 * emergency contact for someone standing in front of them, we write these
 * markers and show the row as "needs details" on the roster. Track B3 removes
 * the need entirely by moving person fields onto `people`.
 */
export const WALK_IN_PLACEHOLDER = {
  /** Recognisable on sight and greppable; Track B1 can sweep for it. */
  emailDomain: "walk-in.hps.local",
  dob: "1900-01-01",
  text: "",
} as const;

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.endsWith(`@${WALK_IN_PLACEHOLDER.emailDomain}`));
}

/**
 * Deterministic placeholder email for a walk-in, derived from their phone.
 *
 * Derived rather than random so that adding the same person twice lands on the
 * same contact instead of inventing a second human — the exact failure the
 * rebuild plan documents from hand-typed email typos.
 */
export function walkInEmailForPhone(normalizedPhone: string): string {
  const digits = normalizedPhone.replace(/\D/g, "");
  return `walkin-${digits}@${WALK_IN_PLACEHOLDER.emailDomain}`;
}

/** Whether a `waiver_signed_at` is still inside the 365-day window. */
export function isWaiverDateValid(
  signedAt: string | null | undefined,
  now = Date.now()
): boolean {
  if (!signedAt) return false;
  const signedMs = Date.parse(signedAt);
  if (Number.isNaN(signedMs)) return false;
  return signedMs + WAIVER_VALIDITY_DAYS * 24 * 60 * 60 * 1000 > now;
}

export function emptyTotals(): RosterTotals {
  return {
    signedUp: 0,
    paid: 0,
    unpaid: 0,
    waiverOnFile: 0,
    waiverMissing: 0,
    guests: 0,
    unassigned: 0,
  };
}

export function totalsFromRows(rows: RosterRow[]): RosterTotals {
  const t = emptyTotals();
  for (const r of rows) {
    t.signedUp++;
    if (r.paid) t.paid++;
    else t.unpaid++;
    if (r.waiverOk) t.waiverOnFile++;
    else t.waiverMissing++;
    if (r.role === "guest") t.guests++;
    if (!r.teamId && r.role === "player") t.unassigned++;
  }
  return t;
}

export function rosterFullName(r: Pick<RosterRow, "firstName" | "lastName">): string {
  return [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
}
