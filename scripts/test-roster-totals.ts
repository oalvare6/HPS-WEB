/**
 * `progressByTeam` in `src/lib/admin-roster.ts` — the pay-later view.
 *
 * Players sign up first and pay over the following weeks, so the owner's real
 * question is "how far along is each team", and the number they act on is
 * `unpaid`. The cases below cover what would quietly make that number lie: a
 * guest counted as a squad member, a player on a deleted team vanishing from
 * the roll-up, and a team with nobody on it disappearing instead of showing 0.
 *
 * Run: npx tsx scripts/test-roster-totals.ts
 */
import {
  progressByTeam,
  type RosterRow,
  type RosterTeam,
} from "../src/lib/admin-roster";

const TEAMS: RosterTeam[] = [
  { id: "team-a", name: "3rd Ward FC", color: null },
  { id: "team-b", name: "Heights FC", color: null },
  { id: "team-empty", name: "Nobody FC", color: null },
];

let seq = 0;
function row(over: Partial<RosterRow>): RosterRow {
  seq++;
  return {
    id: `row-${seq}`,
    role: "player",
    contactId: `contact-${seq}`,
    firstName: "Player",
    lastName: String(seq),
    phone: null,
    email: null,
    teamId: null,
    teamName: null,
    teamColor: null,
    waiverOk: true,
    waiverEvidence: "document",
    waiverExpiresAt: null,
    paid: false,
    paymentStatus: "pending",
    needsReview: false,
    incomplete: false,
    createdAt: new Date(0).toISOString(),
    ...over,
  };
}

const ROWS: RosterRow[] = [
  // 3rd Ward FC: 2 of 3 paid, one of them missing a waiver.
  row({ teamId: "team-a", paid: true }),
  row({ teamId: "team-a", paid: true }),
  row({ teamId: "team-a", paid: false, waiverOk: false }),

  // Heights FC: everyone paid.
  row({ teamId: "team-b", paid: true }),
  row({ teamId: "team-b", paid: true }),

  // No team at all — the bucket the owner needs before match day.
  row({ teamId: null, paid: false }),
  row({ teamId: null, paid: true, waiverOk: false }),

  // A guest. Fills in for one night at a separate price, is not on any team's
  // season roster (D7), and must not inflate a team's progress.
  row({ role: "guest", teamId: "team-b", paid: false }),

  // Points at a team that no longer exists. Must land in Unassigned rather than
  // being dropped, or the roster silently loses a player.
  row({ teamId: "team-deleted", paid: false }),
];

type Expected = {
  teamName: string;
  players: number;
  paid: number;
  unpaid: number;
  waiverMissing: number;
  paidPercent: number;
};

const EXPECTED: Expected[] = [
  { teamName: "3rd Ward FC", players: 3, paid: 2, unpaid: 1, waiverMissing: 1, paidPercent: 67 },
  { teamName: "Heights FC", players: 2, paid: 2, unpaid: 0, waiverMissing: 0, paidPercent: 100 },
  { teamName: "Nobody FC", players: 0, paid: 0, unpaid: 0, waiverMissing: 0, paidPercent: 0 },
  { teamName: "No team yet", players: 3, paid: 1, unpaid: 2, waiverMissing: 1, paidPercent: 33 },
];

let failed = 0;

function check(name: string, ok: boolean, detail: string) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

const got = progressByTeam(ROWS, TEAMS);

check(
  "one bucket per team, plus Unassigned, in order",
  got.length === EXPECTED.length &&
    got.every((g, i) => g.teamName === EXPECTED[i].teamName),
  `got [${got.map((g) => g.teamName).join(", ")}]`
);

for (const [i, want] of EXPECTED.entries()) {
  const g = got[i];
  if (!g) {
    check(want.teamName, false, "missing from the result");
    continue;
  }
  check(
    `${want.teamName} — ${want.paid}/${want.players} paid, ${want.paidPercent}%`,
    g.players === want.players &&
      g.paid === want.paid &&
      g.unpaid === want.unpaid &&
      g.waiverMissing === want.waiverMissing &&
      g.paidPercent === want.paidPercent,
    `players=${g.players} paid=${g.paid} unpaid=${g.unpaid} ` +
      `waiverMissing=${g.waiverMissing} paidPercent=${g.paidPercent}`
  );
}

// An empty team divides by zero if paidPercent isn't guarded.
const emptyTeam = got.find((g) => g.teamName === "Nobody FC");
check(
  "an empty team is 0%, never NaN",
  Number.isFinite(emptyTeam?.paidPercent) && emptyTeam?.paidPercent === 0,
  `paidPercent=${emptyTeam?.paidPercent}`
);

// No rows at all is the state every new event starts in.
const fresh = progressByTeam([], TEAMS);
check(
  "a brand-new event lists its teams at 0 of 0 with no Unassigned row",
  fresh.length === 3 && fresh.every((g) => g.players === 0 && g.paidPercent === 0),
  `got [${fresh.map((g) => `${g.teamName}:${g.players}`).join(", ")}]`
);

// The guest above is on team-b and unpaid; if it leaked in, Heights would read
// 2/3 and the owner would chase a player who owes nothing.
const heights = got.find((g) => g.teamName === "Heights FC");
check(
  "a guest never counts toward a team's roster",
  heights?.players === 2 && heights?.unpaid === 0,
  `Heights players=${heights?.players} unpaid=${heights?.unpaid}`
);

const total = EXPECTED.length + 4;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed === 0 ? 0 : 1);
