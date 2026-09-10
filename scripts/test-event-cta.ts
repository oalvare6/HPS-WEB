/**
 * Branch table for `viewerEventCta` — the event page's "here's what's next".
 *
 * Two regressions this exists to catch:
 *
 *  1. **The one it was built to fix.** A player already on the roster being
 *     shown "Sign up to play", because the button read the event's flags and
 *     nothing about the visitor. If any signed-in case below ever returns the
 *     anonymous CTA again, that bug is back.
 *
 *  2. **The one it could easily cause.** This function is on the most-visited
 *     page on the site, and every signed-out visitor still has to get exactly
 *     what they got before. The PARITY block asserts that against
 *     `tournamentPrimaryCta` directly rather than against hard-coded strings,
 *     so the two can never drift.
 *
 * Since Stage 2.0 both functions resolve the event through `resolveEventView`
 * rather than the raw flags, so the fixtures carry dates and the clock is
 * pinned: the event below is a season in progress on the pinned day.
 *
 * Run: npx tsx scripts/test-event-cta.ts
 */
import {
  tournamentPrimaryCta,
  viewerEventCta,
} from "../src/lib/tournament-public-links";
import type { SignupState } from "../src/lib/signup-state";

/** 10:00 in Houston on 2026-09-10; the season below runs 08-21 to 10-23. */
const NOW = new Date("2026-09-10T15:00:00Z");

const event = {
  slug: "community-cup-fall-2026",
  register_url: null,
  pay_url: null,
  status: "upcoming" as const,
  is_draft: false,
  registration_open: true,
  payments_open: true,
  start_date: "2026-08-21 12:00:00+00",
  end_date: "2026-10-23 12:00:00+00",
};

const SIGNUP_HREF = "/register?tournament=community-cup-fall-2026";

let failed = 0;

function check(name: string, ok: boolean, detail: string) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

/* ------------------------------------------------------------------ *
 * 1. Signed out — must be byte-identical to the old event-only CTA.
 * ------------------------------------------------------------------ */

const EVENT_SHAPES = [
  { name: "open to signups and money", registration_open: true, payments_open: true },
  { name: "signups only", registration_open: true, payments_open: false },
  { name: "money only (signups closed)", registration_open: false, payments_open: true },
  { name: "closed to both", registration_open: false, payments_open: false },
];

for (const shape of EVENT_SHAPES) {
  const t = { ...event, ...shape };
  const before = tournamentPrimaryCta(t, NOW);
  const after = viewerEventCta({
    tournament: t,
    state: null,
    teamName: null,
    entryFeeLabel: "$80.00",
    now: NOW,
  });

  const expectedKind = before.kind === "none" ? "none" : before.kind;
  const expectedHref = before.kind === "none" ? null : before.href;
  const expectedLabel = before.kind === "none" ? null : before.label;

  check(
    `PARITY signed out, ${shape.name} → unchanged from tournamentPrimaryCta`,
    after.kind === expectedKind &&
      after.href === expectedHref &&
      after.label === expectedLabel &&
      after.personalised === false,
    `kind=${after.kind} href=${String(after.href)} label=${String(after.label)}`
  );
}

/* ------------------------------------------------------------------ *
 * 2. Signed in — the states the operator actually reported.
 * ------------------------------------------------------------------ */

type Case = {
  name: string;
  state: SignupState;
  teamName?: string | null;
  expectKind: "register" | "pay" | "waiver" | "none";
  /** Substring that must appear in the label, or null when there is no button. */
  expectLabel: string | null;
  expectPersonalised: boolean;
};

const CASES: Case[] = [
  {
    name: "THE BUG: on the roster and unpaid → Pay, never 'Sign up to play'",
    state: {
      kind: "owes_payment",
      registrationId: "reg-1",
      teamId: "team-1",
      payingCash: false,
    },
    teamName: "3rd Ward FC",
    expectKind: "pay",
    expectLabel: "$80.00",
    expectPersonalised: true,
  },
  {
    name: "Chose cash → no pay button; the fee is due at the field",
    state: {
      kind: "owes_payment",
      registrationId: "reg-2",
      teamId: "team-1",
      payingCash: true,
    },
    teamName: "3rd Ward FC",
    expectKind: "none",
    expectLabel: null,
    expectPersonalised: true,
  },
  {
    name: "Paid up → nothing to press",
    state: { kind: "already_paid", registrationId: "reg-3", teamId: "team-2" },
    teamName: "Heights FC",
    expectKind: "none",
    expectLabel: null,
    expectPersonalised: true,
  },
  {
    name: "On the roster, waiver outstanding → sign it, don't pay",
    state: { kind: "needs_waiver", registrationId: "reg-4" },
    expectKind: "waiver",
    expectLabel: "waiver",
    expectPersonalised: true,
  },
  {
    name: "Known, waiver valid, not on this roster → sign up (welcomed back)",
    state: { kind: "quick_join", contactId: "c-1", waiverExpiresAt: null },
    expectKind: "register",
    expectLabel: "Sign up",
    expectPersonalised: true,
  },
  {
    name: "Known but needs the full form → same as a stranger",
    state: { kind: "full_signup" },
    expectKind: "register",
    expectLabel: "Sign up",
    expectPersonalised: false,
  },
  {
    name: "Event closed → falls back to the event-only answer",
    state: { kind: "closed" },
    expectKind: "register",
    expectLabel: "Sign up",
    expectPersonalised: false,
  },
];

