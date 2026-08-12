/**
 * Sanity checks for the calendar backstop in `src/lib/tournament-state.ts`.
 *
 * The regression this guards against: on 2026-08-12 the live site was still
 * selling entry to an Open Play held on 2026-08-09, because `payments_open`
 * was a manual flag. Case 1 below is that exact row.
 *
 * Run: npx tsx scripts/test-tournament-state.ts
 */
import {
  acceptsPayments,
  acceptsRegistrations,
  isPastEvent,
  resolveEventState,
} from "../src/lib/tournament-state";

type Case = {
  name: string;
  row: {
    status: "upcoming" | "ongoing" | "completed" | "cancelled";
    registration_open: boolean;
    payments_open: boolean;
    start_date: string | null;
    end_date: string | null;
  };
  now: string;
  expectState: string;
  expectPay: boolean;
};

const CASES: Case[] = [
  {
    name: "The Aug-9 bug: past event with payments still flagged open",
    row: {
      status: "upcoming",
      registration_open: true,
      payments_open: true,
      start_date: "2026-08-09 12:00:00+00",
      end_date: "2026-08-09 12:00:00+00",
    },
    now: "2026-08-12T15:00:00Z",
    expectState: "finished",
    expectPay: false,
  },
  {
    name: "Event running TODAY still sells (must not close early)",
    row: {
      status: "upcoming",
      registration_open: true,
      payments_open: true,
      start_date: "2026-08-12 12:00:00+00",
      end_date: "2026-08-12 12:00:00+00",
    },
    now: "2026-08-12T15:00:00Z",
    expectState: "open",
    expectPay: true,
  },
  {
    name: "Late-night during the event, before Houston midnight",
    row: {
      status: "ongoing",
      registration_open: false,
      payments_open: true,
      start_date: "2026-08-12 12:00:00+00",
      end_date: "2026-08-12 12:00:00+00",
    },
    // 03:00 UTC on the 13th is 22:00 on the 12th in Houston — still game night.
    now: "2026-08-13T03:00:00Z",
    expectState: "open",
    expectPay: true,
  },
  {
    name: "Multi-week tournament mid-run",
    row: {
      status: "upcoming",
      registration_open: true,
      payments_open: true,
      start_date: "2026-08-21 12:00:00+00",
      end_date: "2026-10-23 12:00:00+00",
    },
    now: "2026-09-15T15:00:00Z",
    expectState: "open",
    expectPay: true,
  },
  {
    name: "World Cup: ended July 17, viewed Aug 12",
    row: {
      status: "upcoming",
      registration_open: false,
      payments_open: false,
      start_date: "2026-06-08 12:00:00+00",
      end_date: "2026-07-17 12:00:00+00",
    },
    now: "2026-08-12T15:00:00Z",
    expectState: "finished",
    expectPay: false,
  },
  {
    name: "Undated event is never auto-finished",
    row: {
      status: "upcoming",
      registration_open: true,
      payments_open: true,
      start_date: null,
      end_date: null,
    },
    now: "2026-08-12T15:00:00Z",
    expectState: "open",
    expectPay: true,
  },
  {
    name: "Cancelled stays cancelled, never sells",
    row: {
      status: "cancelled",
      registration_open: true,
      payments_open: true,
      start_date: "2026-09-01 12:00:00+00",
      end_date: "2026-09-01 12:00:00+00",
    },
    now: "2026-08-12T15:00:00Z",
    expectState: "cancelled",
    expectPay: false,
  },
  {
    name: "Future event with payments closed is 'closed', not 'open'",
    row: {
      status: "upcoming",
      registration_open: false,
      payments_open: false,
      start_date: "2026-12-01 12:00:00+00",
      end_date: "2026-12-01 12:00:00+00",
    },
    now: "2026-08-12T15:00:00Z",
    expectState: "closed",
    expectPay: false,
  },
];

let failed = 0;

for (const c of CASES) {
  const now = new Date(c.now);
  const state = resolveEventState(c.row, now);
  const pay = acceptsPayments(c.row, now);
  const ok = state === c.expectState && pay === c.expectPay;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n` +
      `        state=${state} (expected ${c.expectState})  ` +
      `canPay=${pay} (expected ${c.expectPay})  ` +
      `past=${isPastEvent(c.row, now)}  ` +
      `canRegister=${acceptsRegistrations(c.row, now)}`
  );
}

console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
process.exit(failed === 0 ? 0 : 1);
