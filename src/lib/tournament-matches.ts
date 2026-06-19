import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  MatchGoal,
  StandingsRow,
  TopScorerRow,
  TournamentMatchWithDetail,
} from "@/lib/types";

export type TournamentMatchesResult = {
  matches: TournamentMatchWithDetail[];
  loadError: string | null;
};

type RawTeamRef = { id: string; name: string; color: string | null } | null;

type RawMatchRow = {
  id: string;
  tournament_id: string;
  round_id: string | null;
  stage: TournamentMatchWithDetail["stage"];
  match_date: string | null;
  kickoff_time: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: TournamentMatchWithDetail["status"];
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  home_team: RawTeamRef;
  away_team: RawTeamRef;
  goals: MatchGoal[] | null;
};

/**
 * All matches for a tournament, newest round first, with team names/colors
 * and goal-scorer lines hydrated. Used by the public results section and
 * standings/top-scorers computation below.
 */
export async function getTournamentMatches(
  tournamentId: string
): Promise<TournamentMatchesResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournament_matches")
      .select(
        `*,
         home_team:teams!tournament_matches_home_team_id_fkey ( id, name, color ),
         away_team:teams!tournament_matches_away_team_id_fkey ( id, name, color ),
         goals:match_goals ( * )`
      )
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true })
      .order("match_date", { ascending: true });

    if (error) {
      console.error("[tournament_matches] fetch failed:", error.message, error);
      return { matches: [], loadError: "Couldn't load match results." };
    }

    const matches = ((data ?? []) as unknown as RawMatchRow[]).map(
      (row): TournamentMatchWithDetail => ({
        id: row.id,
        tournament_id: row.tournament_id,
        round_id: row.round_id,
        stage: row.stage,
        match_date: row.match_date,
        kickoff_time: row.kickoff_time,
        home_team_id: row.home_team_id,
        away_team_id: row.away_team_id,
        home_score: row.home_score,
        away_score: row.away_score,
        status: row.status,
        notes: row.notes,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
        home_team_name: row.home_team?.name ?? "TBD",
        home_team_color: row.home_team?.color ?? null,
        away_team_name: row.away_team?.name ?? "TBD",
        away_team_color: row.away_team?.color ?? null,
        goals: row.goals ?? [],
      })
    );

    return { matches, loadError: null };
  } catch (err) {
    console.error("[tournament_matches] fetch failed:", err);
    return { matches: [], loadError: "Couldn't load match results." };
  }
}

/**
 * Standings table from final group-stage matches only. Semis/final are
 * knockout fixtures and don't feed the table. 3 points for a win, 1 for a
 * draw, sorted by points then goal difference then goals for.
 */
export function computeStandings(
  matches: TournamentMatchWithDetail[]
): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();

  const ensure = (teamId: string, teamName: string): StandingsRow => {
    let row = rows.get(teamId);
    if (!row) {
      row = {
        team_id: teamId,
        team_name: teamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        goal_diff: 0,
        points: 0,
      };
      rows.set(teamId, row);
    }
    return row;
  };

  for (const m of matches) {
    if (m.stage !== "group" || m.status !== "final") continue;
    if (m.home_score == null || m.away_score == null) continue;

    const home = ensure(m.home_team_id, m.home_team_name);
    const away = ensure(m.away_team_id, m.away_team_name);

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

  for (const row of rows.values()) {
    row.goal_diff = row.goals_for - row.goals_against;
  }

  return Array.from(rows.values()).sort(
    (a, b) =>
      b.points - a.points ||
      b.goal_diff - a.goal_diff ||
      b.goals_for - a.goals_for ||
      a.team_name.localeCompare(b.team_name)
  );
}

/** Top scorers (Golden Boot) aggregated across every match, sorted by goals desc. */
export function computeTopScorers(
  matches: TournamentMatchWithDetail[],
  limit = 10
): TopScorerRow[] {
  const byPlayer = new Map<string, TopScorerRow>();

  for (const m of matches) {
    for (const g of m.goals) {
      const teamName =
        g.team_id === m.home_team_id ? m.home_team_name : m.away_team_name;
      const key = `${g.team_id}::${g.player_name.toLowerCase()}`;
      const existing = byPlayer.get(key);
      if (existing) {
        existing.goals += g.goals;
      } else {
        byPlayer.set(key, {
          team_id: g.team_id,
          team_name: teamName,
          player_name: g.player_name,
          goals: g.goals,
        });
      }
    }
  }

  return Array.from(byPlayer.values())
    .sort((a, b) => b.goals - a.goals || a.player_name.localeCompare(b.player_name))
    .slice(0, limit);
}
