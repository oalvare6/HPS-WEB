/**
 * Stage 2.0: one event-state model for every surface.
 *
 * What this guards. On 2026-09-09 the same production row rendered as
 * "Ongoing — Registration & Payments Open" with a "Sign up to play" button on
 * /events, "Completed" on the homepage archive, and "Past event" in its own
 * CTA card — while /register answered "closed". The money and sign-up gates
 * were right the whole time; the surfaces read the stored columns instead of
 * asking them.
 *
 * Every surface now reads `resolveEventView`, and this file asserts the two
 * properties that make that safe:
 *
 *   1. The view can never say more than the gates allow. `canRegister` and
 *      `canPay` ARE the gate functions, and every label, CTA and list bucket
 *      is derived from them, so a page cannot advertise a state the backend
 *      would reject. The matrix in section B proves it for every combination
 *      of stored columns and calendar position.
 *
 *   2. The operator's explicit states are honoured. Draft, Cancelled and
 *      Closed win over the calendar; a hand-set "completed" is finished even
 *      with future dates; and the calendar only ever takes selling away, it
 *      never grants it.
 *
 * Run: npx tsx scripts/test-event-state.ts
 */
import {
  acceptsPayments,
  acceptsRegistrations,
  eventLastDay,
  eventPhase,
  parseStoredEventState,
  resolveEventState,
  resolveEventView,
  sortEventsForListing,
  storedColumnsFor,
  storedEventState,
  type EventView,
  type StatefulTournament,
  type StoredEventState,
} from "../src/lib/tournament-state";
import { scheduleLastDay, scheduleOverrunDay } from "../src/lib/schedule";
import {
  tournamentPrimaryCta,
  viewerEventCta,
} from "../src/lib/tournament-public-links";
import { resolveSignupState, type SignupState } from "../src/lib/signup-state";

/** 10:00 in Houston on 2026-09-10. */
const NOW = new Date("2026-09-10T15:00:00Z");

/** Stored the way the admin form writes dates: noon UTC on the calendar day. */
const day = (ymd: string) => `${ymd} 12:00:00+00`;

type Row = StatefulTournament & {
  slug: string;
  register_url: null;
  pay_url: null;
  is_featured?: boolean;
  max_teams?: number | null;
  kind?: "tournament" | "open_play";
};

function row(
  overrides: Partial<Row> & Pick<Row, "start_date" | "end_date">
): Row {
  return {
    slug: "fixture",
    register_url: null,
    pay_url: null,
    status: "upcoming",
    is_draft: false,
    registration_open: true,
    payments_open: true,
    ...overrides,
  };
}

let passed = 0;
let failed = 0;
/** Failures from the property matrix, printed once each rather than per row. */
const matrixFailures: string[] = [];

function check(name: string, ok: boolean, detail: string) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

function expectView(
  name: string,
  view: EventView,
  expected: Partial<EventView>
) {
  const diffs = (Object.keys(expected) as (keyof EventView)[])
    .filter((k) => view[k] !== expected[k])
    .map((k) => `${k}=${String(view[k])} (expected ${String(expected[k])})`);
  check(
    name,
    diffs.length === 0,
    diffs.length === 0
      ? `state=${view.state} phase=${view.phase} status=${view.status} availability=${view.availability} bucket=${view.bucket}`
      : diffs.join("  ")
  );
}

/* ------------------------------------------------------------------ *
 * A. The edge cases, one row each.
 * ------------------------------------------------------------------ */

console.log("\nA. Edge cases\n");

// 1. Future event, registration not open yet (owner chose Closed for now).
expectView(
  "future event before registration opens → Upcoming, nothing on offer",
  resolveEventView(
    row({
      registration_open: false,
      payments_open: false,
      start_date: day("2026-11-06"),
      end_date: day("2026-12-18"),
    }),
    NOW
  ),
  {
    state: "closed",
    phase: "upcoming",
    status: "upcoming",
    label: "Upcoming",
    availability: "closed",
    canRegister: false,
    canPay: false,
    bucket: "upcoming",
    isVisible: true,
    isListed: true,
  }
);

