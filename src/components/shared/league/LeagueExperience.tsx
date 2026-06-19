import { CalendarDays, Goal, ListOrdered, Trophy } from "lucide-react";
import type {
  MatchWithDetails,
  StandingRow,
  TopScorerRow,
  TournamentRound,
} from "@/lib/types";
import type { TournamentLeague } from "@/lib/matches";

function formatDate(iso: string | null): string {
  if (!iso) return "Date TBA";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function TeamDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
      style={{ backgroundColor: color ?? "#475569" }}
    />
  );
}

function SectionTitle({
  icon: Icon,
  title,
  meta,
}: {
  icon: typeof Trophy;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={18} className="text-brand" />
      <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
        {title}
      </h2>
      {meta && <span className="text-xs text-zinc-500">{meta}</span>}
    </div>
  );
}

function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <div>
      <SectionTitle icon={ListOrdered} title="Standings" />
      <div className="dashboard-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-zinc-400 border-b border-border-token">
                <th className="text-left font-medium py-3 pl-4 pr-2 w-8">#</th>
                <th className="text-left font-medium py-3 px-2">Team</th>
                <th className="text-center font-medium py-3 px-2 w-9" title="Played">
                  P
                </th>
                <th className="text-center font-medium py-3 px-2 w-9 hidden sm:table-cell" title="Won">
                  W
                </th>
                <th className="text-center font-medium py-3 px-2 w-9 hidden sm:table-cell" title="Drawn">
                  D
                </th>
                <th className="text-center font-medium py-3 px-2 w-9 hidden sm:table-cell" title="Lost">
                  L
                </th>
                <th className="text-center font-medium py-3 px-2 w-10 hidden md:table-cell" title="Goals for">
                  GF
                </th>
                <th className="text-center font-medium py-3 px-2 w-10 hidden md:table-cell" title="Goals against">
                  GA
                </th>
                <th className="text-center font-medium py-3 px-2 w-10" title="Goal difference">
                  GD
                </th>
                <th className="text-center font-semibold py-3 px-2 pr-4 w-12 text-white" title="Points">
                  Pts
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.team_id}
                  className="border-b border-border-token/50 last:border-0 hover:bg-surface-2/40 transition-colors"
                >
                  <td className="py-3 pl-4 pr-2 text-zinc-500 tabular-nums">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`w-1 h-5 rounded-full ${
                          i === 0
                            ? "bg-brand"
                            : i < 4
                              ? "bg-brand/40"
                              : "bg-transparent"
                        }`}
                      />
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <TeamDot color={r.team_color} />
                      <span className="text-white font-medium truncate">
                        {r.team_name}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 px-2 text-center text-zinc-300 tabular-nums">
                    {r.played}
                  </td>
                  <td className="py-3 px-2 text-center text-zinc-300 tabular-nums hidden sm:table-cell">
                    {r.won}
                  </td>
                  <td className="py-3 px-2 text-center text-zinc-300 tabular-nums hidden sm:table-cell">
                    {r.drawn}
                  </td>
                  <td className="py-3 px-2 text-center text-zinc-300 tabular-nums hidden sm:table-cell">
                    {r.lost}
                  </td>
                  <td className="py-3 px-2 text-center text-zinc-300 tabular-nums hidden md:table-cell">
                    {r.goals_for}
                  </td>
                  <td className="py-3 px-2 text-center text-zinc-300 tabular-nums hidden md:table-cell">
                    {r.goals_against}
                  </td>
                  <td className="py-3 px-2 text-center text-zinc-300 tabular-nums">
                    {r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}
                  </td>
                  <td className="py-3 px-2 pr-4 text-center font-bold text-white tabular-nums">
                    {r.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-zinc-500 mt-2">
        P played · W won · D drawn · L lost · GF goals for · GA goals against ·
        GD goal difference · Pts points (3 for a win, 1 for a draw).
      </p>
    </div>
  );
}

