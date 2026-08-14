/**
 * What the `/me` "What's next" card actually SAYS, per kind of player.
 *
 * `/me` used to be a record of the past: a signed-in player landed on a profile
 * form and had to work out where to go. The operator's report: *"after signing
 * in on the homepage users go to their account details and then they might get
 * confused and not know where to click."* The card added to the top of that page
 * answers it, resolving each open event through `viewerEventCta`.
 *
 * The regression this file exists to catch is the one this codebase has already
 * had once: **telling somebody who is on the roster to sign up again.** The card
 * renders `cta.note ?? cta.heading` plus `cta.label`, so those are what get
 * asserted here — the rendered sentence, not the internal state name.
 *
 * Run: npx tsx scripts/test-me-next-steps.ts
 */
import { viewerEventCta } from "../src/lib/tournament-public-links";
import type { SignupState } from "../src/lib/signup-state";

/** The shape `viewerEventCta` reads — widened so both kinds share one type. */
type EventFixture = {
  slug: string;
  register_url: string | null;
  pay_url: string | null;
  registration_open: boolean;
  payments_open: boolean;
  kind: "tournament" | "open_play";
};

const cup: EventFixture = {
  slug: "community-cup-fall-2026",
  register_url: null,
  pay_url: null,
  registration_open: true,
  payments_open: true,
  kind: "tournament",
};

const openPlay: EventFixture = {
  slug: "open-play-july-27-28-2026",
  register_url: null,
  pay_url: null,
  registration_open: true,
  payments_open: true,
  kind: "open_play",
};

type Case = {
  label: string;
  tournament: EventFixture;
  state: SignupState;
  fee: string | null;
  team: string | null;
  /** Substrings that must NOT appear in the rendered card. */
  mustNotSay?: string[];
  /** Substring that must appear. */
  mustSay?: string;
};

const cases: Case[] = [
  {
    label: "BRAND NEW player, no waiver yet — the most common case tonight",
    tournament: cup,
    state: { kind: "full_signup" } as SignupState,
    fee: "$80.00",
    team: null,
    mustSay: "Sign up to play",
  },
  {
    label: "NEW player, Community Cup — the announcement's target",
    tournament: cup,
    state: { kind: "quick_join" } as SignupState,
    fee: "$80.00",
    team: null,
    mustSay: "Sign up to play",
  },
  {
    label: "NEW player, tonight's open play",
    tournament: openPlay,
    state: { kind: "quick_join" } as SignupState,
    fee: "$15.00",
    team: null,
    mustSay: "Sign up to play",
  },
  {
    label: "ALREADY PAID for the Cup — must never be told to sign up",
    tournament: cup,
    state: {
      kind: "already_paid",
      registrationId: "r1",
      teamId: "t1",
    } as SignupState,
    fee: "$80.00",
    team: "Heights FC",
    mustNotSay: ["Sign up", "Register"],
  },
  {
    label: "On the roster but owes the $80",
    tournament: cup,
    state: {
      kind: "owes_payment",
      registrationId: "r1",
      teamId: "t1",
      payingCash: false,
    } as SignupState,
    fee: "$80.00",
    team: "Heights FC",
    mustNotSay: ["Sign up", "Register"],
    mustSay: "Pay $80.00 now",
  },
  {
    label: "Declared cash — nothing to press, and no nagging",
    tournament: cup,
    state: {
      kind: "owes_payment",
      registrationId: "r1",
      teamId: "t1",
      payingCash: true,
    } as SignupState,
    fee: "$80.00",
    team: "Heights FC",
    mustNotSay: ["Sign up", "Register", "Pay now"],
  },
  {
    label: "On the roster, waiver outstanding → sign it, don't pay",
    tournament: cup,
    state: { kind: "needs_waiver", registrationId: "r1" } as SignupState,
    fee: "$80.00",
    team: null,
    mustNotSay: ["Sign up to play"],
    mustSay: "Sign my waiver",
  },
  {
    label: "Comped for tonight (waived resolves to already_paid)",
    tournament: openPlay,
    state: {
      kind: "already_paid",
      registrationId: "r2",
      teamId: null,
    } as SignupState,
    fee: "$15.00",
    team: null,
    mustNotSay: ["Sign up", "Pay"],
  },
];

let failed = 0;

for (const c of cases) {
  const cta = viewerEventCta({
    tournament: c.tournament,
    state: c.state,
    teamName: c.team,
    entryFeeLabel: c.fee,
    isFinished: false,
  });

  // Exactly what NextStepCard puts on screen.
  const rendered = `${cta.note ?? cta.heading} | ${cta.label ?? "(no button)"}`;

  const violations: string[] = [];
  for (const banned of c.mustNotSay ?? []) {
    if (rendered.toLowerCase().includes(banned.toLowerCase())) {
      violations.push(`must NOT say "${banned}"`);
    }
  }
  if (c.mustSay && !rendered.includes(c.mustSay)) {
    violations.push(`must say "${c.mustSay}"`);
  }

  if (violations.length > 0) {
    failed++;
    console.log(`FAIL  ${c.label}`);
    console.log(`        rendered: ${rendered}`);
    console.log(`        ${violations.join("; ")}`);
  } else {
    console.log(`PASS  ${c.label}`);
    console.log(`        ${rendered}`);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed > 0) process.exit(1);