// 2. Future event, registration open.
const futureOpen = row({
  start_date: day("2026-11-06"),
  end_date: day("2026-12-18"),
});
expectView(
  "future event, registration open → Upcoming and open",
  resolveEventView(futureOpen, NOW),
  {
    state: "open",
    phase: "upcoming",
    status: "upcoming",
    availability: "open",
    canRegister: true,
    canPay: true,
    bucket: "upcoming",
    headlineEligible: true,
  }
);
check(
  "future open event → card CTA is the sign-up door",
  tournamentPrimaryCta(futureOpen, NOW).kind === "register",
  `kind=${tournamentPrimaryCta(futureOpen, NOW).kind}`
);

// 3. Registration closed but the event has not started: money only, for
//    people already on the roster (REBUILD-PLAN §A6).
const payOnly = row({
  registration_open: false,
  payments_open: true,
  start_date: day("2026-11-06"),
  end_date: day("2026-12-18"),
});
expectView(
  "registration closed, not started, payments open → pay-only",
  resolveEventView(payOnly, NOW),
  {
    state: "open",
    phase: "upcoming",
    availability: "pay_only",
    canRegister: false,
    canPay: true,
    bucket: "upcoming",
  }
);
check(
  "pay-only event → card CTA is the pay door, not sign-up",
  tournamentPrimaryCta(payOnly, NOW).kind === "pay",
  `kind=${tournamentPrimaryCta(payOnly, NOW).kind}`
);

// 4. Currently active: the Community Cup shape on 2026-09-10. Stored status
//    still says "upcoming" because nothing rewrites it between saves.
const inProgress = row({
  status: "upcoming",
  is_featured: true,
  start_date: day("2026-08-21"),
  end_date: day("2026-10-23"),
});
expectView(
  "active season (stored 'upcoming') → Ongoing, open, current, featured",
  resolveEventView(inProgress, NOW),
  {
    state: "open",
    storedState: "open",
    phase: "in_progress",
    status: "ongoing",
    label: "Ongoing",
    stateLabel: "Open",
    availability: "open",
    canRegister: true,
    canPay: true,
    bucket: "current",
    isFeatured: true,
    headlineEligible: true,
  }
);

// 5. Completed: the Aug-14 open play shape. Stored "ongoing", both flags left
//    on, happened four weeks ago. This is the row that was advertising itself.
const finishedFlagsOn = row({
  status: "ongoing",
  is_featured: true,
  kind: "open_play",
  start_date: day("2026-08-14"),
  end_date: day("2026-08-14"),
});
expectView(
  "finished event with both flags still on → Completed, closed, past",
  resolveEventView(finishedFlagsOn, NOW),
  {
    state: "finished",
    storedState: "open",
    phase: "finished",
    status: "completed",
    label: "Completed",
    stateLabel: "Finished",
    availability: "closed",
    canRegister: false,
    canPay: false,
    bucket: "past",
    isVisible: true,
    isListed: true,
    isFeatured: false,
    headlineEligible: false,
  }
);
check(
  "finished event → no CTA on any card",
  tournamentPrimaryCta(finishedFlagsOn, NOW).kind === "none",
  `kind=${tournamentPrimaryCta(finishedFlagsOn, NOW).kind}`
);
check(
  "finished event → /register resolves to closed for a stranger",
  resolveSignupState({
    contact: null,
    registration: null,
    waiverType: "adult",
    canRegister: resolveEventView(finishedFlagsOn, NOW).canRegister,
    canPay: resolveEventView(finishedFlagsOn, NOW).canPay,
  }).kind === "closed",
  "signup state from the view's gates"
);

// 6. Cancelled and draft: explicit operator states, flags left on.
expectView(
  "cancelled with flags on → Cancelled, hidden from lists, page still reachable",
  resolveEventView(
    row({ status: "cancelled", start_date: day("2026-11-06"), end_date: day("2026-11-06") }),
    NOW
  ),
  {
    state: "cancelled",
    status: "cancelled",
    label: "Cancelled",
    availability: "closed",
    canRegister: false,
    canPay: false,
    bucket: "hidden",
    isVisible: true,
    isListed: false,
    isFeatured: false,
  }
);
expectView(
  "draft with flags on → Draft, not visible anywhere",
  resolveEventView(
    row({ is_draft: true, is_featured: true, start_date: day("2026-11-06"), end_date: day("2026-11-06") }),
    NOW
  ),
  {
    state: "draft",
    stateLabel: "Draft",
    canRegister: false,
    canPay: false,
    bucket: "hidden",
    isVisible: false,
    isListed: false,
    isFeatured: false,
  }
);

