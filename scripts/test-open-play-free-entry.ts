/**
 * Branch table for `src/lib/open-play-free-entry.ts` — who gets into an
 * open-play night without paying the door price (D7).
 *
 * Two regressions this exists to catch, in order of how much they would cost:
 *
 *   1. **Charging somebody who already paid $80.** `payment_method` is NULL on
 *      three of the four live Community Cup registrations, including both
 *      players who genuinely paid by card — it is only ever written on the
 *      manual cash path. Case "the $80 card payers" fails the moment anybody
 *      reintroduces that field into the rule.
 *   2. **Comping somebody who should pay.** An empty config, a cancelled spot,
 *      a teamless half-finished signup, or a registration for a tournament the
 *      organiser did not name must all resolve to `must_pay`. If any of those
 *      ever returns `free`, the night is being given away.
 *
 * The third rule with teeth: a waiver is never waived. `free` must never win
 * over `waiver_required`, however entitled the player is.
 *
 * Run: npx tsx scripts/test-open-play-free-entry.ts
 */
import {
  findQualifyingRegistration,
  parseFreeEntryTournamentIds,
  resolveDoorPriceCents,
  resolveOpenPlayEntitlement,
  type FreeEntryRegistrationSnapshot,
  type OpenPlayEntitlementInput,
} from "../src/lib/open-play-free-entry";

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** The two live event ids, so the cases read like the real database. */
const COMMUNITY_CUP = "5bb92b95-73f4-4e25-93dc-bd7caebcd743";
const WORLD_CUP = "a9deb6a8-c7bc-4193-b710-6e5202a3b56c";

const DOOR = 1500;

const waiverValid = {
  id: "contact-1",
  waiver_type: "adult" as const,
  waiver_signed_at: new Date(NOW - 165 * DAY).toISOString(),
  waiver_expires_at: new Date(NOW + 200 * DAY).toISOString(),
};

const waiverLapsed = {
  id: "contact-2",
  waiver_type: "adult" as const,
  waiver_signed_at: new Date(NOW - 400 * DAY).toISOString(),
  waiver_expires_at: new Date(NOW - 35 * DAY).toISOString(),
};

/** Signed a youth waiver — checking them against 'adult' must not pass. */
const waiverYouth = {
  id: "contact-3",
  waiver_type: "youth" as const,
  waiver_signed_at: new Date(NOW - 10 * DAY).toISOString(),
  waiver_expires_at: new Date(NOW + 355 * DAY).toISOString(),
};

/** A live, team-assigned Community Cup spot. The shape that earns free entry. */
function liveSpot(
  over: Partial<FreeEntryRegistrationSnapshot> = {}
): FreeEntryRegistrationSnapshot {
  return {
    tournament_id: COMMUNITY_CUP,
    team_id: "414fa0ec-18b0-420e-8630-5007c430218c",
    payment_status: "paid",
    cancelled_at: null,
    ...over,
  };
}

type Case = {
  name: string;
  input: OpenPlayEntitlementInput;
  expect: "free" | "must_pay" | "waiver_required";
};

const base = {
  freeEntryTournamentIds: [COMMUNITY_CUP],
  doorPriceCents: DOOR,
  waiverType: "adult" as const,
};

const CASES: Case[] = [
  // ---- the ones that cost money if they break -----------------------------
  {
    name: "THE ONE THAT MATTERS: the $80 card payers — payment_method is NULL and must not be read",
    input: { ...base, contact: waiverValid, registrations: [liveSpot()] },
    expect: "free",
  },
  {
    name: "owes the $80 but is on a team → still one of ours, still free",
    input: {
      ...base,
      contact: waiverValid,
      registrations: [liveSpot({ payment_status: "pending" })],
    },
    expect: "free",
  },
  {
    name: "SAFE DEFAULT: no tournaments configured → nobody is comped",
    input: {
      ...base,
      freeEntryTournamentIds: [],
      contact: waiverValid,
      registrations: [liveSpot()],
    },
    expect: "must_pay",
  },
  {
    name: "cancelled their spot → pays at the door",
    input: {
      ...base,
      contact: waiverValid,
      registrations: [
        liveSpot({ cancelled_at: new Date(NOW - DAY).toISOString() }),
      ],
    },
    expect: "must_pay",
  },
  {
    name: "abandoned half-finished signup (no team) → pays at the door",
    input: {
      ...base,
      contact: waiverValid,
      registrations: [liveSpot({ team_id: null })],
    },
    expect: "must_pay",
  },
  {
    name: "took their money back (refunded) → pays at the door",
    input: {
      ...base,
      contact: waiverValid,
      registrations: [liveSpot({ payment_status: "refunded" })],
    },
    expect: "must_pay",
  },
  {
    name: "THE ONE THAT MATTERS: owner comped their $80 (waived) → must not be charged $15",
    input: {
      ...base,
      contact: waiverValid,
      registrations: [liveSpot({ payment_status: "waived" })],
    },
    expect: "free",
  },
  {
    name: "part-paid (partial) is deliberately NOT a qualifying status",
    input: {
      ...base,
      contact: waiverValid,
      registrations: [liveSpot({ payment_status: "partial" })],
    },
    expect: "must_pay",
  },
  {
    name: "on a tournament the organiser did not name for tonight → pays",
    input: {
      ...base,
      contact: waiverValid,
      registrations: [liveSpot({ tournament_id: WORLD_CUP })],
    },
    expect: "must_pay",
  },
  {
    name: "configured tournament they are not in at all → pays",
    input: { ...base, contact: waiverValid, registrations: [] },
    expect: "must_pay",
  },
  {
    name: "legacy row with a NULL tournament_id must never match",
    input: {
      ...base,
      contact: waiverValid,
      registrations: [liveSpot({ tournament_id: null })],
    },
    expect: "must_pay",
  },
  {
    name: "cancelled Community Cup spot + live World Cup spot → still pays",
    input: {
      ...base,
      contact: waiverValid,
      registrations: [
        liveSpot({ cancelled_at: new Date(NOW - DAY).toISOString() }),
        liveSpot({ tournament_id: WORLD_CUP }),
      ],
    },
    expect: "must_pay",
  },
  {
    name: "two rows, only the second qualifies → found anyway",
    input: {
      ...base,
      contact: waiverValid,
      registrations: [liveSpot({ team_id: null }), liveSpot()],
    },
    expect: "free",
  },
  {
    name: "organiser named two tournaments, player is on the second",
    input: {
      ...base,
      freeEntryTournamentIds: [WORLD_CUP, COMMUNITY_CUP],
      contact: waiverValid,
      registrations: [liveSpot()],
    },
    expect: "free",
  },

  // ---- a waiver is never waived -------------------------------------------
  {
    name: "WAIVER BEATS FREE: entitled but lapsed waiver → sign first",
    input: { ...base, contact: waiverLapsed, registrations: [liveSpot()] },
    expect: "waiver_required",
  },
  {
    name: "youth waiver checked against adult → sign first, not free",
    input: { ...base, contact: waiverYouth, registrations: [liveSpot()] },
    expect: "waiver_required",
  },
  {
    name: "youth player checked against youth → free",
    input: {
      ...base,
      waiverType: "youth",
      contact: waiverYouth,
      registrations: [liveSpot()],
    },
    expect: "free",
  },
  {
    name: "nobody we have ever met → waiver first, never must_pay",
    input: { ...base, contact: null, registrations: [liveSpot()] },
    expect: "waiver_required",
  },
];

