import type { ScorerRow, Team } from "@/lib/types";

type TeamLite = Pick<Team, "id" | "name" | "color">;

/**
 * World Cup Leading Scoring List, published verbatim from the operator's July
 * 24 semis sheet — the same override pattern as world-cup-standings.ts. The
 * sheet uses full player names while per-match scorer rows use nicknames, and
 * a handful of totals don't reconcile with a per-match recount, so the public
 * Top Scorers tab shows this list verbatim while the per-match scorers stay
 * seeded for the Results detail view.
 *
 * Rows with unresolved identities (jersey numbers, own goals, technical
 * scores) are flagged `unconfirmed` and rendered as a muted group below the
 * ranked list instead of being mixed into it.
 */
const SCORER_ROWS: ReadonlyArray<{
  team: string;
  player: string;
  goals: number;
  unconfirmed?: boolean;
}> = [
  { team: "India", player: "Mahnek Birring", goals: 14 },
  { team: "India", player: "Daniel Curl", goals: 13 },
  { team: "Morocco", player: "Kelvin Cardona", goals: 12 },
  { team: "Morocco", player: "William Franco", goals: 11 },
  { team: "USA", player: "Jason Hercules", goals: 10 },
  { team: "India", player: "Gahven Birring", goals: 10 },
  { team: "USA", player: "Carlos Castellon", goals: 9 },
  { team: "Brazil", player: "Ethan Hernandez", goals: 8 },
  { team: "Mexico", player: "Alejandro Plazaola", goals: 8 },
  { team: "Brazil", player: "Ayden Abu", goals: 7 },
  { team: "Morocco, USA", player: "Technical Score", goals: 6, unconfirmed: true },
  { team: "Brazil", player: "Nathan Hernandez", goals: 6 },
  { team: "USA", player: "David Cruz", goals: 6 },
  { team: "Morocco", player: "Joshua Lockhart", goals: 5 },
  { team: "Kazakhstan", player: "Jacob Mashburn", goals: 5 },
  { team: "USA", player: "Evan Wright", goals: 5 },
  { team: "Brazil", player: "Eduardo Villatoro", goals: 5 },
  { team: "All Teams", player: "Own Goals", goals: 4, unconfirmed: true },
  { team: "Kazakhstan", player: "Jesse Pacero", goals: 4 },
  { team: "Morocco", player: "Jan Carlos Galo", goals: 4 },
  { team: "Mexico", player: "Emir Chavarria", goals: 4 },
  { team: "Brazil", player: "Brandon Bricker", goals: 4 },
  { team: "Brazil", player: "Alex Matre", goals: 4 },
  { team: "Kazakhstan", player: "Alfonso Juarez", goals: 3 },
  { team: "USA", player: "Adrian Minero", goals: 3 },
  { team: "Kazakhstan", player: "Yusuf Kaya", goals: 2 },
  { team: "India", player: "Shivam Dhingra", goals: 2 },
  { team: "Morocco", player: "Oscar Santillana", goals: 2 },
  { team: "USA", player: "Omar Villatoro", goals: 2 },
  { team: "Morocco", player: "Omar Arteaga", goals: 2 },
  { team: "Kazakhstan", player: "Miguel", goals: 2 },
  { team: "India", player: "Fiyinfolowa Adesina", goals: 2 },
  { team: "Morocco", player: "Edgar", goals: 2 },
  { team: "India", player: "Armon Tcharmtichi", goals: 2 },
  { team: "Kazakhstan", player: "Alan Velazquez", goals: 2 },
  { team: "Kazakhstan", player: "#7 on Round 3", goals: 2, unconfirmed: true },
  { team: "USA", player: "Will Cook", goals: 1 },
  { team: "Brazil", player: "Tony Portillo", goals: 1 },
  { team: "Mexico", player: "Sergio", goals: 1 },
  { team: "Mexico", player: "Salvador Castro", goals: 1 },
  { team: "Kazakhstan", player: "Omar Alvarez", goals: 1 },
  { team: "Mexico", player: "Julian", goals: 1 },
  { team: "Mexico", player: "Jesus", goals: 1 },
  { team: "Morocco", player: "Gilbert", goals: 1 },
  { team: "Mexico", player: "Emiliano Escobar", goals: 1 },
  { team: "Mexico", player: "Chris Chavarria", goals: 1 },
  { team: "USA", player: "Carlos Figueroa", goals: 1 },
  { team: "Brazil", player: "Adhan Razwani", goals: 1 },
  { team: "USA", player: "#6 in Round 3", goals: 1, unconfirmed: true },
  { team: "Kazakhstan", player: "#5 on Round 3", goals: 1, unconfirmed: true },
  { team: "Mexico", player: "#3 Mexico, Jorge?", goals: 1, unconfirmed: true },
];

export type WorldCupScorers = {
  /** Published list in sheet order, identified players only. */
  ranked: ScorerRow[];
  /** Jersey-number / own-goal / technical rows, rendered separately and muted. */
  unconfirmed: ScorerRow[];
};

/**
 * Build the published Leading Scoring List, resolving each row's team by name
 * against the tournament's teams to pick up id and color. Multi-team rows
 * ("Morocco, USA", "All Teams") keep their verbatim team text with no id.
 */
export function getWorldCupScorersOverride(teams: TeamLite[]): WorldCupScorers {
  const teamByName = new Map<string, TeamLite>();
  for (const t of teams) {
    teamByName.set(t.name.trim().toLowerCase(), t);
  }

  const ranked: ScorerRow[] = [];
  const unconfirmed: ScorerRow[] = [];
  for (const row of SCORER_ROWS) {
    const team = teamByName.get(row.team.toLowerCase());
    const scorer: ScorerRow = {
      scorer_name: row.player,
      team_id: team?.id ?? null,
      team_name: team?.name ?? row.team,
      team_color: team?.color ?? null,
      goals: row.goals,
    };
    (row.unconfirmed ? unconfirmed : ranked).push(scorer);
  }
  return { ranked, unconfirmed };
}