// 7. Schedule dates beyond the headline end date: the World Cup shape. The row
//    ends 07-17; the semi-finals and final were dated 07-24 and 07-31.
const worldCup = row({
  status: "upcoming",
  registration_open: false,
  payments_open: false,
  start_date: day("2026-06-08"),
  end_date: day("2026-07-17"),
});
const worldCupRounds = [
  { round_date: "2026-07-17", rescheduled_to: null, status: "scheduled" as const },
  { round_date: "2026-07-24", rescheduled_to: null, status: "scheduled" as const },
  { round_date: "2026-07-31", rescheduled_to: null, status: "scheduled" as const },
];
const BETWEEN = new Date("2026-07-25T15:00:00Z");
expectView(
  "schedule past end date, viewed between: the headline end date wins → finished",
  resolveEventView(worldCup, BETWEEN),
  {
    state: "finished",
    phase: "finished",
    status: "completed",
    canRegister: false,
    canPay: false,
    bucket: "past",
    isVisible: true,
  }
);
check(
  "schedule past end date → the overrun is reported to the admin, not silently absorbed",
  scheduleOverrunDay(eventLastDay(worldCup), worldCupRounds, []) === "2026-07-31",
  `overrun=${String(scheduleOverrunDay(eventLastDay(worldCup), worldCupRounds, []))}`
);
check(
  "a cancelled round after the end date does not count as an overrun",
  scheduleOverrunDay(
    eventLastDay(worldCup),
    [
      worldCupRounds[0],
      worldCupRounds[1],
      { ...worldCupRounds[2], status: "cancelled" as const },
    ],
    []
  ) === "2026-07-24",
  "final cancelled → semis (07-24) are the last scheduled day"
);
check(
  "a rescheduled round counts on its new date",
  scheduleLastDay(
    [{ round_date: "2026-07-31", rescheduled_to: "2026-08-07", status: "rescheduled" as const }],
    []
  ) === "2026-08-07",
  "rescheduled_to wins over round_date"
);
check(
  "a match dated after every round extends the schedule's last day",
  scheduleLastDay(worldCupRounds, [
    { match_date: "2026-08-02", status: "scheduled" as const },
    { match_date: "2026-08-09", status: "cancelled" as const },
  ]) === "2026-08-02",
  "cancelled match ignored; scheduled one counted"
);
check(
  "no overrun when the schedule ends on or before the end date",
  scheduleOverrunDay(eventLastDay(inProgress), [
    { round_date: "2026-10-23", rescheduled_to: null, status: "scheduled" as const },
  ], []) === null,
  "final on the end date → null"
);
check(
  "no schedule at all → no overrun and no last day",
  scheduleOverrunDay(eventLastDay(worldCup), [], []) === null &&
    scheduleLastDay([], []) === null,
  "empty rounds and matches"
);

// 8. Capacity: `max_teams` is a cap on TEAMS, and nothing in the backend
//    enforces it against sign-ups. The view must not invent a closed state the
//    sign-up route would not enforce — the honest answer is "still open".
expectView(
  "max_teams reached does not close sign-ups (no backend gate exists)",
  resolveEventView(
    row({ max_teams: 1, start_date: day("2026-11-06"), end_date: day("2026-12-18") }),
    NOW
  ),
  { state: "open", canRegister: true, availability: "open" }
);

// 9. Admin overrides.
expectView(
  "hand-set 'completed' with future dates is honoured as finished",
  resolveEventView(
    row({ status: "completed", start_date: day("2026-11-06"), end_date: day("2026-12-18") }),
    NOW
  ),
  { state: "finished", status: "completed", canRegister: false, canPay: false, bucket: "past" }
);
expectView(
  "owner closed a season in progress → Closed but still Ongoing to the public",
  resolveEventView(
    row({
      registration_open: false,
      payments_open: false,
      start_date: day("2026-08-21"),
      end_date: day("2026-10-23"),
    }),
    NOW
  ),
  {
    state: "closed",
    stateLabel: "Closed",
    phase: "in_progress",
    status: "ongoing",
    availability: "closed",
    canRegister: false,
    canPay: false,
    bucket: "current",
  }
);
expectView(
  "cancelled outranks draft",
  resolveEventView(
    row({ status: "cancelled", is_draft: true, start_date: day("2026-11-06"), end_date: null }),
    NOW
  ),
  { state: "cancelled", storedState: "cancelled" }
);
expectView(
  "a draft in the past stays a draft, not archive material",
  resolveEventView(
    row({ is_draft: true, start_date: day("2026-07-01"), end_date: day("2026-07-01") }),
    NOW
  ),
  { state: "draft", bucket: "hidden", isVisible: false }
);
expectView(
  "undated event is never auto-finished and reads as upcoming",
  resolveEventView(row({ start_date: null, end_date: null }), NOW),
  { state: "open", phase: "upcoming", status: "upcoming", bucket: "upcoming" }
);

