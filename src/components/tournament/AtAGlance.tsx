import { CalendarDays, Trophy } from "lucide-react";
import type { StandingsRow } from "@/lib/types";
import {
  formatShortDate,
  isMatchPlayed,
  lastPlayedRound,
  nextMatchday,
  type RoundGroup,
} from "@/lib/schedule";
import type { StandingsSource } from "./StandingsList";

type Props = {
  groups: RoundGroup[];
  standings: StandingsRow[];
  standingsSource: StandingsSource;
};

/**
 * The five-second answer at the top of a live tournament page: who leads, what
 * the last scores were, when the next matchday is. Everything here is derived
 * from data the page already loaded; no query of its own. No hooks, so it
 * renders on the server.
 */
export function AtAGlance({ groups, standings, standingsSource }: Props) {
  const leader = standings[0];
  const runnerUp = standings[1];
  const hasResults = standings.some((r) => r.played > 0);
  const last = lastPlayedRound(groups);
  const next = nextMatchday(groups);

  const nextTime = next?.round?.time_start ?? null;
  const nextDate = next ? formatShortDate(next.date) ?? "Date TBA" : null;

  return (
    <section aria-labelledby="at-a-glance-heading" className="dashboard-card p-4 sm:p-5">
      <h2 id="at-a-glance-heading" className="sr-only">
        At a glance
      </h2>
      <div className="space-y-3 text-sm">
        {/* Leader */}
        <p className="flex items-start gap-2">
          <Trophy size={16} aria-hidden className="text-brand flex-shrink-0 mt-0.5" />
          {standingsSource === "published" ? (
            <span className="text-zinc-300">Final table as published.</span>
          ) : leader && hasResults ? (
            <span className="text-zinc-300 min-w-0">
              <span className="text-white font-semibold">{leader.team_name}</span>{" "}
              lead on{" "}
              <span className="font-mono font-bold text-white tabular-nums">
                {leader.points} pts
              </span>
              {runnerUp && runnerUp.points === leader.points && (
                <span className="text-zinc-400">, ahead on goal difference</span>
              )}
            </span>
          ) : (
            <span className="text-zinc-400">Table opens after the first results.</span>
          )}
        </p>

        {/* Last matchday */}
        {last && (
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
              {last.label}
              {last.date && (
                <>
                  <span aria-hidden> · </span>
                  {formatShortDate(last.date)}
                </>
              )}
            </p>
            <ul className="space-y-1">
              {last.matches.filter(isMatchPlayed).map((m) => {
                const home = m.home_team?.name ?? m.home_team_label ?? "TBD";
                const away = m.away_team?.name ?? m.away_team_label ?? "TBD";
                const hs = m.home_score as number;
                const as = m.away_score as number;
                return (
                  <li key={m.id} className="flex items-baseline gap-2 min-w-0">
                    <span
                      className={`flex-1 min-w-0 truncate text-right ${
                        hs > as ? "text-white font-semibold" : "text-zinc-300"
                      }`}
                    >
                      {home}
                    </span>
                    <span className="font-mono font-bold text-white tabular-nums flex-shrink-0">
                      {hs}
                      <span className="text-zinc-600 mx-1">–</span>
                      {as}
                    </span>
                    <span
                      className={`flex-1 min-w-0 truncate ${
                        as > hs ? "text-white font-semibold" : "text-zinc-300"
                      }`}
                    >
                      {away}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Next matchday */}
        <p className="flex items-start gap-2">
          <CalendarDays size={16} aria-hidden className="text-brand flex-shrink-0 mt-0.5" />
          {next ? (
            <span className="text-zinc-300 min-w-0">
              <span className="text-zinc-500">Next:</span>{" "}
              <span className="text-white font-semibold">{next.label}</span>
              <span aria-hidden> · </span>
              {nextDate}
              {nextTime && (
                <>
                  <span aria-hidden> · </span>
                  {nextTime}
                </>
              )}
              {next.matches.length === 0 && (
                <span className="block text-xs text-zinc-500">Fixtures to be confirmed</span>
              )}
            </span>
          ) : (
            <span className="text-zinc-400">No upcoming matchday.</span>
          )}
        </p>
      </div>
    </section>
  );
}