function ScorerChips({
  match,
  side,
}: {
  match: MatchWithDetails;
  side: "home" | "away";
}) {
  // Attribute each scorer to a side by team. Scorers with no team fall to the
  // home column so they're never dropped from the box score.
  const all = match.scorers.filter((s) => {
    if (side === "home") {
      return s.team_id === match.home_team_id || s.team_id == null;
    }
    return s.team_id === match.away_team_id && s.team_id != null;
  });
  if (all.length === 0) return <div />;
  return (
    <ul
      className={`space-y-1 ${side === "home" ? "text-right" : "text-left"}`}
    >
      {all.map((s) => (
        <li
          key={s.id}
          className={`text-xs text-zinc-300 inline-flex items-center gap-1 ${
            side === "home" ? "flex-row-reverse" : ""
          }`}
        >
          <Goal size={11} className="text-brand/70 shrink-0" />
          <span>
            {s.scorer_name}
            {s.goals > 1 && (
              <span className="text-zinc-500"> ×{s.goals}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MatchCard({ match }: { match: MatchWithDetails }) {
  const completed = match.status === "completed";
  const cancelled = match.status === "cancelled";
  const postponed = match.status === "postponed";
  const hasScore =
    completed && match.home_score != null && match.away_score != null;
  const homeWon =
    hasScore && (match.home_score as number) > (match.away_score as number);
  const awayWon =
    hasScore && (match.away_score as number) > (match.home_score as number);

  return (
    <li className="px-4 py-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        {/* Home */}
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span
            className={`truncate text-sm sm:text-base ${
              homeWon ? "text-white font-semibold" : "text-zinc-300"
            }`}
          >
            {match.home_team_name ?? "TBD"}
          </span>
          <TeamDot color={match.home_team_color} />
        </div>

        {/* Score / status */}
        <div className="flex flex-col items-center justify-center min-w-[3.5rem]">
          {hasScore ? (
            <span className="font-mono text-lg font-bold text-white tabular-nums tracking-tight">
              {match.home_score}
              <span className="text-zinc-600 mx-1">-</span>
              {match.away_score}
            </span>
          ) : cancelled ? (
            <span className="text-[10px] font-mono uppercase tracking-wider bg-red-500/20 text-red-300 px-2 py-0.5 rounded">
              Cancelled
            </span>
          ) : postponed ? (
            <span className="text-[10px] font-mono uppercase tracking-wider bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded">
              Postponed
            </span>
          ) : (
            <span className="text-zinc-500 text-sm font-medium">vs</span>
          )}
          {match.kickoff_time && !cancelled && !postponed && (
            <span className="text-[10px] text-zinc-500 mt-0.5">
              {match.kickoff_time}
            </span>
          )}
        </div>

        {/* Away */}
        <div className="flex items-center justify-start gap-2 min-w-0">
          <TeamDot color={match.away_team_color} />
          <span
            className={`truncate text-sm sm:text-base ${
              awayWon ? "text-white font-semibold" : "text-zinc-300"
            }`}
          >
            {match.away_team_name ?? "TBD"}
          </span>
        </div>
      </div>

      {hasScore && match.scorers.length > 0 && (
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4 mt-2">
          <ScorerChips match={match} side="home" />
          <div className="min-w-[3.5rem]" />
          <ScorerChips match={match} side="away" />
        </div>
      )}
    </li>
  );
}

function FixturesResults({
  matches,
  rounds,
}: {
  matches: MatchWithDetails[];
  rounds: TournamentRound[];
}) {
  const roundsById = new Map(rounds.map((r) => [r.id, r]));
  const groups = new Map<string, MatchWithDetails[]>();
  for (const m of matches) {
    const key = m.round_id ?? "__none__";
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }
  const orderedKeys = [
    ...rounds.map((r) => r.id).filter((id) => groups.has(id)),
    ...(groups.has("__none__") ? ["__none__"] : []),
  ];

  return (
    <div>
      <SectionTitle
        icon={CalendarDays}
        title="Fixtures & results"
        meta={`${matches.length} ${matches.length === 1 ? "match" : "matches"}`}
      />
      <div className="space-y-5">
        {orderedKeys.map((key) => {
          const round = key === "__none__" ? null : roundsById.get(key) ?? null;
          const groupMatches = groups.get(key) ?? [];
          const dateLabel = round
            ? formatDate(round.round_date)
            : null;
          return (
            <div key={key} className="dashboard-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-surface-2/40 border-b border-border-token">
                <span className="text-sm font-semibold text-white">
                  {round ? round.label : "Other matches"}
                </span>
                {dateLabel && (
                  <span className="text-xs text-zinc-400">{dateLabel}</span>
                )}
              </div>
              <ul className="divide-y divide-border-token/60">
                {groupMatches.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopScorers({ rows }: { rows: TopScorerRow[] }) {
  const top = rows.slice(0, 15);
  return (
    <div>
      <SectionTitle icon={Trophy} title="Golden Boot · Top scorers" />
      <div className="dashboard-card overflow-hidden divide-y divide-border-token/60">
        {top.map((s, i) => (
          <div
            key={`${s.team_id ?? "none"}-${s.scorer_name}`}
            className="flex items-center gap-3 px-4 py-3"
          >
            <span
              className={`w-6 text-center font-mono text-sm tabular-nums ${
                i === 0 ? "text-brand font-bold" : "text-zinc-500"
              }`}
            >
              {i + 1}
            </span>
            <span className="flex items-center gap-2 min-w-0 flex-1">
              {i === 0 ? (
                <Trophy size={14} className="text-brand shrink-0" />
              ) : (
                <TeamDot color={s.team_color} />
              )}
              <span className="text-white font-medium truncate">
                {s.scorer_name}
              </span>
              {s.team_name && (
                <span className="text-xs text-zinc-500 truncate hidden sm:inline">
                  {s.team_name}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-base font-bold text-white tabular-nums">
                {s.goals}
              </span>
              <Goal size={13} className="text-zinc-500" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Full public league experience for a tournament: standings, fixtures/results,
 * and the top-scorers leaderboard. Each section only renders when it has data,
 * so a brand-new tournament shows nothing until the operator adds teams/matches.
 */
export function LeagueExperience({
  league,
  rounds,
}: {
  league: TournamentLeague;
  rounds: TournamentRound[];
}) {
  const showStandings =
    league.standings.length >= 2 &&
    league.standings.some((s) => s.played > 0);
  const showFixtures = league.matches.length > 0;
  const showScorers = league.topScorers.length > 0;

  if (!showStandings && !showFixtures && !showScorers) return null;

  return (
    <div className="space-y-10">
      {showStandings && <StandingsTable rows={league.standings} />}
      {showFixtures && (
        <FixturesResults matches={league.matches} rounds={rounds} />
      )}
      {showScorers && <TopScorers rows={league.topScorers} />}
    </div>
  );
}
