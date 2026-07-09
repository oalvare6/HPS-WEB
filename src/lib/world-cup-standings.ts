import type { StandingsRow, Team } from "@/lib/types";

type TeamLite = Pick<Team, "id" | "name" | "color">;

/**
 * World Cup standings are published verbatim from the operator's tournament
 * flyer summary table, not derived from match scores. The flyer's summary and
 * its match grid disagree (and the summary is not reproducible from any set of
 * scores), so the Standings tab uses this override while Schedule/Results/Top
 * Scorers stay computed from the real match data. Row order is the flyer order
 * (final placement); the table renders rows in this order.
 */
const OVERRIDE_ROWS = [
  { name: "India", played: 5, won: 4, drawn: 0, lost: 1, gf: 36, ga: 22, gd: 14, points: 12 },
  { name: "USA", played: 4, won: 3, drawn: 0, lost: 1, gf: 21, ga: 15, gd: 6, points: 9 },
  { name: "Morocco", played: 5, won: 2, drawn: 0, lost: 3, gf: 25, ga: 25, gd: 0, points: 6 },
  { name: "Mexico", played: 5, won: 1, drawn: 1, lost: 3, gf: 19, ga: 26, gd: -7, points: 4 },
  { name: "Brazil", played: 3, won: 1, drawn: 0, lost: 2, gf: 15, ga: 15, gd: 0, points: 3 },
  { name: "Kazakhstan", played: 4, won: 0, drawn: 1, lost: 3, gf: 10, ga: 23, gd: -13, points: 1 },
] as const;

/**
 * Build the published World Cup standings in flyer order, mapping each row onto
 * the tournament's teams by name to pick up the team id and color. Teams that
 * are not part of the flyer summary are omitted.
 */
export function getWorldCupStandingsOverride(teams: TeamLite[]): StandingsRow[] {
  const teamByName = new Map<string, TeamLite>();
  for (const t of teams) {
    teamByName.set(t.name.trim().toLowerCase(), t);
  }

  return OVERRIDE_ROWS.map((row) => {
    const team = teamByName.get(row.name.toLowerCase());
    return {
      team_id: team?.id ?? row.name.toLowerCase(),
      team_name: team?.name ?? row.name,
      team_color: team?.color ?? null,
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goals_for: row.gf,
      goals_against: row.ga,
      goal_difference: row.gd,
      points: row.points,
    };
  });
}
