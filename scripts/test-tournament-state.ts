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
  deriveStoredStatus,
  isPastEvent,
  resolveEventState,
} from "../src/lib/tournament-state";

type Case = {
  name: string;
  row: {
    status: "upcoming" | "ongoing" | "completed" | "cancelled";
    /** Omitted means false — most cases are about published events. */
    is_draft?: boolean;
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
  {
    name: "Draft never sells, even with both flags on",
    row: {
      status: "upcoming",
      is_draft: true,
      registration_open: true,
      payments_open: true,
      start_date: "2026-12-01 12:00:00+00",
      end_date: "2026-12-01 12:00:00+00",
    },
    now: "2026-08-12T15:00:00Z",
    expectState: "draft",
    expectPay: false,
  },
  {
    name: "A draft in the past stays draft — it was never public, so it isn't archive material",
    row: {
      status: "upcoming",
      is_draft: true,
      registration_open: false,
      payments_open: false,
      start_date: "2026-07-01 12:00:00+00",
      end_date: "2026-07-01 12:00:00+00",
    },
    now: "2026-08-12T15:00:00Z",
    expectState: "draft",
    expectPay: false,
  },
  {
    name: "Cancelled outranks draft",
    row: {
      status: "cancelled",
      is_draft: true,
      registration_open: false,
      payments_open: false,
      start_date: "2026-09-01 12:00:00+00",
      end_date: "2026-09-01 12:00:00+00",
    },
    now: "2026-08-12T15:00:00Z",
    expectState: "cancelled",
    expectPay: false,
  },
];

/** `deriveStoredStatus` must never return 'completed' — that is `finished` (D1). */
const STATUS_CASES: {
  name: string;
  row: { start_date: string | null; end_date: string | null };
  now: string;
  expect: string;
}[] = [
  {
    name: "Not started yet → upcoming",
    row: { start_date: "2026-08-21 12:00:00+00", end_date: "2026-10-16 12:00:00+00" },
    now: "2026-08-12T15:00:00Z",
    expect: "upcoming",
  },
  {
    name: "Mid-season → ongoing",
    row: { start_date: "2026-08-21 12:00:00+00", end_date: "2026-10-16 12:00:00+00" },
    now: "2026-09-15T15:00:00Z",
    expect: "ongoing",
  },
  {
    name: "First day counts as ongoing",
    row: { start_date: "2026-08-12 12:00:00+00", end_date: "2026-08-12 12:00:00+00" },
    now: "2026-08-12T15:00:00Z",
    expect: "ongoing",
  },
  {
    name: "Already over → never writes 'completed'",
    row: { start_date: "2026-06-08 12:00:00+00", end_date: "2026-07-17 12:00:00+00" },
    now: "2026-08-12T15:00:00Z",
    expect: "upcoming",
  },
  {
    name: "Undated → upcoming",
    row: { start_date: null, end_date: null },
    now: "2026-08-12T15:00:00Z",
    expect: "upcoming",
  },
];

let failed = 0;

for (const c of CASES) {
  const now = new Date(c.now);
  const row = { is_draft: false, ...c.row };
  const state = resolveEventState(row, now);
  const pay = acceptsPayments(row, now);
  const ok = state === c.expectState && pay === c.expectPay;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n` +
      `        state=${state} (expected ${c.expectState})  ` +
      `canPay=${pay} (expected ${c.expectPay})  ` +
      `past=${isPastEvent(row, now)}  ` +
      `canRegister=${acceptsRegistrations(row, now)}`
  );
}

for (const c of STATUS_CASES) {
  const got = deriveStoredStatus(c.row, new Date(c.now));
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  deriveStoredStatus: ${c.name}\n` +
      `        status=${got} (expected ${c.expect})`
  );
}

const total = CASES.length + STATUS_CASES.length;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed === 0 ? 0 : 1);