for (const c of CASES) {
  const cta = viewerEventCta({
    tournament: event,
    state: c.state,
    teamName: c.teamName ?? null,
    entryFeeLabel: "$80.00",
    now: NOW,
  });

  const labelOk =
    c.expectLabel === null
      ? cta.label === null
      : Boolean(cta.label?.includes(c.expectLabel));

  check(
    c.name,
    cta.kind === c.expectKind &&
      labelOk &&
      cta.personalised === c.expectPersonalised,
    `kind=${cta.kind} label=${String(cta.label)} personalised=${cta.personalised}`
  );
}

/* ------------------------------------------------------------------ *
 * 3. Properties that must hold across every personalised branch.
 * ------------------------------------------------------------------ */

const PERSONALISED: SignupState[] = [
  { kind: "owes_payment", registrationId: "r", teamId: null, payingCash: false },
  { kind: "owes_payment", registrationId: "r", teamId: null, payingCash: true },
  { kind: "already_paid", registrationId: "r", teamId: null },
  { kind: "needs_waiver", registrationId: "r" },
  { kind: "quick_join", contactId: "c", waiverExpiresAt: null },
];

for (const state of PERSONALISED) {
  const cta = viewerEventCta({
    tournament: event,
    state,
    teamName: null,
    entryFeeLabel: "$80.00",
    now: NOW,
  });

  // Every personalised branch must route through /register, the one front door
  // (REBUILD-PLAN §A6). A link straight to a pay URL would rebuild the second
  // door this project spent a session removing.
  check(
    `${state.kind}${"payingCash" in state ? ` (cash=${state.payingCash})` : ""} routes through /register`,
    cta.href === SIGNUP_HREF,
    `href=${String(cta.href)}`
  );

  // A personalised card with no explanatory line is just a differently-worded
  // button; the note is the part that answers "what's next".
  check(
    `${state.kind}${"payingCash" in state ? ` (cash=${state.payingCash})` : ""} carries a note`,
    typeof cta.note === "string" && cta.note.length > 0,
    `note=${String(cta.note)}`
  );
}

/* ------------------------------------------------------------------ *
 * 4. A finished or cancelled event sells nothing, whoever is looking.
 * ------------------------------------------------------------------ */

/*
  Both fixtures keep every flag ON. That is the production shape the Aug-14
  open play sat in for four weeks: `registration_open` and `payments_open`
  still true on an event that had happened. The old CTA read those flags and
  offered "Sign up to play"; the resolver reads the calendar and the stored
  cancellation and offers nothing.
*/
const finishedEvent = {
  ...event,
  status: "ongoing" as const,
  start_date: "2026-08-14 12:00:00+00",
  end_date: "2026-08-14 12:00:00+00",
};
const cancelledEvent = { ...event, status: "cancelled" as const };

const VIEWERS: { name: string; state: SignupState | null }[] = [
  { name: "signed out", state: null },
  {
    name: "signed in, unpaid",
    state: { kind: "owes_payment", registrationId: "r", teamId: null, payingCash: false },
  },
];

for (const v of VIEWERS) {
  const cta = viewerEventCta({
    tournament: finishedEvent,
    state: v.state,
    teamName: null,
    entryFeeLabel: "$80.00",
    now: NOW,
  });
  check(
    `finished event (flags still on) offers nothing (${v.name})`,
    cta.kind === "none" && cta.href === null && cta.heading === "Past event",
    `kind=${cta.kind} heading=${cta.heading}`
  );
}

for (const v of VIEWERS) {
  const cta = viewerEventCta({
    tournament: cancelledEvent,
    state: v.state,
    teamName: null,
    entryFeeLabel: "$80.00",
    now: NOW,
  });
  check(
    `cancelled event (flags still on) offers nothing (${v.name})`,
    cta.kind === "none" && cta.href === null && cta.heading === "Cancelled",
    `kind=${cta.kind} heading=${cta.heading}`
  );
}

/* ------------------------------------------------------------------ *
 * 5. After a cancel, the event page must offer signing up again.
 * ------------------------------------------------------------------ */

/*
  Cancelling filters the row out of `findEventRegistration`, so a player who has
  just given up their spot resolves to one of these two — never to an
  on-the-roster state. The regression worth naming: if the CTA still read
  "You're on the roster" here, the player would have cancelled and been told on
  the very next screen that they hadn't.

  Both must offer a real button. A cancelled player looking at an event that is
  still open has something to do; `kind: "none"` would leave them with a page
  that neither confirms the cancel nor offers a way back in.
*/
const AFTER_CANCEL: { name: string; state: SignupState }[] = [
  {
    name: "waiver still valid",
    state: { kind: "quick_join", contactId: "c-1", waiverExpiresAt: null },
  },
  { name: "waiver lapsed", state: { kind: "full_signup" } },
];

for (const c of AFTER_CANCEL) {
  const cta = viewerEventCta({
    tournament: event,
    state: c.state,
    teamName: null,
    entryFeeLabel: "$80.00",
    now: NOW,
  });
  check(
    `after cancelling (${c.name}) → can sign up again, not "on the roster"`,
    cta.kind === "register" && cta.href === SIGNUP_HREF && Boolean(cta.label),
    `kind=${cta.kind} href=${String(cta.href)} label=${String(cta.label)}`
  );
}

const total =
  EVENT_SHAPES.length +
  CASES.length +
  PERSONALISED.length * 2 +
  VIEWERS.length * 2 +
  AFTER_CANCEL.length;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed === 0 ? 0 : 1);
