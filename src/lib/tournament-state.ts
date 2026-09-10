import type { Tournament, TournamentStatus } from "@/lib/types";

/**
 * ONE place decides what an event is right now.
 *
 * ## The states, as the operator thinks about them (D1)
 *
 *   draft     — not shown publicly; stored as `tournaments.is_draft`
 *   open      — public, accepting signups and money
 *   closed    — public, not accepting money (sign-ups closed or not yet open)
 *   cancelled — called off; stored as `status = 'cancelled'`
 *   finished  — the event has happened; archive only, never sells anything
 *
 * `finished` is **always derived from the calendar**, never trusted from a
 * stored column. That is the whole point of this module: on 2026-08-12 the site
 * was still selling entry to an Open Play that happened on 2026-08-09, because
 * `payments_open` was a manual flag nobody remembered to turn off. Deriving the
 * end of an event from its own dates means forgetting is no longer possible.
 *
 * ## Why there is a second layer (Stage 2.0)
 *
 * The money and sign-up gates (`acceptsPayments`, `acceptsRegistrations`) were
 * derived from day one. The *display* was not: the events list, the cards, the
 * event page header and the homepage archive kept reading the stored `status`
 * column and the raw `registration_open` / `payments_open` flags. Nothing ever
 * writes `status = 'completed'` (D1 forbids it), so a finished event's stored
 * status is whatever it was on its last day — and the Aug-14 open play rendered
 * "Ongoing — Registration & Payments Open" with a "Sign up to play" button for
 * four weeks while `/register` correctly answered "closed". Five surfaces, four
 * different states, every advertised button dead on click.
 *
 * `resolveEventView` is the fix: one snapshot of everything a surface is allowed
 * to say about an event's state, computed from the same functions the gates use.
 * A page that reads `registration_open` directly is a bug; a page that reads
 * `view.canRegister` cannot disagree with the checkout.
 *
 * ## What the calendar may and may not decide
 *
 * The calendar decides **finished** and the **phase** (upcoming / in progress).
 * It never opens anything: an event is open only because the operator chose
 * Open, and the calendar can only take that away. Draft and Cancelled are
 * explicit operator states and outrank the calendar in both directions — a
 * draft in the past is still a draft, not archive material.
 *
 * The headline dates are the authority. A schedule whose last round falls after
 * `end_date` does not extend the event (see `scheduleOverrunDay` in
 * `lib/schedule.ts`, which surfaces that mismatch to the admin instead); doing
 * so would loosen the money gate from a second data source, and the operator
 * has not asked for that. See docs/STAGE-2-0-EVENT-STATE.md §11.
 */
export type EventState = "draft" | "open" | "closed" | "finished" | "cancelled";

/**
 * The states the operator can actually store (D1). `finished` is deliberately
 * absent: it is derived from the end date, never chosen and never written.
 */
export type StoredEventState = "draft" | "open" | "closed" | "cancelled";

export const STORED_EVENT_STATES: readonly StoredEventState[] = [
  "draft",
  "open",
  "closed",
  "cancelled",
];

/** Narrow an untrusted value (form post, API body) to a storable state. */
export function parseStoredEventState(v: unknown): StoredEventState | null {
  return typeof v === "string" &&
    (STORED_EVENT_STATES as readonly string[]).includes(v)
    ? (v as StoredEventState)
    : null;
}

/** Where the calendar says the event is, ignoring every stored flag. */
export type EventPhase = "upcoming" | "in_progress" | "finished";

/**
 * What a public surface may offer. `open` means the sign-up door; `pay_only`
 * is the narrow case where sign-ups have closed but people already on the
 * roster may still settle up (REBUILD-PLAN §A6).
 */
export type EventAvailability = "open" | "pay_only" | "closed";

/**
 * Which list an event belongs in. `hidden` covers drafts and cancelled events:
 * neither appears in a public listing, though a cancelled event's own page
 * still answers a link that was already shared.
 */
export type EventBucket = "upcoming" | "current" | "past" | "hidden";

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
export function todayInHouston(now: Date = new Date()): string {
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
 * The event's last calendar day (YYYY-MM-DD), or null when it has no dates.
 * The end date wins; a one-day event has only a start date.
 */
export function eventLastDay(t: DatedTournament): string | null {
  const last = t.end_date ?? t.start_date;
  return last ? eventDay(last) : null;
}

/** The event's first calendar day (YYYY-MM-DD), or null when it has no dates. */
export function eventFirstDay(t: DatedTournament): string | null {
  const first = t.start_date ?? t.end_date;
  return first ? eventDay(first) : null;
}

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
  const lastDay = eventLastDay(t);
  if (!lastDay) return false;
  return lastDay < todayInHouston(now);
}

/**
 * True when the event's first day is today in Houston.
 *
 * Exported so a surface can mark the urgent card — on `/me` two open events look
 * alike at 375px until you read the titles, and one of them may be starting in
 * two hours.
 *
 * Shares `eventDay`/`todayInHouston` with `isPastEvent` so "today" cannot mean
 * one thing here and another there. A naive UTC comparison would flip at 7pm
 * Houston in August — during an open play night itself.
 */