// 10. Historical tournament: the World Cup as of today, starred and long over.
expectView(
  "historical tournament, still starred → Completed, browsable, never the hero",
  resolveEventView({ ...worldCup, status: "completed", is_featured: true }, NOW),
  {
    state: "finished",
    status: "completed",
    bucket: "past",
    isVisible: true,
    isListed: true,
    isFeatured: false,
    headlineEligible: false,
  }
);

// 11. Current featured event: covered in case 4 (isFeatured: true). Also:
expectView(
  "a star on an event happening today → featured, and happening today",
  resolveEventView(
    row({ is_featured: true, kind: "open_play", start_date: day("2026-09-10"), end_date: day("2026-09-10") }),
    NOW
  ),
  { isFeatured: true, happeningToday: true, bucket: "current", status: "ongoing" }
);
check(
  "an event still sells at 10pm on its last night in Houston",
  resolveEventView(
    row({ start_date: day("2026-09-10"), end_date: day("2026-09-10") }),
    // 03:00 UTC on the 11th is 22:00 on the 10th in Houston.
    new Date("2026-09-11T03:00:00Z")
  ).canPay === true,
  "calendar rolls over at Houston midnight, not UTC"
);

/* ------------------------------------------------------------------ *
 * B. Invariants, over every combination of stored columns and calendar.
 * ------------------------------------------------------------------ */

console.log("\nB. Invariant matrix\n");

const STATUSES = ["upcoming", "ongoing", "completed", "cancelled"] as const;
const DATES: { name: string; start: string | null; end: string | null }[] = [
  { name: "future", start: day("2026-10-02"), end: day("2026-10-02") },
  { name: "today", start: day("2026-09-10"), end: day("2026-09-10") },
  { name: "in progress", start: day("2026-08-21"), end: day("2026-10-23") },
  { name: "past", start: day("2026-08-14"), end: day("2026-08-14") },
  { name: "undated", start: null, end: null },
];
const PERSONALISED: SignupState[] = [
  { kind: "owes_payment", registrationId: "r", teamId: null, payingCash: false },
  { kind: "already_paid", registrationId: "r", teamId: null },
  { kind: "needs_waiver", registrationId: "r" },
  { kind: "quick_join", contactId: "c", waiverExpiresAt: null },
];

let matrixRows = 0;
let matrixChecks = 0;

function invariant(rowName: string, name: string, ok: boolean) {
  matrixChecks++;
  if (ok) passed++;
  else {
    failed++;
    matrixFailures.push(`${rowName}: ${name}`);
  }
}

