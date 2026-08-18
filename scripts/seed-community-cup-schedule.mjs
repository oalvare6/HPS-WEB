/**
 * Seed the Community Cup Round 1 fixtures (Friday August 21, 2026).
 *
 * The event page only draws its schedule when `matches` has rows for the
 * tournament (`hasHub` in src/app/events/[slug]/page.tsx). Until this ran the
 * Community Cup had six teams, an open registration form, and no answer at all
 * to "what time do I play?" — the section simply wasn't rendered.
 *
 * Idempotent, and non-destructive on purpose. The World Cup seeder next door
 * clears every match for its tournament and rebuilds from the file; that is
 * safe there because the file carries the scores too. Here it would not be:
 * the owner enters results from /admin/tournaments/[id]/edit, so a re-run of a
 * delete-and-rebuild seeder would wipe a night of scores. Instead matches are
 * keyed by `match_number` within the tournament and only *missing* ones are
 * inserted. Re-running restores a deleted fixture and touches nothing else.
 *
 * Teams are looked up by name and never created. They are the operator's list,
 * shown in the /register team picker and attached to real registrations; a
 * typo here should stop the script, not quietly add a seventh team nobody can
 * pick. A missing name fails with the list of what does exist.
 *
 * Run: node --env-file=.env.local scripts/seed-community-cup-schedule.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const SLUG = "community-cup-fall-2026";

const ROUNDS = [
  {
    label: "Round 1",
    date: "2026-08-21",
    // The window the field is booked for, not the first kickoff: last game is
    // 9:10 PM and runs two 25-minute halves plus the 5-minute interval.
    time_start: "7:00 PM",
    time_end: "10:05 PM",
  },
];

// Kickoffs are 65 minutes apart: 25 + 5 + 25 of football, then 10 to clear the
// field and get the next two teams on it.
const MATCHES = [
  { n: 1, round: "Round 1", time: "7:00 PM", home: "Bellaire FC", away: "Hiram Clarke FC" },
  { n: 2, round: "Round 1", time: "8:05 PM", home: "Post Oak FC", away: "3rd Ward FC" },
  { n: 3, round: "Round 1", time: "9:10 PM", home: "Townwood FC", away: "Sunnyside FC" },
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

// 2. Teams — resolved, never created. See the header note.
const { data: existingTeams, error: teamErr } = await supabase
  .from("teams")
  .select("id, name")
  .eq("tournament_id", tournamentId);
if (teamErr) fail("Teams lookup failed:", teamErr);

const teamIdByName = new Map(
  (existingTeams ?? []).map((t) => [t.name.toLowerCase(), t.id])
);
const wanted = new Set(MATCHES.flatMap((m) => [m.home, m.away]).filter(Boolean));
const missing = [...wanted].filter((n) => !teamIdByName.has(n.toLowerCase()));
if (missing.length > 0) {
  fail(
    `Missing team(s) on ${tournament.title}: ${missing.join(", ")}.\n` +
      `Teams that do exist: ${(existingTeams ?? []).map((t) => t.name).join(", ") || "(none)"}.\n` +
      `Add them in /admin/tournaments/${tournamentId}/edit, then re-run.`
  );
}

// 3. Rounds (create missing, keyed by label — an existing round is left alone)
const { data: existingRounds, error: roundErr } = await supabase
  .from("tournament_rounds")
  .select("id, label")
  .eq("tournament_id", tournamentId);
if (roundErr) fail("Rounds lookup failed:", roundErr);

const roundIdByLabel = new Map(
  (existingRounds ?? []).map((r) => [r.label.toLowerCase(), r.id])
);
let roundSort = (existingRounds ?? []).length;
for (const r of ROUNDS) {
  if (roundIdByLabel.has(r.label.toLowerCase())) continue;
  const { data, error } = await supabase
    .from("tournament_rounds")
    .insert({
      tournament_id: tournamentId,
      label: r.label,
      round_date: r.date,
      time_start: r.time_start ?? null,
      time_end: r.time_end ?? null,
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

// 4. Matches — insert only what is missing, keyed by match_number.
const { data: existingMatches, error: matchErr } = await supabase
  .from("matches")
  .select("id, match_number")
  .eq("tournament_id", tournamentId);
if (matchErr) fail("Matches lookup failed:", matchErr);
const haveNumbers = new Set(
  (existingMatches ?? []).map((m) => m.match_number).filter((n) => n != null)
);

let inserted = 0;
let skipped = 0;
for (let i = 0; i < MATCHES.length; i++) {
  const m = MATCHES[i];
  if (haveNumbers.has(m.n)) {
    skipped++;
    continue;
  }
  const roundKey = m.round.toLowerCase();
  const homeTeamId = m.home ? teamIdByName.get(m.home.toLowerCase()) ?? null : null;
  const awayTeamId = m.away ? teamIdByName.get(m.away.toLowerCase()) ?? null : null;

  const { error } = await supabase.from("matches").insert({
    tournament_id: tournamentId,
    round_id: roundIdByLabel.get(roundKey) ?? null,
    match_number: m.n,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home_team_label: homeTeamId ? null : m.homeLabel ?? null,
    away_team_label: awayTeamId ? null : m.awayLabel ?? null,
    match_date: roundDateByLabel.get(roundKey) ?? null,
    kickoff_time: m.time ?? null,
    status: m.status ?? "scheduled",
    notes: m.note ?? null,
    sort_order: i,
  });
  if (error) fail(`Insert match #${m.n} failed:`, error);
  inserted++;
  console.log(`+ match #${m.n} ${m.home ?? m.homeLabel} vs ${m.away ?? m.awayLabel} @ ${m.time}`);
}

console.log(
  `\n${tournament.title}: ${inserted} match(es) inserted, ${skipped} already present.`
);
console.log("Public schedule: /events/" + SLUG);
