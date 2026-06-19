import { supabaseAdmin } from "@/lib/supabase-admin";
import { TOURNAMENTS_LOAD_USER_MESSAGE } from "@/lib/tournaments";
import type {
  Match,
  MatchScorer,
  MatchWithDetails,
  StandingRow,
  TopScorerRow,
} from "@/lib/types";

export type LeagueTeam = {
  id: string;
  name: string;
  color: string | null;
};

export type TournamentLeague = {
  teams: LeagueTeam[];
  matches: MatchWithDetails[];
  standings: StandingRow[];
  topScorers: TopScorerRow[];
  /** True when there is anything worth rendering (teams or matches). */
  hasData: boolean;
  loadError: string | null;
};

const EMPTY_LEAGUE: TournamentLeague = {
  teams: [],
  matches: [],
  standings: [],
  topScorers: [],
  hasData: false,
  loadError: null,
};

type RawMatch = Match & { scorers?: MatchScorer[] | null };

function sortScorers(a: MatchScorer, b: MatchScorer): number {
  if (b.goals !== a.goals) return b.goals - a.goals;
  return a.scorer_name.localeCompare(b.scorer_name);
}

/**
 * Enrich raw match rows with resolved team names/colors and sorted scorers,
 * preserving the DB ordering (sort_order, match_date).
 */
function enrichMatches(
  rawMatches: RawMatch[],
  teamMap: Map<string, LeagueTeam>
): MatchWithDetails[] {
  return rawMatches.map((m) => {
    const home = m.home_team_id ? teamMap.get(m.home_team_id) : undefined;
    const away = m.away_team_id ? teamMap.get(m.away_team_id) : undefined;
    const scorers = [...(m.scorers ?? [])].sort(sortScorers);
    const { scorers: _ignored, ...rest } = m;
    void _ignored;
    return {
      ...rest,
      home_team_name: home?.name ?? m.home_team_label ?? null,
      away_team_name: away?.name ?? m.away_team_label ?? null,
      home_team_color: home?.color ?? null,
      away_team_color: away?.color ?? null,
      scorers,
    };
  });
}

/**
 * Build the standings table from completed matches that have two real teams.
 * Points: win 3, draw 1, loss 0. Sorted by points, goal difference, goals for,
 * then name.
 */
export function computeStandings(
  teams: LeagueTeam[],
  matches: MatchWithDetails[]
): StandingRow[] {
  const table = new Map<string, StandingRow>();
  for (const t of teams) {
    table.set(t.id, {
      team_id: t.id,
      team_name: t.name,
      team_color: t.color,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      points: 0,
    });
  }

  for (const m of matches) {
    if (m.status !== "completed") continue;
    if (!m.home_team_id || !m.away_team_id) continue;
    if (m.home_score == null || m.away_score == null) continue;
    const home = table.get(m.home_team_id);
    const away = table.get(m.away_team_id);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goals_for += m.home_score;
    home.goals_against += m.away_score;
    away.goals_for += m.away_score;
    away.goals_against += m.home_score;

    if (m.home_score > m.away_score) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (m.home_score < m.away_score) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const rows = [...table.values()];
  for (const r of rows) {
    r.goal_difference = r.goals_for - r.goals_against;
  }
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goal_difference !== a.goal_difference)
      return b.goal_difference - a.goal_difference;
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
    return a.team_name.localeCompare(b.team_name);
  });
  return rows;
}

/**
 * Aggregate scorers across all matches into a Golden Boot leaderboard. Keyed by
 * (team, lower-cased name) so the same first name on two teams stays distinct.
 */
export function computeTopScorers(
  teams: LeagueTeam[],
  matches: MatchWithDetails[]
): TopScorerRow[] {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const tally = new Map<string, TopScorerRow>();

  for (const m of matches) {
    for (const s of m.scorers) {
      const name = s.scorer_name.trim();
      if (!name) continue;
      const team = s.team_id ? teamMap.get(s.team_id) : undefined;
      const key = `${s.team_id ?? "none"}::${name.toLowerCase()}`;
      const existing = tally.get(key);
      if (existing) {
        existing.goals += s.goals;
      } else {
        tally.set(key, {
          scorer_name: name,
          team_id: s.team_id,
          team_name: team?.name ?? null,
          team_color: team?.color ?? null,
          goals: s.goals,
        });
      }
    }
  }

  const rows = [...tally.values()];
  rows.sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.scorer_name.localeCompare(b.scorer_name);
  });
  return rows;
}

/**
 * Load the full league view for a tournament: teams, matches (with scorers),
 * the computed standings, and the top-scorers leaderboard. Returns an empty
 * league (not an error) when there's simply no data yet.
 */
export async function getTournamentLeague(
  tournamentId: string
): Promise<TournamentLeague> {
  try {
    const [teamsRes, matchesRes] = await Promise.all([
      supabaseAdmin
        .from("teams")
        .select("id, name, color")
        .eq("tournament_id", tournamentId)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("matches")
        .select("*, scorers:match_scorers(*)")
        .eq("tournament_id", tournamentId)
        .order("sort_order", { ascending: true })
        .order("match_date", { ascending: true }),
    ]);

    if (teamsRes.error) {
      console.error("[matches] teams fetch failed:", teamsRes.error.message);
      return { ...EMPTY_LEAGUE, loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    if (matchesRes.error) {
      console.error("[matches] matches fetch failed:", matchesRes.error.message);
      return { ...EMPTY_LEAGUE, loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }

    const teams = (teamsRes.data ?? []) as LeagueTeam[];
    const teamMap = new Map(teams.map((t) => [t.id, t]));
    const matches = enrichMatches(
      (matchesRes.data ?? []) as RawMatch[],
      teamMap
    );
    const standings = computeStandings(teams, matches);
    const topScorers = computeTopScorers(teams, matches);

    return {
      teams,
      matches,
      standings,
      topScorers,
      hasData: teams.length > 0 || matches.length > 0,
      loadError: null,
    };
  } catch (err) {
    console.error("[matches] league fetch failed:", err);
    return { ...EMPTY_LEAGUE, loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
  }
}