for (const status of STATUSES) {
  for (const is_draft of [false, true]) {
    for (const registration_open of [false, true]) {
      for (const payments_open of [false, true]) {
        for (const dates of DATES) {
          matrixRows++;
          const t = row({
            status,
            is_draft,
            registration_open,
            payments_open,
            start_date: dates.start,
            end_date: dates.end,
          });
          const name = `status=${status} draft=${is_draft} reg=${registration_open} pay=${payments_open} dates=${dates.name}`;
          const view = resolveEventView(t, NOW);
          const state = resolveEventState(t, NOW);

          // 1. The view's answers ARE the gates' answers.
          invariant(name, "canRegister === acceptsRegistrations", view.canRegister === acceptsRegistrations(t, NOW));
          invariant(name, "canPay === acceptsPayments", view.canPay === acceptsPayments(t, NOW));
          invariant(name, "state === resolveEventState", view.state === state);

          // 2. Nothing sells unless the operator chose Open and the calendar agrees.
          invariant(name, "canRegister implies state open", !view.canRegister || view.state === "open");
          invariant(name, "canPay implies state open", !view.canPay || view.state === "open");
          invariant(name, "finished sells nothing", !view.isFinished || (!view.canRegister && !view.canPay));
          invariant(name, "cancelled sells nothing", !view.isCancelled || (!view.canRegister && !view.canPay));
          invariant(name, "draft sells nothing", !view.isDraft || (!view.canRegister && !view.canPay));
          invariant(name, "the calendar never opens: open requires a stored flag", !view.canRegister || registration_open);
          invariant(name, "the calendar never opens: pay requires a stored flag", !view.canPay || payments_open);

          // 3. What the surfaces show follows the gates.
          invariant(name, "availability open iff canRegister", (view.availability === "open") === view.canRegister);
          invariant(name, "availability pay_only iff canPay and not canRegister", (view.availability === "pay_only") === (view.canPay && !view.canRegister));
          invariant(name, "'completed' label only when finished", (view.status === "completed") === view.isFinished);
          invariant(name, "'cancelled' label only when cancelled", (view.status === "cancelled") === view.isCancelled);
          invariant(name, "'ongoing' label only when in progress by the calendar", view.status !== "ongoing" || view.phase === "in_progress");
          invariant(name, "past bucket iff finished and listed", (view.bucket === "past") === (view.isFinished && view.isListed));
          invariant(name, "hidden bucket iff not listed", (view.bucket === "hidden") === !view.isListed);
          invariant(name, "visible iff not draft", view.isVisible === !is_draft);
          invariant(name, "featured only when eligible", !view.isFeatured || view.headlineEligible);
          invariant(name, "headline eligible iff listed and not finished", view.headlineEligible === (view.isListed && !view.isFinished));

          // 4. The card CTA and the event-page CTA agree with the gates.
          const cta = tournamentPrimaryCta(t, NOW);
          invariant(name, "card CTA register iff canRegister", (cta.kind === "register") === view.canRegister);
          invariant(name, "card CTA pay iff canPay and not canRegister", (cta.kind === "pay") === (view.canPay && !view.canRegister));
          const anon = viewerEventCta({ tournament: t, state: null, teamName: null, entryFeeLabel: null, now: NOW });
          invariant(name, "signed-out event-page CTA offers a button iff a gate is open", (anon.kind !== "none") === (view.canRegister || view.canPay));
          for (const s of PERSONALISED) {
            const personal = viewerEventCta({ tournament: t, state: s, teamName: null, entryFeeLabel: "$80.00", now: NOW });
            invariant(name, `${s.kind}: no button on a finished or cancelled event`, !(view.isFinished || view.isCancelled) || personal.kind === "none");
            invariant(name, `${s.kind}: 'pay' button only when the pay gate is open`, personal.kind !== "pay" || view.canPay || view.canRegister);
          }

          // 5. /register's closed card. For a stranger it appears exactly when
          //    the sign-up door is shut — the pay door only serves people
          //    already on the roster. For a rostered unpaid player it appears
          //    only when both doors are shut: pay-only still lets them settle.
          const stranger = resolveSignupState({
            contact: null,
            registration: null,
            waiverType: "adult",
            canRegister: view.canRegister,
            canPay: view.canPay,
          });
          invariant(name, "/register closed for a stranger iff sign-ups are shut", (stranger.kind === "closed") === !view.canRegister);
          const rostered = resolveSignupState({
            contact: null,
            registration: { id: "r", payment_status: "pending", waiver_signed: true, team_id: null },
            waiverType: "adult",
            canRegister: view.canRegister,
            canPay: view.canPay,
          });
          invariant(name, "/register for a rostered unpaid player: closed iff both doors shut, else owes payment", rostered.kind === (!view.canRegister && !view.canPay ? "closed" : "owes_payment"));

          // 6. The admin's stored choice survives the round trip.
          invariant(name, "storedState reads back the stored columns", view.storedState === storedEventState(t));
        }
      }
    }
  }
}

if (matrixFailures.length === 0) {
  console.log(`PASS  ${matrixRows} rows × ${matrixChecks / matrixRows} invariants = ${matrixChecks} checks`);
} else {
  console.log(`FAIL  ${matrixFailures.length} of ${matrixChecks} invariant checks over ${matrixRows} rows:`);
  // Grouped by invariant, with the first few rows that broke it, so a single
  // wrong rule reads as one line rather than a wall of near-identical ones.
  const byInvariant = new Map<string, string[]>();
  for (const f of matrixFailures) {
    const sep = f.indexOf(": ");
    const rowName = f.slice(0, sep);
    const inv = f.slice(sep + 2);
    const list = byInvariant.get(inv) ?? [];
    list.push(rowName);
    byInvariant.set(inv, list);
  }
  for (const [inv, rows] of byInvariant) {
    console.log(`        ${rows.length}× ${inv}`);
    for (const r of rows.slice(0, 3)) console.log(`            e.g. ${r}`);
  }
}

