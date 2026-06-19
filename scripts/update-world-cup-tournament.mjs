/**
 * One-shot: sync World Cup tournament row, teams, schedule, and Round 1
 * results with the real flyer (6-team single round-robin, Jun 12 - Jul 31).
 * Replaces the stale "16 teams, Group A/B" seed.
 *
 * Run: node --env-file=.env.local scripts/update-world-cup-tournament.mjs
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
const FLYER_PATH = "/tournaments/world-cup-2026-flyer.png";

const DESCRIPTION = `Compete. Unite. Win.

$960 per team · Max 12 players per roster
Ages: High school boys - adults

6 nations, one trophy: Brazil, USA, Mexico, Kazakhstan, Morocco, and India
play a single round-robin from June 12 through July 17. The top 4 advance
to a Semi-Final on July 24, then the Final on July 31 at 7:30 PM.

Kickoffs are 7:00 / 8:00 / 9:00 PM most rounds.

Assemble your team. Bring your best. Chase the championship.`;

const patch = {
  title: "World Cup 7v7 Soccer Tournament",
  description: DESCRIPTION,
  format: "Adult 7v7",
  status: "ongoing",
  start_date: "2026-06-12T00:00:00.000Z",
  end_date: "2026-07-31T00:00:00.000Z",
  time_start: "7:00 PM",
  time_end: "9:00 PM",
  recurrence: "Weekly, mostly Fridays",
  location: "14062 Ambrose St, Houston TX",
  max_teams: 6,
  registration_open: false,
  payments_open: false,
  is_featured: true,
  display_order: 0,
  image_url: FLYER_PATH,
  image_preset: null,
  drop_in_fee_cents: 0,
  entry_fee: null,
  entry_fee_cents: null,
};

const TEAMS = [
  { name: "Brazil", color: "#009C3B" },
  { name: "USA", color: "#3C3B6E" },
  { name: "Mexico", color: "#006847" },
  { name: "Kazakhstan", color: "#00AFCA" },
  { name: "Morocco", color: "#C1272D" },
  { name: "India", color: "#FF9933" },
];

// label, round_date, time_start, time_end
const ROUNDS = [
  { label: "Round 1", round_date: "2026-06-12", time_start: "7:00 PM", time_end: "9:00 PM" },
  { label: "Round 2", round_date: "2026-06-19", time_start: "7:00 PM", time_end: "9:00 PM" },
  { label: "Round 3", round_date: "2026-06-26", time_start: "7:00 PM", time_end: "9:00 PM" },
  { label: "Round 4", round_date: "2026-06-30", time_start: "7:00 PM", time_end: "9:00 PM" },
  { label: "Round 5", round_date: "2026-07-02", time_start: "7:00 PM", time_end: "9:00 PM" },
  { label: "Round 6", round_date: "2026-07-10", time_start: "7:00 PM", time_end: "9:00 PM" },
  { label: "Round 7", round_date: "2026-07-17", time_start: "7:00 PM", time_end: "9:00 PM" },
  { label: "Semi-Final", round_date: "2026-07-24", time_start: "7:00 PM", time_end: "8:00 PM" },
  { label: "Final", round_date: "2026-07-31", time_start: "7:30 PM", time_end: "7:30 PM" },
];

// Group-stage fixtures, in flyer order. roundLabel ties each game to a
// ROUNDS entry above so we can attach the right round_id.
const FIXTURES = [
  // Round 1
  { roundLabel: "Round 1", date: "2026-06-12", time: "7:00 PM", home: "Brazil", away: "USA" },
  { roundLabel: "Round 1", date: "2026-06-12", time: "8:00 PM", home: "Mexico", away: "Kazakhstan" },
  { roundLabel: "Round 1", date: "2026-06-12", time: "9:00 PM", home: "Morocco", away: "India" },
  // Round 2
  { roundLabel: "Round 2", date: "2026-06-19", time: "7:00 PM", home: "Brazil", away: "Mexico" },
  { roundLabel: "Round 2", date: "2026-06-19", time: "8:00 PM", home: "USA", away: "Morocco" },
  { roundLabel: "Round 2", date: "2026-06-19", time: "9:00 PM", home: "Kazakhstan", away: "India" },
  // Round 3
  { roundLabel: "Round 3", date: "2026-06-26", time: "7:00 PM", home: "Brazil", away: "Morocco" },
  { roundLabel: "Round 3", date: "2026-06-26", time: "8:00 PM", home: "USA", away: "Kazakhstan" },
  { roundLabel: "Round 3", date: "2026-06-26", time: "9:00 PM", home: "Mexico", away: "India" },
  // Round 4 (Tuesday, around the July 4th week)
  { roundLabel: "Round 4", date: "2026-06-30", time: "7:00 PM", home: "Brazil", away: "Kazakhstan" },
  { roundLabel: "Round 4", date: "2026-06-30", time: "8:00 PM", home: "USA", away: "India" },
  { roundLabel: "Round 4", date: "2026-06-30", time: "9:00 PM", home: "Mexico", away: "Morocco" },
  // Round 5 (Thursday, around the July 4th week)
  { roundLabel: "Round 5", date: "2026-07-02", time: "7:00 PM", home: "Brazil", away: "India" },
  { roundLabel: "Round 5", date: "2026-07-02", time: "8:00 PM", home: "USA", away: "Mexico" },
  { roundLabel: "Round 5", date: "2026-07-02", time: "9:00 PM", home: "Morocco", away: "Kazakhstan" },
  // Round 6
  { roundLabel: "Round 6", date: "2026-07-10", time: "7:00 PM", home: "Brazil", away: "USA" },
  { roundLabel: "Round 6", date: "2026-07-10", time: "8:00 PM", home: "Mexico", away: "Morocco" },
  { roundLabel: "Round 6", date: "2026-07-10", time: "9:00 PM", home: "India", away: "Kazakhstan" },
  // Round 7
  { roundLabel: "Round 7", date: "2026-07-17", time: "7:00 PM", home: "Brazil", away: "Mexico" },
  { roundLabel: "Round 7", date: "2026-07-17", time: "8:00 PM", home: "India", away: "Kazakhstan" },
  { roundLabel: "Round 7", date: "2026-07-17", time: "9:00 PM", home: "USA", away: "Morocco" },
];

// Round 1 results reported by the operator.
const ROUND1_RESULTS = {
  "Brazil-USA": { status: "postponed", notes: "Postponed — will be rescheduled." },
  "Mexico-Kazakhstan": {
    status: "final",
    home_score: 5,
    away_score: 5,
    goals: [
      { team: "Mexico", player_name: "Alejandro", goals: 1 },
      { team: "Mexico", player_name: "Jason", goals: 3 },
      { team: "Mexico", player_name: "Jesus", goals: 1 },
      { team: "Kazakhstan", player_name: "Jacob", goals: 2 },
      { team: "Kazakhstan", player_name: "Omar", goals: 1 },
      { team: "Kazakhstan", player_name: "Alan", goals: 1 },
      { team: "Kazakhstan", player_name: "Jesse", goals: 1 },
    ],
  },
  "Morocco-India": {
    status: "final",
    home_score: 6,
    away_score: 11,
    goals: [
      { team: "India", player_name: "Daniel", goals: 6 },
      { team: "India", player_name: "Mahnek", goals: 2 },
      { team: "India", player_name: "Gavin", goals: 3 },
      { team: "Morocco", player_name: "Josh", goals: 4 },
      { team: "Morocco", player_name: "JC", goals: 2 },
    ],
  },
};

async function main() {
  const { data: tournament, error: findErr } = await supabase
    .from("tournaments")
    .select("id, slug, title")
    .eq("slug", SLUG)
    .maybeSingle();
  if (findErr) {
    console.error("Lookup failed:", findErr.message);
    process.exit(1);
  }
  if (!tournament) {
    console.error(`No tournament with slug "${SLUG}". Create it in admin first or fix the slug.`);
    process.exit(1);
  }
  const tournamentId = tournament.id;

  const { data: updated, error: updateErr } = await supabase
    .from("tournaments")
    .update(patch)
    .eq("id", tournamentId)
    .select("id, title, slug, start_date, end_date, max_teams")
    .single();
  if (updateErr) {
    console.error("Tournament update failed:", updateErr.message);
    process.exit(1);
  }
  console.log("Updated tournament:", JSON.stringify(updated, null, 2));

  // --- Teams: create any that don't already exist (by case-insensitive name) ---
  const { data: existingTeams, error: teamsFetchErr } = await supabase
    .from("teams")
    .select("id, name")
    .eq("tournament_id", tournamentId);
  if (teamsFetchErr) {
    console.error("Teams fetch failed:", teamsFetchErr.message);
    process.exit(1);
  }
  const teamIdByName = new Map(
    (existingTeams ?? []).map((t) => [t.name.toLowerCase(), t.id])
  );
  for (const t of TEAMS) {
    if (teamIdByName.has(t.name.toLowerCase())) continue;
    const { data: inserted, error: insErr } = await supabase
      .from("teams")
      .insert({ tournament_id: tournamentId, name: t.name, color: t.color })
      .select("id, name")
      .single();
    if (insErr) {
      console.error(`Insert team "${t.name}" failed:`, insErr.message);
      process.exit(1);
    }
    teamIdByName.set(t.name.toLowerCase(), inserted.id);
  }
  console.log(`Teams ready: ${TEAMS.map((t) => t.name).join(", ")}`);

  // --- Rounds: wipe and reseed this tournament's schedule ---
  const { error: delRoundsErr } = await supabase
    .from("tournament_rounds")
    .delete()
    .eq("tournament_id", tournamentId);
  if (delRoundsErr) {
    console.error("Clearing old rounds failed:", delRoundsErr.message);
    process.exit(1);
  }
  const roundIdByLabel = new Map();
  for (const [i, r] of ROUNDS.entries()) {
    const { data: inserted, error: insErr } = await supabase
      .from("tournament_rounds")
      .insert({
        tournament_id: tournamentId,
        label: r.label,
        round_date: r.round_date,
        time_start: r.time_start,
        time_end: r.time_end,
        status: "scheduled",
        sort_order: i,
      })
      .select("id, label")
      .single();
    if (insErr) {
      console.error(`Insert round "${r.label}" failed:`, insErr.message);
      process.exit(1);
    }
    roundIdByLabel.set(inserted.label, inserted.id);
  }
  console.log(`Rounds reseeded: ${ROUNDS.length} entries`);

  // --- Matches: wipe and reseed group-stage fixtures (cascades match_goals) ---
  const { error: delMatchesErr } = await supabase
    .from("tournament_matches")
    .delete()
    .eq("tournament_id", tournamentId);
  if (delMatchesErr) {
    console.error("Clearing old matches failed:", delMatchesErr.message);
    process.exit(1);
  }

  for (const [i, f] of FIXTURES.entries()) {
    const homeId = teamIdByName.get(f.home.toLowerCase());
    const awayId = teamIdByName.get(f.away.toLowerCase());
    const resultKey = `${f.home}-${f.away}`;
    const result = ROUND1_RESULTS[resultKey];

    const row = {
      tournament_id: tournamentId,
      round_id: roundIdByLabel.get(f.roundLabel) ?? null,
      stage: "group",
      match_date: f.date,
      kickoff_time: f.time,
      home_team_id: homeId,
      away_team_id: awayId,
      home_score: result?.home_score ?? null,
      away_score: result?.away_score ?? null,
      status: result?.status ?? "scheduled",
      notes: result?.notes ?? null,
      sort_order: i,
    };
    const { data: match, error: matchErr } = await supabase
      .from("tournament_matches")
      .insert(row)
      .select("id")
      .single();
    if (matchErr) {
      console.error(`Insert match "${f.home} vs ${f.away}" failed:`, matchErr.message);
      process.exit(1);
    }

    if (result?.goals?.length) {
      const goalRows = result.goals.map((g) => ({
        match_id: match.id,
        team_id: teamIdByName.get(g.team.toLowerCase()),
        player_name: g.player_name,
        goals: g.goals,
      }));
      const { error: goalsErr } = await supabase.from("match_goals").insert(goalRows);
      if (goalsErr) {
        console.error(`Insert goals for "${f.home} vs ${f.away}" failed:`, goalsErr.message);
        process.exit(1);
      }
    }
  }
  console.log(`Matches reseeded: ${FIXTURES.length} group-stage fixtures`);
  console.log("Round 1 results + goal scorers seeded.");
  console.log("Done. Semi-Final and Final stay schedule-only (tournament_rounds) until teams qualify.");
}

main();
