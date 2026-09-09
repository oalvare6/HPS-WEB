import type {
  MatchWithDetails,
  ScorerRow,
  StandingsRow,
  Team,
  TopScorers,
  TournamentRound,
} from "@/lib/types";
import { isMatchPlayed, roundCountsTowardTable } from "@/lib/schedule";

export { isMatchPlayed } from "@/lib/schedule";

const POINTS_WIN = 3;
const POINTS_DRAW = 1;

type TeamLite = Pick<Team, "id" | "name" | "color">;
type RoundLite = Pick<TournamentRound, "id" | "counts_toward_table">;

/**
 * Build a league table from played matches in rounds that count.
 *
 * `rounds` is required on purpose: the semi-finals, the final and the
 * exhibition are matches like any other, and forgetting to exclude them would
 * silently rewrite the league table the night they are entered. A match with
 * no round always counts. Standard 3/1/0; ties broken by points, then goal
 * difference, then goals for, then team name (stable, alphabetical) — the
 * rule the public table prints as its footnote.
 */
export function computeStandings(
  teams: TeamLite[],
  matches: MatchWithDetails[],
  rounds: RoundLite[]
): StandingsRow[] {
  const countingRounds = new Set<string>();
  for (const r of rounds) {
    if (roundCountsTowardTable(r)) countingRounds.add(r.id);
  }
  const counts = (m: MatchWithDetails) =>
    m.round_id == null || countingRounds.has(m.round_id);

  // Only include teams that actually appear in a fixture, so leftover/test
  // teams with no matches don't clutter the table.
  const participating = new Set<string>();
  for (const m of matches) {
    if (!counts(m)) continue;
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
    if (!counts(m)) continue;
    if (!isMatchPlayed(m)) continue;
    if (!m.home_team_id || !m.away_team_id) continue;
    if (m.home_team_id === m.away_team_id) continue;
    const homeScore = m.home_score as number;
    const awayScore = m.away_score as number;

    const home = rows.get(m.home_team_id);
    const away = rows.get(m.away_team_id);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goals_for += homeScore;
    home.goals_against += awayScore;
    away.goals_for += awayScore;
    away.goals_against += homeScore;

    if (homeScore > awayScore) {
      home.won += 1;
      home.points += POINTS_WIN;
      away.lost += 1;
    } else if (homeScore < awayScore) {
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
 * Top-scorer leaderboard over PLAYED matches only (a scorer typed before the
 * result is saved must not lead the Golden Boot). Own goals are counted
 * separately and never credited to a player. Identity is the person
 * (`contact_id`) when the owner picked a roster name, otherwise the
 * case-folded name within a team — so "Kelvin" and "Kelvin Cardona" merge only
 * when both rows point at the same person. Equal goal counts share a rank.
 * Includes every played match, playoffs too; the public tab says so.
 */
export function computeTopScorers(matches: MatchWithDetails[]): TopScorers {
  const byKey = new Map<string, Omit<ScorerRow, "rank">>();
  let ownGoals = 0;

  for (const m of matches) {
    if (!isMatchPlayed(m)) continue;
    for (const s of m.scorers) {
      if (s.own_goal === true) {
        ownGoals += s.goals;
        continue;
      }
      const name = s.scorer_name.trim();
      if (!name) continue;
      const team =
        s.team_id === m.home_team_id
          ? m.home_team
          : s.team_id === m.away_team_id
            ? m.away_team
            : null;
      const contactId = s.contact_id ?? null;
      const key = contactId
        ? `contact::${contactId}`
        : `${name.toLowerCase()}::${s.team_id ?? "none"}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.goals += s.goals;
        // A later, fuller spelling of the same person wins the display name.
        if (contactId && name.length > existing.scorer_name.length) {
          existing.scorer_name = name;
        }
      } else {
        byKey.set(key, {
          scorer_name: name,
          contact_id: contactId,
          team_id: s.team_id,
          team_name: team?.name ?? null,
          team_color: team?.color ?? null,
          goals: s.goals,
        });
      }
    }
  }

  const sorted = Array.from(byKey.values()).sort((a, b) => {
    if (b.goals !== a.goals) return b.goals - a.goals;
    return a.scorer_name.localeCompare(b.scorer_name);
  });

  const rows: ScorerRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const prev = rows[i - 1];
    const rank = prev && prev.goals === sorted[i].goals ? prev.rank : i + 1;
    rows.push({ rank, ...sorted[i] });
  }

  return { rows, ownGoals };
}
