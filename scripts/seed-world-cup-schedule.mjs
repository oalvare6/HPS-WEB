/**
 * One-shot: seed the World Cup 7v7 teams, the full 24-match schedule from the
 * tournament flyer, and Rounds 1-5 results (scores + scorers). Rounds 1 and 4
 * each have one postponed fixture (matches #1 and #10).
 *
 * Idempotent: teams/rounds are matched by name/label (created only if missing),
 * and the tournament's matches + goals are cleared and rebuilt on every run, so
 * re-running restores the canonical bracket. After seeding, the client manages
 * everything from /admin/tournaments/[id]/edit.
 *
 * Run: node --env-file=.env.local scripts/seed-world-cup-schedule.mjs
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
const MATCHES = [
  // Round 1 — Friday June 12
  {
    n: 1,
    round: "Round 1",
    time: "7:00 PM",
    home: "Brazil",
    away: "USA",
    status: "postponed",
    note: "Make up July 14",
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
      away: [["Jacob", 2], ["Omar", 1], ["Alan", 1], ["Jesse", 1]],
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
      away: [["Daniel", 6], ["Mahnek", 2], ["Gavin", 3]],
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
      away: [["Alejandro", 2], ["Sergio", 1]],
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
      home: [["Will", 1], ["Evan", 2], ["Jason", 2]],
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
      away: [["Daniel", 2], ["Mahnek", 1], ["Flyin", 2]],
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
      away: [["Kelvin", 3], ["William", 2], ["Edgar", 2]],
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
      home: [["CarlosC", 6]],
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
    as: 3,
    goals: {
      home: [["#3", 1]],
      away: [["Mahnek", 1], ["Shiv", 1], ["Gavin", 1]],
    },
  },

  // Round 4 — Tuesday June 30
  {
    n: 10,
    round: "Round 4",
    time: "7:00 PM",
    home: "Brazil",
    away: "Kazakhstan",
    status: "postponed",
    note: "Make up Tue July 7 @ 7pm",
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
      away: [["Mahnek", 4], ["Daniel", 1], ["Gavin", 2]],
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
      home: [["Alejandro", 1], ["Emir", 2], ["Chris", 1]],
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
      home: [["Ethan", 3], ["Abu", 3], ["Alex", 1], ["Eidhan", 1]],
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
  { n: 16, round: "Round 6", time: "7:00 PM", home: "Brazil", away: "USA" },
  { n: 17, round: "Round 6", time: "8:00 PM", home: "Mexico", away: "Morocco" },
  { n: 18, round: "Round 6", time: "9:00 PM", home: "India", away: "Kazakhstan" },

  // Round 7 — Friday July 17
  { n: 19, round: "Round 7", time: "7:00 PM", home: "Brazil", away: "Mexico" },
  { n: 20, round: "Round 7", time: "8:00 PM", home: "India", away: "Kazakhstan" },
  { n: 21, round: "Round 7", time: "9:00 PM", home: "USA", away: "Morocco" },

  // Semi-Finals — Friday July 24
  {
    n: 22,
    round: "Semi-Finals",
    time: "7:00 PM",
    homeLabel: "1st Place",
    awayLabel: "4th Place",
  },
  {
    n: 23,
    round: "Semi-Finals",
    time: "8:00 PM",
    homeLabel: "2nd Place",
    awayLabel: "3rd Place",
  },

  // Final — Friday July 31
  {
    n: 24,
    round: "Final",
    time: "7:30 PM",
    homeLabel: "Winner SF1",
    awayLabel: "Winner SF2",
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

// 2. Teams (create missing, keyed case-insensitively by name)
const { data: existingTeams, error: teamErr } = await supabase
  .from("teams")
  .select("id, name")
  .eq("tournament_id", tournamentId);
if (teamErr) fail("Teams lookup failed:", teamErr);

const teamIdByName = new Map();
for (const t of existingTeams ?? []) {
  teamIdByName.set(t.name.toLowerCase(), t.id);
}
for (const t of TEAMS) {
  if (teamIdByName.has(t.name.toLowerCase())) continue;
  const { data, error } = await supabase
    .from("teams")
    .insert({ tournament_id: tournamentId, name: t.name, color: t.color })
    .select("id, name")
    .single();
  if (error) fail(`Create team "${t.name}" failed:`, error);
  teamIdByName.set(data.name.toLowerCase(), data.id);
  console.log(`+ team ${data.name}`);
}

// 3. Rounds (create missing, keyed by label)
const { data: existingRounds, error: roundErr } = await supabase
  .from("tournament_rounds")
  .select("id, label")
  .eq("tournament_id", tournamentId);
if (roundErr) fail("Rounds lookup failed:", roundErr);

const roundIdByLabel = new Map();
for (const r of existingRounds ?? []) {
  roundIdByLabel.set(r.label.toLowerCase(), r.id);
}
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
  console.log(`+ round ${data.label}`);
}
const roundDateByLabel = new Map(ROUNDS.map((r) => [r.label.toLowerCase(), r.date]));

// 4. Clear and rebuild matches (scorers cascade on delete)
const { error: clearErr } = await supabase
  .from("matches")
  .delete()
  .eq("tournament_id", tournamentId);
if (clearErr) fail("Clearing existing matches failed:", clearErr);

// 5. Insert matches + scorers
let inserted = 0;
let goalsInserted = 0;
for (let i = 0; i < MATCHES.length; i++) {
  const m = MATCHES[i];
  const roundId = roundIdByLabel.get(m.round.toLowerCase()) ?? null;
  const homeTeamId = m.home ? teamIdByName.get(m.home.toLowerCase()) ?? null : null;
  const awayTeamId = m.away ? teamIdByName.get(m.away.toLowerCase()) ?? null : null;

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
      sort_order: i,
    })
    .select("id")
    .single();
  if (error) fail(`Insert match #${m.n} failed:`, error);
  inserted++;

  if (m.goals) {
    const rows = [];
    let sort = 0;
    for (const [scorer, goals] of m.goals.home ?? []) {
      rows.push({
        match_id: match.id,
        team_id: homeTeamId,
        scorer_name: scorer,
        goals,
        sort_order: sort++,
      });
    }
    for (const [scorer, goals] of m.goals.away ?? []) {
      rows.push({
        match_id: match.id,
        team_id: awayTeamId,
        scorer_name: scorer,
        goals,
        sort_order: sort++,
      });
    }
    if (rows.length > 0) {
      const { error: goalErr } = await supabase.from("match_scorers").insert(rows);
      if (goalErr) fail(`Insert scorers for match #${m.n} failed:`, goalErr);
      goalsInserted += rows.length;
    }
  }
}

console.log(
  `\nSeeded ${tournament.title}: ${TEAMS.length} teams, ${inserted} matches, ${goalsInserted} scorer rows.`
);
console.log("Public hub: /events/" + SLUG);
