import type {
  MatchWithDetails,
  ScorerRow,
  StandingsRow,
  Team,
} from "@/lib/types";

const POINTS_WIN = 3;
const POINTS_DRAW = 1;

type TeamLite = Pick<Team, "id" | "name" | "color">;

/**
 * Build a league table from completed matches. Only matches with status
 * "completed", both team ids set, and both scores recorded count. Standard
 * 3/1/0 scoring; ties broken by points, then goal difference, then goals for,
 * then team name (stable, alphabetical).
 */
export function computeStandings(
  teams: TeamLite[],
  matches: MatchWithDetails[]
): StandingsRow[] {
  // Only include teams that actually appear in a fixture, so leftover/test
  // teams with no matches don't clutter the table.
  const participating = new Set<string>();
  for (const m of matches) {
    if (m.home_team_id) participating.add(m.home_team_id);
    if (m.away_team_id) participating.add(m.away_team_id);
  }

  const rows = new Map<string, StandingsRow>();
  for (const t of teams) {
    if (!participating.has(t.id)) continue;
    rows.set(t.id, {
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

    const home = rows.get(m.home_team_id);
    const away = rows.get(m.away_team_id);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goals_for += m.home_score;
    home.goals_against += m.away_score;
    away.goals_for += m.away_score;
    away.goals_against += m.home_score;

    if (m.home_score > m.away_score) {
      home.won += 1;
      home.points += POINTS_WIN;
      away.lost += 1;
    } else if (m.home_score < m.away_score) {
      away.won += 1;
      away.points += POINTS_WIN;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += POINTS_DRAW;
      away.points += POINTS_DRAW;
    }
  }

  for (const row of rows.values()) {
    row.goal_difference = row.goals_for - row.goals_against;
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goal_difference !== a.goal_difference) {
      return b.goal_difference - a.goal_difference;
    }
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;
    return a.team_name.localeCompare(b.team_name);
  });
}

/**
 * Top-scorer leaderboard. Goals are summed across all matches grouped by
 * (case-insensitive scorer name, team). Sorted by goals desc, then name.
 */
export function computeTopScorers(matches: MatchWithDetails[]): ScorerRow[] {
  const byKey = new Map<string, ScorerRow>();

  for (const m of matches) {
    for (const s of m.scorers) {
      const name = s.scorer_name.trim();
      if (!name) continue;
      const team =
        s.team_id === m.home_team_id
          ? m.home_team
          : s.team_id === m.away_team_id
            ? m.away_team
            : null;
      const key = `${name.toLowerCase()}::${s.team_id ?? "none"}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.goals += s.goals;
      } else {
        byKey.set(key, {
          scorer_name: name,
          team_id: s.team_id,
          team_name: team?.name ?? null,
          team_color: team?.color ?? null,
          goals: s.goals,
        });
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.scorer_name.localeCompare(b.scorer_name);
  });
}
