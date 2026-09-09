/**
 * `src/lib/schedule.ts` — grouping matches under rounds for the public Matches
 * tab, the at-a-glance card and the admin panel.
 *
 * Guards: an empty round (the semi-finals before the table is decided) must
 * still be listed; a match with no round must not disappear; two rounds on
 * the same date (Semi-Final and Exhibition, both Oct 16) must keep the owner's
 * order; "next matchday" must survive a postponed match and a half-played
 * night; and which groups open by default must be exactly next + last played.
 *
 * Run: npx tsx scripts/test-schedule.ts
 */
import {
  groupMatchesByRound,
  lastPlayedRound,
  nextMatchday,
  openRoundKeys,
  roundCountsTowardTable,
  scorerLabel,
} from "../src/lib/schedule";
import type { MatchWithDetails, TournamentRound } from "../src/lib/types";

let failed = 0;
let total = 0;
function check(name: string, ok: boolean, detail: string) {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

function round(
  id: string,
  label: string,
  date: string | null,
  sort: number,
  extra: Partial<TournamentRound> = {}
): TournamentRound {
  return {
    id,
    tournament_id: "cc",
    label,
    round_date: date,
    time_start: "7:00 PM",
    time_end: null,
    status: "scheduled",
    note: null,
    rescheduled_to: null,
    sort_order: sort,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

function match(
  id: string,
  roundId: string | null,
  n: number | null,
  status: MatchWithDetails["status"],
  score: [number, number] | null = null,
  extra: Partial<MatchWithDetails> = {}
): MatchWithDetails {
  return {
    id,
    tournament_id: "cc",
    round_id: roundId,
    match_number: n,
    home_team_id: "a",
    away_team_id: "b",
    home_team_label: null,
    away_team_label: null,
    match_date: null,
    kickoff_time: null,
    home_score: score ? score[0] : null,
    away_score: score ? score[1] : null,
    status,
    notes: null,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    home_team: { id: "a", name: "A", color: null },
    away_team: { id: "b", name: "B", color: null },
    scorers: [],
    ...extra,
  };
}

const ROUNDS = [
  round("r1", "Round 1", "2026-08-21", 1),
  round("r2", "Round 2", "2026-08-28", 2),
  round("r3", "Round 3", "2026-09-11", 3),
  round("sf", "Semi-Final", "2026-10-16", 8, { counts_toward_table: false }),
  round("ex", "Exhibition", "2026-10-16", 9, { counts_toward_table: false }),
  round("fi", "Final", "2026-10-23", 10, { counts_toward_table: false }),
];

const MATCHES = [
  match("m3", "r1", 3, "completed", [3, 9]),
  match("m2", "r1", 2, "completed", [8, 3]),
  match("m1", "r1", 1, "postponed", null, { match_date: "2026-09-18" }),
  match("m5", "r2", 5, "completed", [3, 10]),
  match("m4", "r2", 4, "completed", [2, 10]),
  match("m6", "r2", 6, "completed", [2, 9]),
  match("m7", "r3", 7, "scheduled", null, { kickoff_time: "7:00 PM" }),
  match("m8", "r3", 8, "scheduled", null, { kickoff_time: "8:00 PM" }),
  match("m9", "r3", 9, "scheduled", null, { kickoff_time: "9:00 PM" }),
  match("orphan", null, null, "scheduled", null, { match_date: "2026-09-25" }),
  match("orphan2", "deleted-round", null, "scheduled", null),
];

const groups = groupMatchesByRound(ROUNDS, MATCHES);

check(
  "every round is listed, empty ones included, then the unscheduled buckets",
  JSON.stringify(groups.map((g) => g.label)) ===
    JSON.stringify([
      "Round 1", "Round 2", "Round 3", "Semi-Final", "Exhibition", "Final",
      "Unscheduled", "Unscheduled",
    ]),
  groups.map((g) => g.label).join(" | ")
);
check(
  "matches inside a round are ordered by match number",
  groups[0].matches.map((m) => m.match_number).join(",") === "1,2,3",
  groups[0].matches.map((m) => m.match_number).join(",")
);
check(
  "two rounds on the same date keep sort_order (Semi-Final before Exhibition)",
  groups[3].label === "Semi-Final" && groups[4].label === "Exhibition",
  `${groups[3].label}, ${groups[4].label}`
);
check(
  "a match whose round was deleted is not lost",
  groups.some((g) => g.matches.some((m) => m.id === "orphan2")),
  "orphan2 present"
);
check(
  "unscheduled bucket carries the shared match date; dateless bucket last",
  groups[6].date === "2026-09-25" && groups[7].date === null,
  `${groups[6].date}, ${groups[7].date}`
);
check(
  "played count and counts-toward-table flow through",
  groups[0].playedCount === 2 && groups[3].countsTowardTable === false &&
    groups[0].countsTowardTable === true,
  `r1 played=${groups[0].playedCount}`
);
check(
  "roundCountsTowardTable treats a missing value as true",
  roundCountsTowardTable(undefined) && roundCountsTowardTable({ id: "x" }) &&
    roundCountsTowardTable({ id: "x", counts_toward_table: null }) &&
    !roundCountsTowardTable({ id: "x", counts_toward_table: false }),
  "undefined, absent, null -> true; false -> false"
);

// Time travel: the Tuesday between Round 2 and Round 3.
const TUESDAY = new Date("2026-09-08T18:00:00Z");
check(
  "next matchday is Round 3, not the postponed Round-1 match",
  nextMatchday(groups, TUESDAY)?.label === "Round 3",
  nextMatchday(groups, TUESDAY)?.label ?? "null"
);
check(
  "last played round is Round 2",
  lastPlayedRound(groups)?.label === "Round 2",
  lastPlayedRound(groups)?.label ?? "null"
);
check(
  "open by default: Round 2 and Round 3 only",
  JSON.stringify([...openRoundKeys(groups, TUESDAY)].sort()) ===
    JSON.stringify(["r2", "r3"]),
  [...openRoundKeys(groups, TUESDAY)].join(",")
);

// Friday night at 8:30 PM Houston (01:30 UTC Saturday): Round 3 half played.
const FRIDAY_NIGHT = new Date("2026-09-12T01:30:00Z");
const halfPlayed = groupMatchesByRound(
  ROUNDS,
  MATCHES.map((m) =>
    m.id === "m7" ? { ...m, status: "completed" as const, home_score: 1, away_score: 0 } : m
  )
);
check(
  "a half-played round is both next and last, so it opens once",
  nextMatchday(halfPlayed, FRIDAY_NIGHT)?.label === "Round 3" &&
    lastPlayedRound(halfPlayed)?.label === "Round 3" &&
    openRoundKeys(halfPlayed, FRIDAY_NIGHT).size === 1,
  `open=${[...openRoundKeys(halfPlayed, FRIDAY_NIGHT)].join(",")}`
);

// After the season: nothing next; the Final is last played.
const doneGroups = groupMatchesByRound(
  ROUNDS,
  [
    ...MATCHES.filter((m) => m.round_id && m.round_id !== "deleted-round").map((m) =>
      m.status === "scheduled" ? { ...m, status: "completed" as const, home_score: 1, away_score: 1 } : m
    ),
    match("f1", "fi", 25, "completed", [2, 1]),
  ]
);
check(
  "after the final there is no next matchday and the Final is last played",
  nextMatchday(doneGroups, new Date("2026-11-01T12:00:00Z")) === null &&
    lastPlayedRound(doneGroups)?.label === "Final",
  `next=${nextMatchday(doneGroups, new Date("2026-11-01T12:00:00Z"))?.label ?? "null"}`
);

// A cancelled round is skipped as "next".
const cancelledR3 = groupMatchesByRound(
  ROUNDS.map((r) => (r.id === "r3" ? { ...r, status: "cancelled" as const } : r)),
  MATCHES
);
check(
  "a cancelled round is never next",
  nextMatchday(cancelledR3, TUESDAY)?.label === "Semi-Final",
  nextMatchday(cancelledR3, TUESDAY)?.label ?? "null"
);

check(
  "scorer labels",
  scorerLabel({ scorer_name: "Kelvin Cardona", goals: 3 }) === "Kelvin Cardona 3" &&
    scorerLabel({ scorer_name: "Kelvin Cardona", goals: 1 }) === "Kelvin Cardona" &&
    scorerLabel({ scorer_name: "whatever", goals: 2, own_goal: true }) === "Own goal 2",
  "name N / name / Own goal N"
);

console.log(`\n${total - failed}/${total} passed`);
process.exit(failed === 0 ? 0 : 1);