let failed = 0;

for (const c of CASES) {
  const got = resolveOpenPlayEntitlement(c.input);
  const ok = got.kind === c.expect;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n        got=${got.kind} (expected ${c.expect})`
  );
}

// ---- the free row must say which tournament bought it ----------------------

type ViaCase = { name: string; input: OpenPlayEntitlementInput; expect: string };

const VIA_CASES: ViaCase[] = [
  {
    name: "free entry records WHICH tournament conferred it (for disputes at the field)",
    input: { ...base, contact: waiverValid, registrations: [liveSpot()] },
    expect: COMMUNITY_CUP,
  },
];

for (const c of VIA_CASES) {
  const got = resolveOpenPlayEntitlement(c.input);
  const via = got.kind === "free" ? got.viaTournamentId : `(not free: ${got.kind})`;
  const ok = via === c.expect;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}\n        got=${via} (expected ${c.expect})`);
}

// ---- door price resolution -------------------------------------------------

type PriceCase = {
  name: string;
  event: { entry_fee_cents: number | null; drop_in_fee_cents: number };
  expect: number;
};

const PRICE_CASES: PriceCase[] = [
  {
    name: "tonight's real row: entry_fee_cents 1500 wins",
    event: { entry_fee_cents: 1500, drop_in_fee_cents: 0 },
    expect: 1500,
  },
  {
    name: "no entry fee configured → falls back to drop_in_fee_cents, as checkout does",
    event: { entry_fee_cents: null, drop_in_fee_cents: 1000 },
    expect: 1000,
  },
  {
    name: "entry fee explicitly 0 → falls through rather than selling for nothing",
    event: { entry_fee_cents: 0, drop_in_fee_cents: 1000 },
    expect: 1000,
  },
  {
    name: "nothing priced at all → 0, and the caller must refuse to sell",
    event: { entry_fee_cents: null, drop_in_fee_cents: 0 },
    expect: 0,
  },
];

for (const c of PRICE_CASES) {
  const got = resolveDoorPriceCents(c.event);
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}\n        got=${got} (expected ${c.expect})`);
}

// ---- config parsing degrades to "nobody is free" ---------------------------

type ParseCase = { name: string; input: unknown; expect: string[] };

const PARSE_CASES: ParseCase[] = [
  {
    name: "un-migrated database returns undefined → no free entry",
    input: undefined,
    expect: [],
  },
  { name: "null column → no free entry", input: null, expect: [] },
  {
    name: "nulls and junk inside the array are dropped, not trusted",
    input: [COMMUNITY_CUP, null, "", "not-a-uuid", 7],
    expect: [COMMUNITY_CUP],
  },
  {
    name: "duplicates collapse",
    input: [COMMUNITY_CUP, COMMUNITY_CUP.toUpperCase()],
    expect: [COMMUNITY_CUP],
  },
  { name: "empty array stays empty", input: [], expect: [] },
];

for (const c of PARSE_CASES) {
  const got = parseFreeEntryTournamentIds(c.input);
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n        got=${JSON.stringify(got)} (expected ${JSON.stringify(c.expect)})`
  );
}

// ---- the exported helper the admin view uses -------------------------------

const adminLookup = findQualifyingRegistration([liveSpot()], [COMMUNITY_CUP]);
const adminOk = adminLookup?.tournament_id === COMMUNITY_CUP;
if (!adminOk) failed++;
console.log(
  `${adminOk ? "PASS" : "FAIL"}  admin view can ask "why is this person free" for an existing row\n        got=${adminLookup?.tournament_id ?? "null"} (expected ${COMMUNITY_CUP})`
);

const total =
  CASES.length + VIA_CASES.length + PRICE_CASES.length + PARSE_CASES.length + 1;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed === 0 ? 0 : 1);
