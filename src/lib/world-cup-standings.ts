import type { StandingsRow, Team } from "@/lib/types";

type TeamLite = Pick<Team, "id" | "name" | "color">;

/**
 * World Cup group-stage standings are published verbatim from the operator's
 * final table (July 24 semis sheet), not derived from match scores. The table
 * is internally consistent (points math checks out; GF and GA both total 189)
 * but it is NOT reproducible by computeStandings because the Round 1 Brazil vs
 * USA fixture was never played on its date — it was replayed in Round 6 for
 * DOUBLE points, a rule the generic 3/1/0 calculator does not model. So the
 * Standings tab uses this override while Schedule/Results keep the real match
 * data. Row order is the published order (final group placement) and the table
 * renders rows in this order. Scoring: win 3, draw 1, loss 0 (doubled for the
 * Round 6 Brazil–USA make-up).
 */
const OVERRIDE_ROWS = [
  { name: "Morocco", played: 7, won: 4, drawn: 0, lost: 3, gf: 39, ga: 30, gd: 9, points: 12 },
  { name: "India", played: 7, won: 4, drawn: 0, lost: 3, gf: 41, ga: 35, gd: 6, points: 12 },
  { name: "Brazil", played: 7, won: 3, drawn: 2, lost: 2, gf: 31, ga: 27, gd: 4, points: 11 },
  { name: "USA", played: 7, won: 3, drawn: 2, lost: 2, gf: 28, ga: 30, gd: -2, points: 11 },
  { name: "Kazakhstan", played: 7, won: 2, drawn: 1, lost: 4, gf: 23, ga: 29, gd: -6, points: 7 },
  { name: "Mexico", played: 7, won: 1, drawn: 1, lost: 5, gf: 27, ga: 38, gd: -11, points: 4 },
] as const;

/** Caption rendered above the published World Cup standings table. */
export const WORLD_CUP_STANDINGS_CAPTION = "Group stage — final";

/** Footnote explaining why the published points don't match a naive 3/1/0 recount. */
export const WORLD_CUP_STANDINGS_FOOTNOTE =
  "Round 1's Brazil vs USA fixture was not played on its original date; it was replayed in Round 6 for double points (6-6 — two points each). Win 3 · draw 1 · loss 0.";

/**
 * Build the published World Cup standings in published order, mapping each row
 * onto the tournament's teams by name to pick up the team id and color. Teams
 * that are not part of the published table are omitted.
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
