/**
 * Canonical World Cup 7v7 schedule + results, through the July 24 semi-finals
 * sheet ("Summer 2026 7v7 WC Tournament - Semis"): all seven group rounds,
 * both semi-finals, and the Final fixture (Morocco vs India, Jul 31 7:30 PM).
 *
 * Notable encodings:
 * - Match #1 (Brazil vs USA, Round 1) was never played on its date; it is
 *   `cancelled` here and was replayed as match #16 in Round 6 for DOUBLE
 *   points. This is why the published standings cannot be derived from these
 *   scores (see src/lib/world-cup-standings.ts).
 * - Matches #10 and #15 are 3-0 technical scores (Kazakhstan forfeits).
 * - Match #22 (SF1) finished Morocco 6-6 USA with Morocco advancing; the
 *   `advanced` field maps to matches.advanced_team_id (requires migration
 *   20260731090000_add_match_advanced_team.sql).
 * - Per-match scorer names are transcribed from the operator's sheet and are
 *   best-effort (nicknames, jersey numbers); scores are exact. The published
 *   Leading Scoring List lives in src/lib/world-cup-scorers.ts.
 *
 * Idempotent: teams/rounds are matched by name/label (created only if
 * missing), and the tournament's matches + goals are cleared and rebuilt on
 * every run, so re-running restores the canonical state.
 *
 * Run:    node --env-file=.env.local scripts/seed-world-cup-schedule.mjs
 * Verify: node --env-file=.env.local scripts/seed-world-cup-schedule.mjs --verify
 *         (read-only: diffs the live DB against this file, exits 1 on drift)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const SLUG = "world-cup-summer-tournament";
const VERIFY = process.argv.includes("--verify");

const TEAMS = [
  { name: "Brazil", color: "#FACC15" },
  { name: "USA", color: "#2563EB" },
  { name: "Mexico", color: "#16A34A" },
  { name: "Kazakhstan", color: "#06B6D4" },
  { name: "Morocco", color: "#DC2626" },
  { name: "India", color: "#F97316" },
];

const ROUNDS = [
  { label: "Round 1", date: "2026-06-12" },
  { label: "Round 2", date: "2026-06-19" },
  { label: "Round 3", date: "2026-06-26" },
  { label: "Round 4", date: "2026-06-30" },
  { label: "Round 5", date: "2026-07-02" },
  { label: "Round 6", date: "2026-07-10" },
  { label: "Round 7", date: "2026-07-17" },
  { label: "Semi-Finals", date: "2026-07-24" },
  { label: "Final", date: "2026-07-31" },
];

// match_number, round label, kickoff, sides, and (where played) score + scorers.
// `advanced` names the team that went through when the score alone didn't decide it.
const MATCHES = [
  // Round 1 — Friday June 12
  {
    n: 1,
    round: "Round 1",
    time: "7:00 PM",
    home: "Brazil",
    away: "USA",
    status: "cancelled",
    note: "Not played — replayed in Round 6 for double points",
  },
  {
    n: 2,
    round: "Round 1",
    time: "8:00 PM",
    home: "Mexico",
    away: "Kazakhstan",
    status: "completed",
    hs: 5,
    as: 5,
    goals: {
      home: [["Alejandro", 1], ["Jason", 3], ["Jesus", 1]],
      away: [["Jacob", 2], ["OmarA", 1], ["Alan", 1], ["Jesse", 1]],
    },
  },
  {
    n: 3,
    round: "Round 1",
    time: "9:00 PM",
    home: "Morocco",
    away: "India",
    status: "completed",
    hs: 6,
    as: 11,
    goals: {
      home: [["Josh", 4], ["JC", 2]],
      away: [["Daniel", 6], ["Mahnek", 2], ["Gahvin", 3]],
    },
  },

  // Round 2 — Friday June 19
  {
    n: 4,
    round: "Round 2",
    time: "7:00 PM",
    home: "Brazil",
    away: "Mexico",
    status: "completed",
    hs: 3,
    as: 4,
    goals: {
      home: [["Ethan", 1], ["Alex", 2]],
      away: [["Alejandro", 2], ["Sergio", 1], ["Chava", 1]],
    },
  },
  {
    n: 5,
    round: "Round 2",
    time: "8:00 PM",
    home: "USA",
    away: "Morocco",
    status: "completed",
    hs: 5,
    as: 3,
    goals: {
      home: [["Will", 1], ["Evan", 2], ["Jason", 3]],
      away: [["JanC", 1], ["Josh", 1], ["Gilbert", 1]],
    },
  },
  {
    n: 6,
    round: "Round 2",
    time: "9:00 PM",
    home: "Kazakhstan",
    away: "India",
    status: "completed",
    hs: 2,
    as: 6,
    goals: {
      home: [["Jesse", 2]],
      away: [["Daniel", 2], ["Mahnek", 1], ["Flyin", 2], ["Gahvin", 1]],
    },
  },

  // Round 3 — Friday June 26
  {
    n: 7,
    round: "Round 3",
    time: "7:00 PM",
    home: "Brazil",
    away: "Morocco",
    status: "completed",
    hs: 2,
    as: 8,
    goals: {
      home: [["Abu", 1], ["Tony", 1]],
      away: [["Kelvin", 3], ["William", 2], ["Edgar", 2], ["JanC", 1]],
    },
  },
  {
    n: 8,
    round: "Round 3",
    time: "8:00 PM",
    home: "USA",
    away: "Kazakhstan",
    status: "completed",
    hs: 9,
    as: 3,
    goals: {
      home: [["CarlosC", 6], ["#6", 1], ["#7", 1]],
      away: [["#7", 2], ["#5", 1]],
    },
  },
  {
    n: 9,
    round: "Round 3",
    time: "9:00 PM",
    home: "Mexico",
    away: "India",
    status: "completed",
    hs: 1,
    as: 9,
    goals: {
      home: [["#3", 1]],
      away: [["No#", 2], ["Shiv", 1], ["Mahnek", 4], ["Gahvin", 2]],
    },
  },

  // Round 4 — Tuesday June 30
  {
    n: 10,
    round: "Round 4",
    time: "7:00 PM",
    home: "Brazil",
    away: "Kazakhstan",
    status: "completed",
    hs: 3,
    as: 0,
    note: "Kazakhstan forfeit (technical score)",
  },
  {
    n: 11,
    round: "Round 4",
    time: "8:00 PM",
    home: "USA",
    away: "India",
    status: "completed",
    hs: 3,
    as: 7,
    goals: {
      home: [["Brandon", 2], ["Eduardo", 1]],
      away: [["Mahnek", 4], ["Daniel", 1], ["Gahvin", 2]],
    },
  },
  {
    n: 12,
    round: "Round 4",
    time: "9:00 PM",
    home: "Mexico",
    away: "Morocco",
    status: "completed",
    hs: 7,
    as: 5,
    goals: {
      home: [["Alejandro", 1], ["Emir", 2], ["Chris", 1], ["OG", 2]],
      away: [["Kelvin", 2], ["Eduardo", 1], ["Ethan", 1]],
    },
  },

  // Round 5 — Thursday July 2
  {
    n: 13,
    round: "Round 5",
    time: "7:00 PM",
    home: "Brazil",
    away: "India",
    status: "completed",
    hs: 10,
    as: 3,
    goals: {
      home: [["Ethan", 3], ["Abu", 3], ["Alex", 1], ["Eidhan", 1], ["Brandon", 2]],
      away: [["Daniel", 2], ["Shiv", 1]],
    },
  },
  {
    n: 14,
    round: "Round 5",
    time: "8:00 PM",
    home: "USA",
    away: "Mexico",
    status: "completed",
    hs: 4,
    as: 2,
    goals: {
      home: [["CarlosC", 2], ["Jason", 1], ["Evan", 1]],
      away: [["Julian", 1], ["Emir", 1]],
    },
  },
  {
    n: 15,
    round: "Round 5",
    time: "9:00 PM",
    home: "Morocco",
    away: "Kazakhstan",
    status: "completed",
    hs: 3,
    as: 0,
    note: "Kazakhstan forfeit (technical score)",
  },

  // Round 6 — Friday July 10
  {
    n: 16,
    round: "Round 6",
    time: "7:00 PM",
    home: "Brazil",
    away: "USA",
    status: "completed",
    hs: 6,
    as: 6,
    note: "Round 1 make-up — played for double points",
    goals: {
      home: [["Ethan", 2], ["Abu", 2], ["Nathan", 2]],
      away: [["Evan", 2], ["Adrian", 2], ["CarlosF", 1], ["Jason", 1]],
    },
  },
  {
    n: 17,
    round: "Round 6",
    time: "8:00 PM",
    home: "Mexico",
    away: "Morocco",
    status: "completed",
    hs: 2,
    as: 5,
    goals: {
      home: [["Emir", 1], ["Emiliano", 1]],
      away: [["Will", 3], ["Kelvin", 1], ["OmarA", 1]],
    },
  },
  {
    n: 18,
    round: "Round 6",
    time: "9:00 PM",
    home: "India",
    away: "Kazakhstan",
    status: "completed",
    hs: 2,
    as: 4,
    goals: {
      home: [["Mahnek", 1], ["Gahvin", 1]],
      away: [["Yousef", 2], ["Jesse", 1], ["Alan", 1]],
    },
  },

  // Round 7 — Friday July 17
  {
    n: 19,
    round: "Round 7",
    time: "7:00 PM",
    home: "Brazil",
    away: "Mexico",
    status: "completed",
    hs: 7,
    as: 6,
    goals: {
      home: [["Nathan", 3], ["Eduardo", 2], ["Abu", 1], ["Ethan", 1]],
      away: [["Alejandro", 3], ["Jose", 1], ["Julian", 1], ["Emiliano", 1]],
    },
  },
  {
    n: 20,
    round: "Round 7",
    time: "8:00 PM",
    home: "India",
    away: "Morocco",
    status: "completed",
    hs: 3,
    as: 9,
    goals: {
      home: [["Gahvin", 2], ["Mahnek", 1]],
      away: [["Kelvin", 4], ["Will", 3], ["OmarA", 1], ["Oscar", 1]],
    },
  },
  {
    n: 21,
    round: "Round 7",
    time: "9:00 PM",
    home: "USA",
    away: "Kazakhstan",
    status: "completed",
    hs: 1,
    as: 9,
    goals: {
      home: [["David", 1]],
      away: [["Jacob", 3], ["Alfonso", 3], ["Miguel", 2], ["OG", 1]],
    },
  },

  // Semi-Finals — Friday July 24
  {
    n: 22,
    round: "Semi-Finals",
    time: "7:00 PM",
    home: "Morocco",
    away: "USA",
    status: "completed",
    hs: 6,
    as: 6,
    advanced: "Morocco",
    note: "Morocco advanced after 6-6 draw",
    goals: {
      home: [["Kelvin", 2], ["Will", 3], ["Oscar", 1]],
      away: [["OmarV", 2], ["Jason", 2], ["CarlosC", 1], ["Adrian", 1]],
    },
  },
  {
    n: 23,
    round: "Semi-Finals",
    time: "8:10 PM",
    home: "India",
    away: "Brazil",
    status: "completed",
    hs: 5,
    as: 2,
    goals: {
      home: [["Daniel", 2], ["Gahvin", 1], ["Armon", 1], ["Mahnek", 1]],
      away: [["Nathan", 1], ["Alex", 1]],
    },
  },

  // Final — Friday July 31
  {
    n: 24,
    round: "Final",
    time: "7:30 PM",
    home: "Morocco",
    away: "India",
  },
];

function fail(message, error) {
  console.error(message, error?.message ?? error ?? "");
  process.exit(1);
}

// 1. Tournament
const { data: tournament, error: tErr } = await supabase
  .from("tournaments")
  .select("id, title, slug")
  .eq("slug", SLUG)
  .maybeSingle();
if (tErr) fail("Tournament lookup failed:", tErr);
if (!tournament) fail(`No tournament with slug "${SLUG}". Create it in admin first.`);
const tournamentId = tournament.id;

// 2. Teams (create missing, keyed case-insensitively by name; read-only in --verify)
const { data: existingTeams, error: teamErr } = await supabase
  .from("teams")
  .select("id, name")
  .eq("tournament_id", tournamentId);
if (teamErr) fail("Teams lookup failed:", teamErr);

const teamIdByName = new Map();
const teamNameById = new Map();
for (const t of existingTeams ?? []) {
  teamIdByName.set(t.name.toLowerCase(), t.id);
  teamNameById.set(t.id, t.name);
}
if (!VERIFY) {
  for (const t of TEAMS) {
    if (teamIdByName.has(t.name.toLowerCase())) continue;
    const { data, error } = await supabase
      .from("teams")
      .insert({ tournament_id: tournamentId, name: t.name, color: t.color })
      .select("id, name")
      .single();
    if (error) fail(`Create team "${t.name}" failed:`, error);
    teamIdByName.set(data.name.toLowerCase(), data.id);
    teamNameById.set(data.id, data.name);
    console.log(`+ team ${data.name}`);
  }
}

// 3. Rounds (create missing, keyed by label; read-only in --verify)
const { data: existingRounds, error: roundErr } = await supabase
  .from("tournament_rounds")
  .select("id, label")
  .eq("tournament_id", tournamentId);
if (roundErr) fail("Rounds lookup failed:", roundErr);

const roundIdByLabel = new Map();
const roundLabelById = new Map();
for (const r of existingRounds ?? []) {
  roundIdByLabel.set(r.label.toLowerCase(), r.id);
  roundLabelById.set(r.id, r.label);
}
if (!VERIFY) {
  let roundSort = (existingRounds ?? []).length;
  for (let i = 0; i < ROUNDS.length; i++) {
    const r = ROUNDS[i];
    if (roundIdByLabel.has(r.label.toLowerCase())) continue;
    const { data, error } = await supabase
      .from("tournament_rounds")
      .insert({
        tournament_id: tournamentId,
        label: r.label,
        round_date: r.date,
        status: "scheduled",
        sort_order: roundSort++,
      })
      .select("id, label")
      .single();
    if (error) fail(`Create round "${r.label}" failed:`, error);
    roundIdByLabel.set(data.label.toLowerCase(), data.id);
    roundLabelById.set(data.id, data.label);
    console.log(`+ round ${data.label}`);
  }
}
const roundDateByLabel = new Map(ROUNDS.map((r) => [r.label.toLowerCase(), r.date]));

// Canonical scorer rows for a match, in insert order: home side then away side.
function canonicalScorers(m) {
  const rows = [];
  for (const [scorer, goals] of m.goals?.home ?? []) rows.push({ side: "home", scorer, goals });
  for (const [scorer, goals] of m.goals?.away ?? []) rows.push({ side: "away", scorer, goals });
  return rows;
}

// ---------------------------------------------------------------------------
// --verify: read-only diff of the live DB against the canonical arrays above.
// ---------------------------------------------------------------------------
if (VERIFY) {
  const { data: dbMatches, error: mErr } = await supabase
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: true })
    .order("match_number", { ascending: true });
  if (mErr) fail("Matches lookup failed:", mErr);

  const matchByNumber = new Map((dbMatches ?? []).map((m) => [m.match_number, m]));
  const problems = [];

  if ((dbMatches ?? []).length !== MATCHES.length) {
    problems.push(
      `match count: DB has ${(dbMatches ?? []).length}, canonical has ${MATCHES.length}`
    );
  }

  let scorersById = new Map();
  if ((dbMatches ?? []).length > 0) {
    const { data: scorerRows, error: sErr } = await supabase
      .from("match_scorers")
      .select("*")
      .in("match_id", (dbMatches ?? []).map((m) => m.id))
      .order("sort_order", { ascending: true });
    if (sErr) fail("Scorers lookup failed:", sErr);
    for (const s of scorerRows ?? []) {
      const list = scorersById.get(s.match_id) ?? [];
      list.push(s);
      scorersById.set(s.match_id, list);
    }
  }

  for (const m of MATCHES) {
    const db = matchByNumber.get(m.n);
    const tag = `#${m.n} ${m.home ?? m.homeLabel} vs ${m.away ?? m.awayLabel}`;
    if (!db) {
      problems.push(`${tag}: missing from DB`);
      continue;
    }
    const expect = {
      round: m.round,
      home: m.home ?? null,
      away: m.away ?? null,
      home_label: m.home ? null : m.homeLabel ?? null,
      away_label: m.away ? null : m.awayLabel ?? null,
      date: roundDateByLabel.get(m.round.toLowerCase()) ?? null,
      time: m.time ?? null,
      status: m.status ?? "scheduled",
      hs: m.hs ?? null,
      as: m.as ?? null,
      note: m.note ?? null,
      advanced: m.advanced ?? null,
    };
    const actual = {
      round: db.round_id ? roundLabelById.get(db.round_id) ?? "?" : null,
      home: db.home_team_id ? teamNameById.get(db.home_team_id) ?? "?" : null,
      away: db.away_team_id ? teamNameById.get(db.away_team_id) ?? "?" : null,
      home_label: db.home_team_label,
      away_label: db.away_team_label,
      date: db.match_date,
      time: db.kickoff_time,
      status: db.status,
      hs: db.home_score,
      as: db.away_score,
      note: db.notes,
      advanced: db.advanced_team_id ? teamNameById.get(db.advanced_team_id) ?? "?" : null,
    };
    for (const k of Object.keys(expect)) {
      if (expect[k] !== actual[k]) {
        problems.push(`${tag}: ${k} is ${JSON.stringify(actual[k])}, expected ${JSON.stringify(expect[k])}`);
      }
    }

    const expectScorers = canonicalScorers(m).map((r) => {
      const teamId = r.side === "home"
        ? teamIdByName.get((m.home ?? "").toLowerCase()) ?? null
        : teamIdByName.get((m.away ?? "").toLowerCase()) ?? null;
      return `${teamId ?? "-"}|${r.scorer}|${r.goals}`;
    });
    const actualScorers = (scorersById.get(db.id) ?? []).map(
      (s) => `${s.team_id ?? "-"}|${s.scorer_name}|${s.goals}`
    );
    if (expectScorers.join("\n") !== actualScorers.join("\n")) {
      problems.push(
        `${tag}: scorers differ\n    expected: ${expectScorers.join(", ") || "(none)"}\n    actual:   ${actualScorers.join(", ") || "(none)"}`
      );
    }
  }

  if (problems.length > 0) {
    console.error(`\nDRIFT — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `Verified ${tournament.title}: ${MATCHES.length} matches match the canonical state exactly.`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Seed: clear and rebuild matches (scorers cascade on delete)
// ---------------------------------------------------------------------------

// Preflight: matches.advanced_team_id must exist before we delete anything.
{
  const { error: colErr } = await supabase
    .from("matches")
    .select("advanced_team_id")
    .limit(1);
  if (colErr) {
    fail(
      "matches.advanced_team_id is missing. Apply supabase/migrations/20260731090000_add_match_advanced_team.sql first:",
      colErr
    );
  }
}

const { error: clearErr } = await supabase
  .from("matches")
  .delete()
  .eq("tournament_id", tournamentId);
if (clearErr) fail("Clearing existing matches failed:", clearErr);

// Insert matches + scorers
let inserted = 0;
let goalsInserted = 0;
for (let i = 0; i < MATCHES.length; i++) {
  const m = MATCHES[i];
  const roundId = roundIdByLabel.get(m.round.toLowerCase()) ?? null;
  const homeTeamId = m.home ? teamIdByName.get(m.home.toLowerCase()) ?? null : null;
  const awayTeamId = m.away ? teamIdByName.get(m.away.toLowerCase()) ?? null : null;
  const advancedTeamId = m.advanced
    ? teamIdByName.get(m.advanced.toLowerCase()) ?? null
    : null;
  if (m.advanced && !advancedTeamId) {
    fail(`Match #${m.n}: advanced team "${m.advanced}" not found.`);
  }

  const { data: match, error } = await supabase
    .from("matches")
    .insert({
      tournament_id: tournamentId,
      round_id: roundId,
      match_number: m.n,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_team_label: homeTeamId ? null : m.homeLabel ?? null,
      away_team_label: awayTeamId ? null : m.awayLabel ?? null,
      match_date: roundDateByLabel.get(m.round.toLowerCase()) ?? null,
      kickoff_time: m.time ?? null,
      status: m.status ?? "scheduled",
      home_score: m.hs ?? null,
      away_score: m.as ?? null,
      notes: m.note ?? null,
      advanced_team_id: advancedTeamId,
      sort_order: i,
    })
    .select("id")
    .single();
  if (error) fail(`Insert match #${m.n} failed:`, error);
  inserted++;

  const rows = canonicalScorers(m).map((r, sort) => ({
    match_id: match.id,
    team_id: r.side === "home" ? homeTeamId : awayTeamId,
    scorer_name: r.scorer,
    goals: r.goals,
    sort_order: sort,
  }));
  if (rows.length > 0) {
    const { error: goalErr } = await supabase.from("match_scorers").insert(rows);
    if (goalErr) fail(`Insert scorers for match #${m.n} failed:`, goalErr);
    goalsInserted += rows.length;
  }
}

console.log(
  `\nSeeded ${tournament.title}: ${TEAMS.length} teams, ${inserted} matches, ${goalsInserted} scorer rows.`
);
console.log("Public hub: /events/" + SLUG);
