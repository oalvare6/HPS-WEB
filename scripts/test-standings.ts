/**
 * `computeStandings`, `computeTopScorers` and `isMatchPlayed` in
 * `src/lib/standings.ts` / `src/lib/schedule.ts`.
 *
 * Guards the failures that would quietly publish a wrong table during the
 * Community Cup: a semi-final or exhibition result moving the league table, a
 * scored-but-scheduled match being ignored without a word, an own goal handing
 * a player a Golden Boot goal, and "Kelvin" / "Kelvin Cardona" splitting one
 * person across two rows. Numbers are the real Round 1-2 results from the
 * operator's spreadsheet (2026-09-08).
 *
 * Run: npx tsx scripts/test-standings.ts
 */
import {
  computeStandings,
  computeTopScorers,
  isMatchPlayed,
} from "../src/lib/standings";
import type {
  MatchScorer,
  MatchWithDetails,
  TournamentRound,
} from "../src/lib/types";

let failed = 0;
let total = 0;
function check(name: string, ok: boolean, detail: string) {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

const T = {
  po: { id: "po", name: "Post Oak FC", color: "#e7084b" },
  tw: { id: "tw", name: "3rd Ward FC", color: null },
  hc: { id: "hc", name: "Hiram Clarke FC", color: "#ff00bb" },
  tn: { id: "tn", name: "Townwood FC", color: "#0aff47" },
  bw: { id: "bw", name: "S. Beltway FC", color: "#f2e01c" },
  be: { id: "be", name: "Bellaire FC", color: "#2042ee" },
  ghost: { id: "ghost", name: "Heights FC", color: null },
};
const TEAMS = Object.values(T);

function round(
  id: string,
  label: string,
  counts?: boolean | null
): TournamentRound {
  return {
    id,
    tournament_id: "cc",
    label,
    round_date: null,
    time_start: null,
    time_end: null,
    status: "scheduled",
    note: null,
    rescheduled_to: null,
    counts_toward_table: counts,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };
}

let scorerSeq = 0;
function scorer(
  matchId: string,
  teamId: string,
  name: string,
  goals = 1,
  extra: Partial<MatchScorer> = {}
): MatchScorer {
  return {
    id: `s${scorerSeq++}`,
    match_id: matchId,
    team_id: teamId,
    scorer_name: name,
    goals,
    sort_order: scorerSeq,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

function match(
  id: string,
  roundId: string | null,
  home: keyof typeof T,
  away: keyof typeof T,
  hs: number | null,
  as: number | null,
  status: MatchWithDetails["status"],
  scorers: MatchScorer[] = []
): MatchWithDetails {
  return {
    id,
    tournament_id: "cc",
    round_id: roundId,
    match_number: null,
    home_team_id: T[home].id,
    away_team_id: T[away].id,
    home_team_label: null,
    away_team_label: null,
    match_date: null,
    kickoff_time: null,
    home_score: hs,
    away_score: as,
    status,
    notes: null,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    home_team: T[home],
    away_team: T[away],
    scorers,
  };
}

const R1 = round("r1", "Round 1");
const R2 = round("r2", "Round 2", true);
const SF = round("sf", "Semi-Final", false);
const EX = round("ex", "Exhibition", false);
const LEGACY = round("legacy", "Old round", null); // un-migrated row

// Round 1-2 as played (spreadsheet, match lines trusted).
const LEAGUE: MatchWithDetails[] = [
  match("m2", "r1", "po", "tw", 8, 3, "completed", [
    scorer("m2", "po", "Kevin", 3, { contact_id: "c-kelvin" }),
    scorer("m2", "po", "Rene Cruz", 4, { contact_id: "c-rene" }),
    scorer("m2", "po", "Michael Gomez", 1),
    scorer("m2", "tw", "Anthony Reyes", 1),
    scorer("m2", "tw", "Jacob Mashburn", 1),
    scorer("m2", "tw", "Own goal", 1, { own_goal: true }),
  ]),
  match("m3", "r1", "tn", "hc", 3, 9, "completed", [
    scorer("m3", "tn", "Carlos Castellon", 3),
    scorer("m3", "hc", "William Franco", 2),
    scorer("m3", "hc", "Tony", 2),
    scorer("m3", "hc", "Brandon Bricker", 3),
    scorer("m3", "hc", "Jan Carlos Galo", 1),
    scorer("m3", "hc", "Alexis Chino", 1),
  ]),
  match("m4", "r2", "be", "tw", 2, 10, "completed", [
    scorer("m4", "be", "Jose Chavarria", 2),
    scorer("m4", "tw", "Jesse Pecero", 6),
    scorer("m4", "tw", "Alexis Reyes", 3),
    scorer("m4", "tw", "Anthony Reyes", 1),
  ]),
  match("m5", "r2", "tn", "po", 3, 10, "completed", [
    scorer("m5", "tn", "Gabriel Minero", 3),
    scorer("m5", "po", "Kelvin Cardona", 5, { contact_id: "c-kelvin" }),
    scorer("m5", "po", "Dilver Benitez", 2),
    scorer("m5", "po", "Rene Cruz", 1, { contact_id: "c-rene" }),
    scorer("m5", "po", "Luis Grande", 1),
    scorer("m5", "po", "Erik Tello", 1),
  ]),
  match("m6", "r2", "bw", "hc", 2, 9, "completed", [
    scorer("m6", "bw", "Salvador Castro", 1),
    scorer("m6", "bw", "Alejandro Plazaola", 1),
    scorer("m6", "hc", "William Franco", 3),
    scorer("m6", "hc", "Jan Carlos Galo", 2),
    scorer("m6", "hc", "Joshua Lockhart", 1),
    scorer("m6", "hc", "Antonio", 1),
    scorer("m6", "hc", "Bryan", 1),
    scorer("m6", "hc", "Own goal", 1, { own_goal: true }),
  ]),
  match("m1", "r1", "bw", "be", null, null, "postponed"),
  match("m7", "r2", "hc", "po", null, null, "scheduled"),
];

const ROUNDS = [R1, R2, SF, EX, LEGACY];

// 1. The table after two rounds matches the spreadsheet (with corrected GD).
{
  const table = computeStandings(TEAMS, LEAGUE, ROUNDS);
  const expect = [
    ["Hiram Clarke FC", 2, 6, 18, 5, 13],
    ["Post Oak FC", 2, 6, 18, 6, 12],
    ["3rd Ward FC", 2, 3, 13, 10, 3],
    ["S. Beltway FC", 1, 0, 2, 9, -7],
    ["Bellaire FC", 1, 0, 2, 10, -8],
    ["Townwood FC", 2, 0, 6, 19, -13],
  ] as const;
  const got = table.map((r) => [
    r.team_name,
    r.played,
    r.points,
    r.goals_for,
    r.goals_against,
    r.goal_difference,
  ]);
  check(
    "round 1-2 table (order, P, Pts, GF, GA, GD)",
    JSON.stringify(got) === JSON.stringify(expect.map((e) => [...e])),
    JSON.stringify(got)
  );
  check(
    "a team with no fixtures is not listed",
    !table.some((r) => r.team_id === "ghost"),
    `rows: ${table.map((r) => r.team_name).join(", ")}`
  );
}

// 2. Postponed and scored-but-scheduled matches do not count.
{
  const sneaky = match("m8", "r2", "be", "tn", 4, 0, "scheduled");
  const table = computeStandings(TEAMS, [...LEAGUE, sneaky], ROUNDS);
  const be = table.find((r) => r.team_id === "be")!;
  check(
    "a score saved with status scheduled is not a result",
    be.played === 1 && be.points === 0,
    `Bellaire played=${be.played} points=${be.points}`
  );
  check(
    "isMatchPlayed requires completed AND both scores",
    !isMatchPlayed(sneaky) &&
      !isMatchPlayed({ status: "completed", home_score: 1, away_score: null }) &&
      isMatchPlayed({ status: "completed", home_score: 0, away_score: 0 }),
    "scheduled+score, completed+null, completed+0-0"
  );
}

// 3. Semi-finals and the exhibition never move the league table.
{
  const semi = match("sf1", "sf", "hc", "bw", 1, 0, "completed");
  const exh = match("ex1", "ex", "be", "tn", 7, 7, "completed");
  const table = computeStandings(TEAMS, [...LEAGUE, semi, exh], ROUNDS);
  const hc = table.find((r) => r.team_id === "hc")!;
  const be = table.find((r) => r.team_id === "be")!;
  check(
    "playoff result excluded from the table",
    hc.played === 2 && hc.points === 6,
    `Hiram Clarke played=${hc.played} points=${hc.points}`
  );
  check(
    "exhibition draw excluded from the table",
    be.played === 1 && be.drawn === 0,
    `Bellaire played=${be.played} drawn=${be.drawn}`
  );
}

// 4. An un-migrated round (counts_toward_table undefined/null) still counts.
{
  const legacy = match("lg1", "legacy", "be", "tn", 1, 0, "completed");
  const noRound = match("nr1", null, "be", "tn", 2, 0, "completed");
  const table = computeStandings(TEAMS, [...LEAGUE, legacy, noRound], ROUNDS);
  const be = table.find((r) => r.team_id === "be")!;
  check(
    "missing counts_toward_table means the round counts; no round counts too",
    be.played === 3 && be.points === 6,
    `Bellaire played=${be.played} points=${be.points}`
  );
}

// 5. Placeholder sides and same-team fixtures are ignored.
{
  const placeholder: MatchWithDetails = {
    ...match("ph", "sf", "hc", "po", 2, 1, "completed"),
    home_team_id: null,
    home_team: null,
    home_team_label: "1st place",
  };
  const sameTeam = match("same", "r2", "po", "po", 3, 3, "completed");
  const table = computeStandings(TEAMS, [...LEAGUE, placeholder, sameTeam], ROUNDS);
  const po = table.find((r) => r.team_id === "po")!;
  check(
    "placeholder and same-team fixtures do not count",
    po.played === 2 && po.drawn === 0,
    `Post Oak played=${po.played} drawn=${po.drawn}`
  );
}

// 6. Top scorers: person identity, own goals, played only, shared ranks.
{
  const scoredButScheduled = match("m9", "r2", "be", "tn", 5, 0, "scheduled", [
    scorer("m9", "be", "Jose Chavarria", 5),
  ]);
  const { rows, ownGoals } = computeTopScorers([...LEAGUE, scoredButScheduled]);
  const top4 = rows.slice(0, 4).map((r) => [r.rank, r.scorer_name, r.goals]);
  check(
    "Kelvin 3 + Kelvin Cardona 5 merge on contact_id and keep the full name",
    JSON.stringify(top4[0]) === JSON.stringify([1, "Kelvin Cardona", 8]),
    JSON.stringify(top4)
  );
  check(
    "Jesse 6, then William and Rene tie on 5 and share rank 3",
    JSON.stringify(top4.slice(1)) ===
      JSON.stringify([
        [2, "Jesse Pecero", 6],
        [3, "Rene Cruz", 5],
        [3, "William Franco", 5],
      ]),
    JSON.stringify(top4.slice(1))
  );
  const nextRank = rows.find((r) => r.goals === 3)?.rank;
  check("rank after a shared 3rd is 5, not 4", nextRank === 5, `rank=${nextRank}`);
  check(
    "own goals are counted separately, never as a player",
    ownGoals === 2 && !rows.some((r) => r.scorer_name.toLowerCase() === "own goal"),
    `ownGoals=${ownGoals}`
  );
  check(
    "scorers on an unplayed match are not on the leaderboard",
    rows.find((r) => r.scorer_name === "Jose Chavarria")?.goals === 2,
    `Jose=${rows.find((r) => r.scorer_name === "Jose Chavarria")?.goals}`
  );
  check(
    "same free-text name on two teams stays two rows",
    rows.filter((r) => r.scorer_name === "Anthony Reyes").length === 1 &&
      rows.filter((r) => r.scorer_name === "Alexis Reyes").length === 1,
    "Anthony Reyes x1, Alexis Reyes x1"
  );
  check(
    "case-only spelling differences merge without a contact",
    computeTopScorers([
      match("x", "r1", "po", "tw", 2, 0, "completed", [
        scorer("x", "po", "kevin", 1),
        scorer("x", "po", "Kevin", 1),
      ]),
    ]).rows.length === 1,
    "kevin + Kevin"
  );
}

console.log(`\n${total - failed}/${total} passed`);
process.exit(failed === 0 ? 0 : 1);
