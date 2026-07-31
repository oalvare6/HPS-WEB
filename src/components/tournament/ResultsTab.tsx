"use client";

import { useMemo } from "react";
import type { MatchWithDetails, TournamentRound } from "@/lib/types";
import { Scoreline } from "./Scoreline";
import { chip, formatMatchDate, matchChips, ScorerList, TeamMark } from "./primitives";

function ResultCard({ m }: { m: MatchWithDetails }) {
  const homeGoals = m.scorers.filter((g) => g.team_id === m.home_team_id);
  const awayGoals = m.scorers.filter((g) => g.team_id === m.away_team_id);
  const homeAdvanced = m.advanced_team_id != null && m.advanced_team_id === m.home_team_id;
  const awayAdvanced = m.advanced_team_id != null && m.advanced_team_id === m.away_team_id;
  const homeWin = homeAdvanced || (m.home_score ?? 0) > (m.away_score ?? 0);
  const awayWin = awayAdvanced || (m.away_score ?? 0) > (m.home_score ?? 0);
  const chips = matchChips(m);
  const homeColor = m.home_team?.color ?? null;
  const awayColor = m.away_team?.color ?? null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border-token/60 bg-surface/80 p-4 sm:p-5 shadow-lg shadow-black/25">
      {homeColor && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ backgroundColor: homeColor }}
        />
      )}
      {awayColor && (
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 w-1"
          style={{ backgroundColor: awayColor }}
        />
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-5">
        <div className="min-w-0 text-right space-y-1.5 pt-1">
          <div className="flex justify-end">
            <TeamMark
              name={m.home_team?.name ?? m.home_team_label ?? "TBD"}
              color={homeColor}
              align="right"
              strong={homeWin}
              size="lg"
            />
          </div>
          {homeAdvanced && (
            <div>
              <span className={chip({ tone: "win" })}>Advanced</span>
            </div>
          )}
          <ScorerList goals={homeGoals} align="right" />
        </div>

        <div className="text-center flex-shrink-0 px-1 sm:px-3">
          <Scoreline home={m.home_score} away={m.away_score} size="lg" />
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            {chips.map((c) => (
              <span key={c.label} className={chip({ tone: c.tone })}>
                {c.label}
              </span>
            ))}
          </div>
          {m.match_date && (
            <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              {formatMatchDate(m.match_date)}
            </div>
          )}
        </div>

        <div className="min-w-0 text-left space-y-1.5 pt-1">
          <div className="flex justify-start">
            <TeamMark
              name={m.away_team?.name ?? m.away_team_label ?? "TBD"}
              color={awayColor}
              strong={awayWin}
              size="lg"
            />
          </div>
          {awayAdvanced && (
            <div>
              <span className={chip({ tone: "win" })}>Advanced</span>
            </div>
          )}
          <ScorerList goals={awayGoals} align="left" />
        </div>
      </div>

      {m.notes && (
        <p className="mt-3 text-center text-xs text-zinc-500">{m.notes}</p>
      )}
    </div>
  );
}

/**
 * Completed matches as scoreboard cards, grouped by round with the latest
 * round first so fresh results lead.
 */
export function ResultsTab({
  matches,
  rounds,
}: {
  matches: MatchWithDetails[];
  rounds: TournamentRound[];
}) {
  const groups = useMemo(() => {
    const byRound = new Map<string, MatchWithDetails[]>();
    const noRound: MatchWithDetails[] = [];
    for (const m of matches) {
      if (m.round_id) {
        const list = byRound.get(m.round_id) ?? [];
        list.push(m);
        byRound.set(m.round_id, list);
      } else {
        noRound.push(m);
      }
    }
    const ordered: { key: string; label: string | null; items: MatchWithDetails[] }[] = [];
    for (const r of rounds) {
      const items = byRound.get(r.id);
      if (items && items.length > 0) {
        ordered.push({ key: r.id, label: r.label, items });
      }
    }
    ordered.reverse();
    if (noRound.length > 0) {
      ordered.push({ key: "none", label: null, items: noRound });
    }
    return ordered;
  }, [matches, rounds]);

  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-token/70 bg-surface/50 px-5 py-8 text-center">
        <p className="text-sm font-semibold text-white">No results yet</p>
        <p className="mt-1 text-sm text-zinc-400">
          Final scores land here right after each matchday.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key}>
          {g.label && (
            <h3 className="mb-2.5 font-condensed uppercase tracking-wider text-[15px] text-zinc-300">
              {g.label}
            </h3>
          )}
          <div className="space-y-3">
            {g.items.map((m) => (
              <ResultCard key={m.id} m={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
