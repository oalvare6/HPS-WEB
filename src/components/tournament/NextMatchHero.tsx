"use client";

import { motion } from "motion/react";
import type { MatchWithDetails } from "@/lib/types";
import { formatMatchDate, TeamMark } from "./primitives";

/**
 * Countdown-style band for the next fixture (e.g. the Final) shown above the
 * hub tabs while the tournament is live. Date/time render statically to avoid
 * hydration drift; team colors wash in from each side.
 */
export function NextMatchHero({
  match,
  roundLabel,
}: {
  match: MatchWithDetails;
  roundLabel: string | null;
}) {
  const home = match.home_team?.name ?? match.home_team_label ?? "TBD";
  const away = match.away_team?.name ?? match.away_team_label ?? "TBD";
  const homeColor = match.home_team?.color ?? null;
  const awayColor = match.away_team?.color ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative overflow-hidden rounded-xl border border-border-token/70 bg-surface-2/60 shadow-lg shadow-black/30"
    >
      {homeColor && (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-1/3"
          style={{ background: `linear-gradient(90deg, ${homeColor}26, transparent)` }}
        />
      )}
      {awayColor && (
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-1/3"
          style={{ background: `linear-gradient(270deg, ${awayColor}26, transparent)` }}
        />
      )}

      <div className="relative px-4 py-5 sm:px-6 text-center">
        <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-zinc-400">
          Up next{roundLabel ? ` · ${roundLabel}` : ""}
        </p>
        <div className="mt-3 flex items-center justify-center gap-3 sm:gap-6">
          <span className="flex-1 flex justify-end min-w-0">
            <TeamMark name={home} color={homeColor} align="right" strong size="lg" />
          </span>
          <span className="font-display text-2xl text-zinc-600 flex-shrink-0">vs</span>
          <span className="flex-1 flex justify-start min-w-0">
            <TeamMark name={away} color={awayColor} strong size="lg" />
          </span>
        </div>
        <p className="mt-3 text-sm text-zinc-300">
          <span className="font-semibold text-white">{formatMatchDate(match.match_date)}</span>
          {match.kickoff_time && (
            <>
              <span className="text-zinc-600 mx-2">·</span>
              {match.kickoff_time}
            </>
          )}
        </p>
      </div>
    </motion.div>
  );
}