export function isHappeningToday(
  t: DatedTournament,
  now: Date = new Date()
): boolean {
  const day = eventFirstDay(t);
  if (!day) return false;
  return day === todayInHouston(now);
}

/**
 * Where the calendar puts the event today. Purely the dates: a stored
 * `completed`, a draft flag or a cancellation does not change the answer here,
 * which is why `resolveEventView` reports both `phase` and `state`.
 *
 * Undated events read as upcoming — the same answer `deriveStoredStatus` has
 * always given the form, so an event the owner has not dated yet is neither
 * quietly archived nor shown as running.
 */
export function eventPhase(t: DatedTournament, now: Date = new Date()): EventPhase {
  if (isPastEvent(t, now)) return "finished";
  const firstDay = eventFirstDay(t);
  if (!firstDay) return "upcoming";
  return firstDay <= todayInHouston(now) ? "in_progress" : "upcoming";
}

export type StatefulTournament = DatedTournament & {
  status: TournamentStatus;
  is_draft: boolean;
  registration_open: boolean;
  payments_open: boolean;
};

/**
 * The operator's stored choice, read back from the columns that still hold it.
 *
 * This is the one place the four columns are folded into the one dropdown the
 * admin shows (D1). The admin form used to carry its own copy of this ladder;
 * now the form, the API and the resolver all read this. Cancelled outranks
 * draft because an event the owner called off is called off whether or not it
 * had been published yet.
 */
export function storedEventState(
  t: Pick<
    StatefulTournament,
    "status" | "is_draft" | "registration_open" | "payments_open"
  >
): StoredEventState {
  if (t.status === "cancelled") return "cancelled";
  if (t.is_draft) return "draft";
  if (t.registration_open || t.payments_open) return "open";
  return "closed";
}

/**
 * The effective state of an event, combining what the operator stored with what
 * the calendar says. The calendar wins for "is it over".
 *
 * Draft is checked before the date backstop on purpose: a draft that happens to
 * be in the past was never public, so it belongs nowhere — not on the site, and
 * not in the "Recent Events" archive either. Draft is stricter than finished in
 * every direction, so nothing is loosened by putting it first.
 *
 * A stored `status = 'completed'` is honoured as finished even when the dates
 * disagree. The form never writes it (D1), but Phase 0 wrote it by hand on two
 * production rows, and an operator who marks something completed means it.
 */
export function resolveEventState(
  t: StatefulTournament,
  now: Date = new Date()
): EventState {
  const stored = storedEventState(t);
  if (stored === "cancelled") return "cancelled";
  if (stored === "draft") return "draft";
  if (t.status === "completed" || isPastEvent(t, now)) return "finished";
  return stored;
}

/**
 * Whether this event may be shown to the public at all. Everything except a
 * draft is visible — finished events stay browsable, which is the point of the
 * archive.
 */
export function isPubliclyVisible(t: StatefulTournament): boolean {
  return !t.is_draft;
}

/**
 * The `status` value to store for an event, derived from its dates.
 *
 * Nothing writes `'completed'`: that is `finished`, and D1 says finished is
 * never stored. `displayStatus` derives it for the public instead.
 */
export function deriveStoredStatus(
  t: DatedTournament,
  now: Date = new Date()
): Exclude<TournamentStatus, "completed" | "cancelled"> {
  return eventPhase(t, now) === "in_progress" ? "ongoing" : "upcoming";
}

/**
 * The one dropdown expanded into the columns that still back it.
 *
 * Every combination is produced here and nowhere else, so the contradictory
 * states the owner used to be able to build by hand — "completed but payments
 * open", "registration open, payments closed" — are simply not reachable. The
 * admin form and `POST`/`PATCH /api/admin/tournaments` both call this; the API
 * no longer accepts the four columns individually, which is what makes the
 * dropdown the only writer rather than merely the usual one.
 */
export function storedColumnsFor(
  state: StoredEventState,
  dates: DatedTournament,
  now: Date = new Date()
): Pick<Tournament, "is_draft" | "registration_open" | "payments_open" | "status"> {
  return {
    is_draft: state === "draft",
    registration_open: state === "open",
    payments_open: state === "open",
    status: state === "cancelled" ? "cancelled" : deriveStoredStatus(dates, now),
  };
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
 * The status to *show* the public, in the vocabulary the pills have always
 * used. Derived, never read from the column: a stored `upcoming` on a
 * tournament two rounds into its season (Community Cup, 2026-09-09) is exactly
 * the drift this exists to hide.
 */
export function displayStatus(
  t: StatefulTournament,
  now: Date = new Date()
): TournamentStatus {
  const state = resolveEventState(t, now);
  if (state === "cancelled") return "cancelled";
  if (state === "finished") return "completed";
  return eventPhase(t, now) === "in_progress" ? "ongoing" : "upcoming";
}

/** The words for `displayStatus`, in one place. */
export const EVENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** The words for `EventState`, as the admin badge shows them. */
export const EVENT_STATE_LABELS: Record<EventState, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
  finished: "Finished",
  cancelled: "Cancelled",
};

