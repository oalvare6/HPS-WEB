/**
 * Idempotent seed for the World Cup 7v7 league: teams, rounds, the 24 fixtures
 * from the flyer, and last week's (Round 1) results + scorers.
 *
 * Safe to run multiple times — teams/rounds/matches are matched and updated in
 * place rather than duplicated.
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

const TEAM_COLORS = {
  Brazil: "#f7d046",
  USA: "#3b82f6",
  Mexico: "#16a34a",
  Kazakhstan: "#06b6d4",
  Morocco: "#dc2626",
  India: "#f97316",
};

const ROUNDS = [
  { label: "Round 1", date: "2026-06-12" },
  { label: "Round 2", date: "2026-06-19" },
  { label: "Round 3", date: "2026-06-26" },
  { label: "Round 4", date: "2026-06-30" },
  { label: "Round 5", date: "2026-07-02" },
  { label: "Round 6", date: "2026-07-10" },
  { label: "Round 7", date: "2026-07-17" },
  { label: "Semi-Final", date: "2026-07-24" },
  { label: "Final", date: "2026-07-31" },
];

// home/away are team names; homeLabel/awayLabel are placeholders (knockouts).
const FIXTURES = [
  { round: "Round 1", home: "Brazil", away: "USA", time: "7:00 PM" },
  { round: "Round 1", home: "Mexico", away: "Kazakhstan", time: "8:00 PM" },
  { round: "Round 1", home: "Morocco", away: "India", time: "9:00 PM" },

  { round: "Round 2", home: "Brazil", away: "Mexico", time: "7:00 PM" },
  { round: "Round 2", home: "USA", away: "Morocco", time: "8:00 PM" },
  { round: "Round 2", home: "Kazakhstan", away: "India", time: "9:00 PM" },

  { round: "Round 3", home: "Brazil", away: "Morocco", time: "7:00 PM" },
  { round: "Round 3", home: "USA", away: "Kazakhstan", time: "8:00 PM" },
  { round: "Round 3", home: "Mexico", away: "India", time: "9:00 PM" },

  { round: "Round 4", home: "Brazil", away: "Kazakhstan", time: "7:00 PM" },
  { round: "Round 4", home: "USA", away: "India", time: "8:00 PM" },
  { round: "Round 4", home: "Mexico", away: "Morocco", time: "9:00 PM" },

  { round: "Round 5", home: "Brazil", away: "India", time: "7:00 PM" },
  { round: "Round 5", home: "USA", away: "Mexico", time: "8:00 PM" },
  { round: "Round 5", home: "Morocco", away: "Kazakhstan", time: "9:00 PM" },

  { round: "Round 6", home: "Brazil", away: "USA", time: "7:00 PM" },
  { round: "Round 6", home: "Mexico", away: "Morocco", time: "8:00 PM" },
  { round: "Round 6", home: "India", away: "Kazakhstan", time: "9:00 PM" },

  { round: "Round 7", home: "Brazil", away: "Mexico", time: "7:00 PM" },
  { round: "Round 7", home: "India", away: "Kazakhstan", time: "8:00 PM" },
  { round: "Round 7", home: "USA", away: "Morocco", time: "9:00 PM" },

  { round: "Semi-Final", homeLabel: "1st Place", awayLabel: "4th Place", time: "7:00 PM" },
  { round: "Semi-Final", homeLabel: "2nd Place", awayLabel: "3rd Place", time: "8:00 PM" },

  { round: "Final", homeLabel: "Winner SF1", awayLabel: "Winner SF2", time: "7:30 PM" },
];

// Round 1 results the operator reported. Keyed by round + home + away.
const RESULTS = [
  {
    round: "Round 1",
    home: "Brazil",
    away: "USA",
    status: "postponed",
  },
  {
    round: "Round 1",
    home: "Mexico",
    away: "Kazakhstan",
    status: "completed",
    homeScore: 5,
    awayScore: 5,
    scorers: {
      home: [
        { name: "Alejandro", goals: 1 },
        { name: "Jason", goals: 3 },
        { name: "Jesus", goals: 1 },
      ],
      away: [
        { name: "Jacob", goals: 2 },
        { name: "Omar", goals: 1 },
        { name: "Alan", goals: 1 },
        { name: "Jesse", goals: 1 },
      ],
    },
  },
  {
    round: "Round 1",
    home: "Morocco",
    away: "India",
    status: "completed",
    homeScore: 6,
    awayScore: 11,
    scorers: {
      home: [
        { name: "Josh", goals: 4 },
        { name: "JC", goals: 2 },
      ],
      away: [
        { name: "Daniel", goals: 6 },
        { name: "Mahnek", goals: 2 },
        { name: "Gavin", goals: 3 },
      ],
    },
  },
];

function ci(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

async function main() {
  const { data: tournament, error: tErr } = await supabase
    .from("tournaments")
    .select("id, slug, title")
    .eq("slug", SLUG)
    .maybeSingle();
  if (tErr) {
    console.error("Lookup failed:", tErr.message);
    process.exit(1);
  }
  if (!tournament) {
    console.error(`No tournament with slug "${SLUG}".`);
    process.exit(1);
  }
  const tournamentId = tournament.id;
  console.log(`Seeding "${tournament.title}" (${tournamentId})`);

  // --- Teams -----------------------------------------------------------------
  const { data: existingTeams } = await supabase
    .from("teams")
    .select("id, name, color")
    .eq("tournament_id", tournamentId);
  const teamByName = new Map();
  for (const t of existingTeams ?? []) teamByName.set(t.name.toLowerCase(), t);

  for (const name of Object.keys(TEAM_COLORS)) {
    const existing = teamByName.get(name.toLowerCase());
    if (existing) {
      if (!existing.color) {
        await supabase
          .from("teams")
          .update({ color: TEAM_COLORS[name] })
          .eq("id", existing.id);
      }
      continue;
    }
    const { data, error } = await supabase
      .from("teams")
      .insert({ tournament_id: tournamentId, name, color: TEAM_COLORS[name] })
      .select("id, name, color")
      .single();
    if (error) {
      console.error(`Team "${name}" insert failed:`, error.message);
      continue;
    }
    teamByName.set(name.toLowerCase(), data);
    console.log(`  + team ${name}`);
  }
  const teamId = (name) => teamByName.get(name.toLowerCase())?.id ?? null;

  // --- Rounds ----------------------------------------------------------------
  const { data: existingRounds } = await supabase
    .from("tournament_rounds")
    .select("id, label, sort_order")
    .eq("tournament_id", tournamentId);
  const roundByLabel = new Map();
  for (const r of existingRounds ?? [])
    roundByLabel.set(r.label.toLowerCase(), r);

  let roundSort = (existingRounds ?? []).reduce(
    (max, r) => Math.max(max, r.sort_order ?? 0),
    -1
  );
  for (const r of ROUNDS) {
    const existing = roundByLabel.get(r.label.toLowerCase());
    if (existing) {
      await supabase
        .from("tournament_rounds")
        .update({ round_date: r.date, status: "scheduled" })
        .eq("id", existing.id);
      continue;
    }
    roundSort += 1;
    const { data, error } = await supabase
      .from("tournament_rounds")
      .insert({
        tournament_id: tournamentId,
        label: r.label,
        round_date: r.date,
        status: "scheduled",
        sort_order: roundSort,
      })
      .select("id, label")
      .single();
    if (error) {
      console.error(`Round "${r.label}" insert failed:`, error.message);
      continue;
    }
    roundByLabel.set(r.label.toLowerCase(), data);
    console.log(`  + round ${r.label}`);
  }
  const roundId = (label) => roundByLabel.get(label.toLowerCase())?.id ?? null;

  // --- Matches ---------------------------------------------------------------
  const { data: existingMatches } = await supabase
    .from("matches")
    .select(
      "id, round_id, home_team_id, away_team_id, home_team_label, away_team_label"
    )
    .eq("tournament_id", tournamentId);

  function findMatch(fx) {
    const rid = roundId(fx.round);
    const hid = fx.home ? teamId(fx.home) : null;
    const aid = fx.away ? teamId(fx.away) : null;
    return (existingMatches ?? []).find((m) => {
      if (m.round_id !== rid) return false;
      const homeMatch = hid
        ? m.home_team_id === hid
        : fx.homeLabel && ci(m.home_team_label ?? "", fx.homeLabel);
      const awayMatch = aid
        ? m.away_team_id === aid
        : fx.awayLabel && ci(m.away_team_label ?? "", fx.awayLabel);
      return homeMatch && awayMatch;
    });
  }

  const matchIdByKey = new Map();
  let order = 0;
  for (const fx of FIXTURES) {
    const rid = roundId(fx.round);
    const payload = {
      tournament_id: tournamentId,
      round_id: rid,
      home_team_id: fx.home ? teamId(fx.home) : null,
      away_team_id: fx.away ? teamId(fx.away) : null,
      home_team_label: fx.home ? null : fx.homeLabel ?? null,
      away_team_label: fx.away ? null : fx.awayLabel ?? null,
      kickoff_time: fx.time ?? null,
      status: "scheduled",
      sort_order: order,
    };
    order += 1;

    const existing = findMatch(fx);
    let id;
    if (existing) {
      id = existing.id;
      await supabase
        .from("matches")
        .update({ kickoff_time: payload.kickoff_time, sort_order: payload.sort_order })
        .eq("id", id);
    } else {
      const { data, error } = await supabase
        .from("matches")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        console.error(`Match ${fx.round} ${fx.home ?? fx.homeLabel} insert failed:`, error.message);
        continue;
      }
      id = data.id;
      console.log(
        `  + match ${fx.round}: ${fx.home ?? fx.homeLabel} vs ${fx.away ?? fx.awayLabel}`
      );
    }
    const key = `${fx.round}|${fx.home ?? fx.homeLabel}|${fx.away ?? fx.awayLabel}`;
    matchIdByKey.set(key, id);
  }

  // --- Round 1 results + scorers ---------------------------------------------
  for (const res of RESULTS) {
    const key = `${res.round}|${res.home}|${res.away}`;
    const matchId = matchIdByKey.get(key);
    if (!matchId) {
      console.error(`Result target not found: ${key}`);
      continue;
    }
    await supabase
      .from("matches")
      .update({
        status: res.status,
        home_score: res.homeScore ?? null,
        away_score: res.awayScore ?? null,
      })
      .eq("id", matchId);

    // Reset scorers for this match so re-running stays idempotent.
    await supabase.from("match_scorers").delete().eq("match_id", matchId);

    if (res.scorers) {
      const rows = [];
      for (const s of res.scorers.home ?? []) {
        rows.push({
          match_id: matchId,
          team_id: teamId(res.home),
          scorer_name: s.name,
          goals: s.goals,
        });
      }
      for (const s of res.scorers.away ?? []) {
        rows.push({
          match_id: matchId,
          team_id: teamId(res.away),
          scorer_name: s.name,
          goals: s.goals,
        });
      }
      if (rows.length > 0) {
        const { error } = await supabase.from("match_scorers").insert(rows);
        if (error) console.error(`Scorers for ${key} failed:`, error.message);
      }
    }
    console.log(
      `  = result ${key}: ${res.status}${
        res.homeScore != null ? ` ${res.homeScore}-${res.awayScore}` : ""
      }`
    );
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