/* ------------------------------------------------------------------ *
 * C. The admin's one dropdown: expand, store, read back — same answer.
 * ------------------------------------------------------------------ */

console.log("\nC. Stored state round trip\n");

const STORED: StoredEventState[] = ["draft", "open", "closed", "cancelled"];
for (const s of STORED) {
  for (const dates of DATES) {
    const cols = storedColumnsFor(s, { start_date: dates.start, end_date: dates.end }, NOW);
    check(
      `storedColumnsFor(${s}, ${dates.name}) reads back as ${s} and never writes 'completed'`,
      storedEventState(cols) === s && cols.status !== "completed",
      `status=${cols.status} draft=${cols.is_draft} reg=${cols.registration_open} pay=${cols.payments_open}`
    );
  }
}
check(
  "storedColumnsFor(open, in progress) stores 'ongoing' so the column is not stale on save",
  storedColumnsFor("open", { start_date: day("2026-08-21"), end_date: day("2026-10-23") }, NOW).status === "ongoing",
  "derived from the dates, as the form has always done"
);
check(
  "parseStoredEventState accepts the four choices and nothing else",
  STORED.every((s) => parseStoredEventState(s) === s) &&
    parseStoredEventState("finished") === null &&
    parseStoredEventState("completed") === null &&
    parseStoredEventState("") === null &&
    parseStoredEventState(undefined) === null &&
    parseStoredEventState({}) === null,
  "'finished' and 'completed' are not storable (D1)"
);

/* ------------------------------------------------------------------ *
 * D. Listing order comes from the resolver, not the stored status.
 * ------------------------------------------------------------------ */

console.log("\nD. Listing order\n");

const listing = [
  { ...finishedFlagsOn, slug: "aug-14-open-play" }, // stored ongoing, finished
  { ...inProgress, slug: "community-cup" }, // stored upcoming, in progress
  { ...futureOpen, slug: "november-season" }, // future
  {
    ...row({ status: "completed", registration_open: false, payments_open: false, start_date: day("2026-05-25"), end_date: day("2026-05-25") }),
    slug: "memorial-day",
  },
  { ...row({ status: "cancelled", start_date: day("2026-10-01"), end_date: null }), slug: "called-off" },
];
const sorted = sortEventsForListing(listing, NOW).map((t) => t.slug);
check(
  "upcoming first, then in progress, then the archive newest-first, hidden last",
  sorted.join(",") === "november-season,community-cup,aug-14-open-play,memorial-day,called-off",
  sorted.join(" → ")
);
check(
  "the old sort would have ranked the finished open play above the running season",
  listing[0].status === "ongoing" && listing[1].status === "upcoming",
  "stored status alone puts 'upcoming' (Cup) before 'ongoing' (Aug-14) and both above the archive"
);
check(
  "sorting does not mutate the loader's array",
  listing[0].slug === "aug-14-open-play" && listing[4].slug === "called-off",
  "input order intact"
);

/* ------------------------------------------------------------------ *
 * E. Phase alone, for the admin badge's "in progress" hint.
 * ------------------------------------------------------------------ */

console.log("\nE. Phase\n");

check(
  "phase: future → upcoming, started → in_progress, over → finished, undated → upcoming",
  eventPhase({ start_date: day("2026-11-06"), end_date: null }, NOW) === "upcoming" &&
    eventPhase({ start_date: day("2026-08-21"), end_date: day("2026-10-23") }, NOW) === "in_progress" &&
    eventPhase({ start_date: day("2026-09-10"), end_date: day("2026-09-10") }, NOW) === "in_progress" &&
    eventPhase({ start_date: day("2026-08-14"), end_date: day("2026-08-14") }, NOW) === "finished" &&
    eventPhase({ start_date: null, end_date: null }, NOW) === "upcoming",
  "five calendar positions"
);
check(
  "an event with only an end date in the past is finished; only a start date in the past is finished too",
  eventPhase({ start_date: null, end_date: day("2026-08-14") }, NOW) === "finished" &&
    eventPhase({ start_date: day("2026-08-14"), end_date: null }, NOW) === "finished",
  "eventLastDay falls back across the two columns"
);

const total = passed + failed;
console.log(`\n${passed}/${total} passed`);
process.exit(failed === 0 ? 0 : 1);
