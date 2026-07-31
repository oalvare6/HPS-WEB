"use client";

import { cn } from "@/lib/utils";
import type { ScorerRow } from "@/lib/types";

function ScorerItem({
  s,
  rank,
  maxGoals,
  muted = false,
}: {
  s: ScorerRow;
  rank: number | null;
  maxGoals: number;
  muted?: boolean;
}) {
  const barPct = maxGoals > 0 ? Math.max(6, Math.round((s.goals / maxGoals) * 100)) : 0;
  return (
    <li className={cn("flex items-center gap-3 px-4 py-2.5", muted && "opacity-70")}>
      <span
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 font-mono tabular-nums",
          rank === 1 ? "bg-brand text-white" : "bg-surface-2 text-zinc-400"
        )}
      >
        {rank ?? "•"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={cn("truncate font-medium", muted ? "text-zinc-300" : "text-white")}>
            {s.scorer_name}
          </span>
          <span className="font-mono font-bold text-white tabular-nums flex-shrink-0">
            {s.goals}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            aria-hidden
            className="h-1 rounded-full flex-shrink-0 transition-all"
            style={{
              width: `${barPct}%`,
              maxWidth: "160px",
              backgroundColor: s.team_color || "rgb(63 63 70)",
              opacity: muted ? 0.45 : 0.9,
            }}
          />
          {s.team_name && (
            <span className="truncate text-[11px] text-zinc-500">{s.team_name}</span>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Leading scorers with team-colored goal bars. When an `unconfirmed` group is
 * supplied (published rows that aren't matched to a named player), it renders
 * muted below the ranked list instead of polluting the ranking.
 */
export function ScorersTab({
  scorers,
  unconfirmed,
}: {
  scorers: ScorerRow[];
  unconfirmed?: ScorerRow[];
}) {
  const maxGoals = scorers[0]?.goals ?? 0;

  if (scorers.length === 0 && (!unconfirmed || unconfirmed.length === 0)) {
    return (
      <div className="rounded-xl border border-dashed border-border-token/70 bg-surface/50 px-5 py-8 text-center">
        <p className="text-sm font-semibold text-white">No goals recorded yet</p>
        <p className="mt-1 text-sm text-zinc-400">
          The golden-boot race starts with the first final whistle.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ul className="dashboard-card divide-y divide-border-token/50 overflow-hidden">
        {scorers.map((s, i) => (
          <ScorerItem
            key={`${s.scorer_name}-${s.team_id ?? s.team_name ?? "none"}`}
            s={s}
            rank={i + 1}
            maxGoals={maxGoals}
          />
        ))}
      </ul>

      {unconfirmed && unconfirmed.length > 0 && (
        <div>
          <h3 className="mb-1 font-condensed uppercase tracking-wider text-[15px] text-zinc-400">
            Unconfirmed
          </h3>
          <p className="mb-2.5 text-xs text-zinc-500">
            Published totals not yet matched to a named player — jersey numbers,
            own goals, and technical scores.
          </p>
          <ul className="rounded-xl border border-border-token/50 bg-surface/50 divide-y divide-border-token/40 overflow-hidden">
            {unconfirmed.map((s) => (
              <ScorerItem
                key={`${s.scorer_name}-${s.team_name ?? "none"}`}
                s={s}
                rank={null}
                maxGoals={maxGoals}
                muted
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
