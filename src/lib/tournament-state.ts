import type { Tournament, TournamentStatus } from "@/lib/types";

/**
 * The four states an event can be in, as the operator thinks about them.
 *
 *   draft    — not shown publicly (reserved; storage lands in Phase 1b)
 *   open     — public, accepting signups and money
 *   closed   — public, not accepting money (sign-ups closed or not yet open)
 *   finished — the event has happened; archive only, never sells anything
 *
 * `finished` is **always derived from the calendar**, never trusted from a
 * stored column. That is the whole point of this module: on 2026-08-12 the site
 * was still selling entry to an Open Play that happened on 2026-08-09, because
 * `payments_open` was a manual flag nobody remembered to turn off. Deriving the
 * end of an event from its own dates means forgetting is no longer possible.
 */
export type EventState = "draft" | "open" | "closed" | "finished" | "cancelled";

/** Houston. All event dates are operator-entered local dates. */
const EVENT_TIME_ZONE = "America/Chicago";

/**
 * Calendar day (YYYY-MM-DD) of a stored tournament timestamp.
 *
 * Tournament dates are written as noon UTC precisely so the intended calendar
 * day survives a timezone conversion in either direction, so we read the day
 * back off the UTC clock rather than shifting into local time.
 */
function eventDay(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Today's calendar day in Houston, as YYYY-MM-DD. */
function todayInHouston(now: Date): string {
  // en-CA renders as YYYY-MM-DD, which sorts lexicographically.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type DatedTournament = {
  start_date: string | null;
  end_date: string | null;
};

/**
 * True once the event's last day is behind us.
 *
 * An event stays live for the whole of its final day — an event ending today is
 * NOT past, so a tournament running tonight keeps taking drop-in money. It flips
 * the moment the calendar rolls over in Houston.
 *
 * Undated events are never considered past; there is nothing to compare against
 * and silently hiding them would be worse than leaving them visible.
 */
export function isPastEvent(t: DatedTournament, now: Date = new Date()): boolean {
  const last = t.end_date ?? t.start_date;
  if (!last) return false;
  const lastDay = eventDay(last);
  if (!lastDay) return false;
  return lastDay < todayInHouston(now);
}

type StatefulTournament = DatedTournament & {
  status: TournamentStatus;
  registration_open: boolean;
  payments_open: boolean;
};

/**
 * The effective state of an event, combining what the operator stored with what
 * the calendar says. The calendar wins for "is it over".
 */
export function resolveEventState(
  t: StatefulTournament,
  now: Date = new Date()
): EventState {
  if (t.status === "cancelled") return "cancelled";
  if (t.status === "completed" || isPastEvent(t, now)) return "finished";
  if (t.registration_open || t.payments_open) return "open";
  return "closed";
}

/**
 * Whether this event may take money right now. Every checkout and pay-eligibility
 * path must gate on this rather than reading `payments_open` directly.
 */
export function acceptsPayments(
  t: StatefulTournament,
  now: Date = new Date()
): boolean {
  return resolveEventState(t, now) === "open" && t.payments_open;
}

/** Whether this event may take new signups right now. */
export function acceptsRegistrations(
  t: StatefulTournament,
  now: Date = new Date()
): boolean {
  return resolveEventState(t, now) === "open" && t.registration_open;
}

/**
 * The status to *show* the public, which may differ from the stored column when
 * an operator has not yet marked a past event completed.
 */
export function displayStatus(
  t: StatefulTournament,
  now: Date = new Date()
): TournamentStatus {
  const state = resolveEventState(t, now);
  if (state === "finished") return "completed";
  if (state === "cancelled") return "cancelled";
  return t.status === "completed" ? "upcoming" : t.status;
}

/**
 * Narrowed view of a tournament with the calendar backstop already applied, so
 * UI components can destructure one object instead of re-deriving per field.
 */
export type ResolvedTournament = Tournament & {
  effectiveState: EventState;
  effectiveStatus: TournamentStatus;
  canPay: boolean;
  canRegister: boolean;
};

export function resolveTournament(
  t: Tournament,
  now: Date = new Date()
): ResolvedTournament {
  return {
    ...t,
    effectiveState: resolveEventState(t, now),
    effectiveStatus: displayStatus(t, now),
    canPay: acceptsPayments(t, now),
    canRegister: acceptsRegistrations(t, now),
  };
}
