/**
 * Branch table for `src/lib/signup-state.ts` — what the one signup screen shows
 * a given person for a given event.
 *
 * The regression this guards against is the one the screen was built to fix:
 * a player who has already signed a waiver, or who is already on the roster,
 * being shown a sign-up form as if we had never met them. Cases 4–8 are the
 * ones that matter; if any of them ever returns `full_signup` again, the two-
 * doors problem is back.
 *
 * Run: npx tsx scripts/test-signup-state.ts
 */
import { resolveSignupState, type SignupStateInput } from "../src/lib/signup-state";

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** A contact whose adult waiver is still valid for another 200 days. */
const waiverValid = {
  id: "contact-1",
  waiver_type: "adult" as const,
  waiver_signed_at: new Date(NOW - 165 * DAY).toISOString(),
  waiver_expires_at: new Date(NOW + 200 * DAY).toISOString(),
};

/** Same person, 366 days later: signed, but lapsed. */
const waiverLapsed = {
  id: "contact-2",
  waiver_type: "adult" as const,
  waiver_signed_at: new Date(NOW - 400 * DAY).toISOString(),
  waiver_expires_at: new Date(NOW - 35 * DAY).toISOString(),
};

type Case = {
  name: string;
  input: SignupStateInput;
  expect: string;
};

const open = { canRegister: true, canPay: true };

const CASES: Case[] = [
  {
    name: "Stranger, event open → the full form",
    input: { contact: null, registration: null, waiverType: "adult", ...open },
    expect: "full_signup",
  },
  {
    name: "Stranger, event closed → nothing to sell",
    input: {
      contact: null,
      registration: null,
      waiverType: "adult",
      canRegister: false,
      canPay: false,
    },
    expect: "closed",
  },
  {
    name: "Known person with a lapsed waiver → sign again via the full form",
    input: {
      contact: waiverLapsed,
      registration: null,
      waiverType: "adult",
      ...open,
    },
    expect: "full_signup",
  },
  {
    name: "THE D5 FLOW: valid waiver, not on this roster → pick team and pay",
    input: {
      contact: waiverValid,
      registration: null,
      waiverType: "adult",
      ...open,
    },
    expect: "quick_join",
  },
  {
    name: "Valid waiver but sign-ups closed → do not offer a roster spot",
    input: {
      contact: waiverValid,
      registration: null,
      waiverType: "adult",
      canRegister: false,
      canPay: true,
    },
    expect: "full_signup",
  },
  {
    name: "On the roster, unpaid → go to payment, never a form",
    input: {
      contact: waiverValid,
      registration: {
        id: "reg-1",
        payment_status: "pending",
        waiver_signed: true,
        team_id: "team-1",
      },
      waiverType: "adult",
      ...open,
    },
    expect: "owes_payment",
  },
  {
    name: "On the roster and paid → nothing left to do",
    input: {
      contact: waiverValid,
      registration: {
        id: "reg-2",
        payment_status: "paid",
        waiver_signed: true,
        team_id: null,
      },
      waiverType: "adult",
      ...open,
    },
    expect: "already_paid",
  },
  {
    name: "Waived (comped) counts as paid up",
    input: {
      contact: waiverValid,
      registration: {
        id: "reg-3",
        payment_status: "waived",
        waiver_signed: true,
        team_id: null,
      },
      waiverType: "adult",
      ...open,
    },
    expect: "already_paid",
  },
  {
    name: "On the roster, registration unsigned, but the PERSON has a valid waiver → pay, don't re-sign",
    input: {
      contact: waiverValid,
      registration: {
        id: "reg-4",
        payment_status: "pending",
        waiver_signed: false,
        team_id: null,
      },
      waiverType: "adult",
      ...open,
    },
    expect: "owes_payment",
  },
  {
    name: "On the roster with no waiver anywhere → sign before paying",
    input: {
      contact: waiverLapsed,
      registration: {
        id: "reg-5",
        payment_status: "pending",
        waiver_signed: false,
        team_id: null,
      },
      waiverType: "adult",
      ...open,
    },
    expect: "needs_waiver",
  },
  {
    name: "Paid already, waiver lapsed → still 'all set' for this event",
    input: {
      contact: waiverLapsed,
      registration: {
        id: "reg-6",
        payment_status: "paid",
        waiver_signed: true,
        team_id: null,
      },
      waiverType: "adult",
      ...open,
    },
    expect: "already_paid",
  },
  {
    name: "Adult waiver on file but signing up a youth → the youth waiver is still needed",
    input: {
      contact: waiverValid,
      registration: null,
      waiverType: "youth",
      ...open,
    },
    expect: "full_signup",
  },
  {
    name: "Event closed outranks everything, even an unpaid roster spot",
    input: {
      contact: waiverValid,
      registration: {
        id: "reg-7",
        payment_status: "pending",
        waiver_signed: true,
        team_id: null,
      },
      waiverType: "adult",
      canRegister: false,
      canPay: false,
    },
    expect: "closed",
  },
];