/**
 * Everything a surface is allowed to say about an event's state, resolved once.
 *
 * Read this instead of `status`, `is_draft`, `registration_open` or
 * `payments_open`. Every field is derived from the same functions the money
 * paths gate on, so a card, a badge and a checkout cannot disagree.
 */
export type EventView = {
  /** The operator vocabulary with the calendar backstop applied. */
  state: EventState;
  /** The operator's stored choice, before the calendar had its say. */
  storedState: StoredEventState;
  /** Where the calendar puts the event, ignoring every stored flag. */
  phase: EventPhase;
  /** The public pill vocabulary: upcoming / ongoing / completed / cancelled. */
  status: TournamentStatus;
  /** The public pill text for `status`. */
  label: string;
  /** The admin badge text for `state`. */
  stateLabel: string;
  availability: EventAvailability;
  /** Identical to `acceptsRegistrations(t)`; the sign-up gate reads the same function. */
  canRegister: boolean;
  /** Identical to `acceptsPayments(t)`; every checkout path reads the same function. */
  canPay: boolean;
  isDraft: boolean;
  isCancelled: boolean;
  isFinished: boolean;
  /**
   * May be rendered at all (its own page, a shared link). Only the draft flag
   * hides an event, whatever else is stored on it.
   */
  isVisible: boolean;
  /** May appear in a public list. Drafts and cancelled events may not. */
  isListed: boolean;
  bucket: EventBucket;
  happeningToday: boolean;
  /** Could headline the homepage if the owner starred it: listed and not over. */
  headlineEligible: boolean;
  /** Starred by the owner AND eligible. A star on a finished event is ignored. */
  isFeatured: boolean;
  /** The last calendar day (YYYY-MM-DD) the headline dates cover, or null. */
  lastDay: string | null;
};

export function resolveEventView(
  t: StatefulTournament & { is_featured?: boolean },
  now: Date = new Date()
): EventView {
  const storedState = storedEventState(t);
  const state = resolveEventState(t, now);
  const phase = eventPhase(t, now);
  const status = displayStatus(t, now);
  const canRegister = acceptsRegistrations(t, now);
  const canPay = acceptsPayments(t, now);

  const isDraft = state === "draft";
  const isCancelled = state === "cancelled";
  const isFinished = state === "finished";
  // The draft FLAG hides, not the draft STATE: a cancelled draft reads as
  // cancelled (that outranks draft for the label) but was never public and
  // stays hidden — the same rule `getTournamentBySlug` and the RLS policy
  // apply, so the page cannot render a row the query would refuse.
  const isVisible = isPubliclyVisible(t);
  const isListed = isVisible && !isCancelled;

  const bucket: EventBucket = !isListed
    ? "hidden"
    : isFinished
      ? "past"
      : phase === "in_progress"
        ? "current"
        : "upcoming";

  const headlineEligible = isListed && !isFinished;

  return {
    state,
    storedState,
    phase,
    status,
    label: EVENT_STATUS_LABELS[status],
    stateLabel: EVENT_STATE_LABELS[state],
    availability: canRegister ? "open" : canPay ? "pay_only" : "closed",
    canRegister,
    canPay,
    isDraft,
    isCancelled,
    isFinished,
    isVisible,
    isListed,
    bucket,
    happeningToday: isHappeningToday(t, now),
    headlineEligible,
    isFeatured: t.is_featured === true && headlineEligible,
    lastDay: eventLastDay(t),
  };
}

const BUCKET_RANK: Record<EventBucket, number> = {
  upcoming: 0,
  current: 1,
  past: 2,
  hidden: 3,
};

function startTime(t: DatedTournament): number {
  return t.start_date ? new Date(t.start_date).getTime() : 0;
}

/**
 * The public listing order: upcoming soonest-first, then what is under way,
 * then the archive newest-first. The same shape `/events` has always used —
 * it just used to rank by the stored status, which put a finished open play
 * above a season in progress.
 *
 * Copies before sorting; never sort a loader's return in place.
 */
export function sortEventsForListing<T extends StatefulTournament>(
  events: readonly T[],
  now: Date = new Date()
): T[] {
  const views = new Map<T, EventView>();
  const viewOf = (t: T): EventView => {
    let v = views.get(t);
    if (!v) {
      v = resolveEventView(t, now);
      views.set(t, v);
    }
    return v;
  };
  return [...events].sort((a, b) => {
    const rank = BUCKET_RANK[viewOf(a).bucket] - BUCKET_RANK[viewOf(b).bucket];
    if (rank !== 0) return rank;
    const at = startTime(a);
    const bt = startTime(b);
    return viewOf(a).bucket === "past" ? bt - at : at - bt;
  });
}