let failed = 0;

for (const c of CASES) {
  const got = resolveSignupState(c.input).kind;
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n` +
      `        state=${got} (expected ${c.expect})`
  );
}

/**
 * Both on-the-roster states must carry the team, because both cards render the
 * team picker and it has to open on the team the player already has.
 *
 * `already_paid` is the one worth asserting: it did not carry `team_id` at all,
 * so a paid player could not be shown — let alone change — their team. Every
 * Community Cup signup sat at `team_id = NULL` while the event had teams.
 */
const TEAM_CARRYING: { name: string; input: SignupStateInput; teamId: string | null }[] = [
  {
    name: "owes_payment carries the team it was signed up with",
    input: {
      contact: waiverValid,
      registration: {
        id: "reg-8",
        payment_status: "pending",
        waiver_signed: true,
        team_id: "team-9",
      },
      waiverType: "adult",
      ...open,
    },
    teamId: "team-9",
  },
  {
    name: "already_paid carries the team (paying does not settle it)",
    input: {
      contact: waiverValid,
      registration: {
        id: "reg-9",
        payment_status: "paid",
        waiver_signed: true,
        team_id: "team-9",
      },
      waiverType: "adult",
      ...open,
    },
    teamId: "team-9",
  },
  {
    name: "already_paid with no team reports null, not undefined",
    input: {
      contact: waiverValid,
      registration: {
        id: "reg-10",
        payment_status: "waived",
        waiver_signed: true,
        team_id: null,
      },
      waiverType: "adult",
      ...open,
    },
    teamId: null,
  },
];

for (const c of TEAM_CARRYING) {
  const state = resolveSignupState(c.input);
  const got =
    state.kind === "owes_payment" || state.kind === "already_paid"
      ? state.teamId
      : `<wrong state: ${state.kind}>`;
  const ok = got === c.teamId;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n` +
      `        teamId=${String(got)} (expected ${String(c.teamId)})`
  );
}

/**
 * The cancel contract.
 *
 * `resolveSignupState` deliberately knows nothing about `cancelled_at`. The
 * filtering happens one layer up, in `findEventRegistration`, which only returns
 * rows where `cancelled_at is null` — so a player who has given up their spot
 * arrives here as `registration: null` and is answered as though they had never
 * signed up, which is exactly right.
 *
 * These cases pin that contract down rather than exercise the SQL. They are the
 * two states a cancelled player can legitimately land in, and neither may be an
 * on-the-roster state: if a future change lets a cancelled row through the
 * lookup, the screen would tell somebody who just cancelled that they still owe
 * an entry fee, on the very page they cancelled from.
 */
const AFTER_CANCEL: Case[] = [
  {
    name: "CANCEL CONTRACT: cancelled, waiver still valid → offered a fresh sign-up",
    input: {
      contact: waiverValid,
      // Filtered out upstream by `cancelled_at is null` — never `owes_payment`.
      registration: null,
      waiverType: "adult",
      ...open,
    },
    expect: "quick_join",
  },
  {
    name: "CANCEL CONTRACT: cancelled and waiver lapsed → the full form, not the roster",
    input: {
      contact: waiverLapsed,
      registration: null,
      waiverType: "adult",
      ...open,
    },
    expect: "full_signup",
  },
];

for (const c of AFTER_CANCEL) {
  const got = resolveSignupState(c.input).kind;
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n` +
      `        state=${got} (expected ${c.expect})`
  );
}

const total = CASES.length + TEAM_CARRYING.length + AFTER_CANCEL.length;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed === 0 ? 0 : 1);
