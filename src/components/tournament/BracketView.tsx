import { cn } from "@/lib/utils";
import type { MatchWithDetails, TournamentRound } from "@/lib/types";
import { chip, formatMatchDate } from "./primitives";

export type BracketStage = {
  round: TournamentRound;
  matches: MatchWithDetails[];
};

function teamRow(
  m: MatchWithDetails,
  side: "home" | "away"
): { name: string; color: string | null; score: number | null; winner: boolean; advanced: boolean } {
  const team = side === "home" ? m.home_team : m.away_team;
  const label = side === "home" ? m.home_team_label : m.away_team_label;
  const score = side === "home" ? m.home_score : m.away_score;
  const other = side === "home" ? m.away_score : m.home_score;
  const advanced = team != null && m.advanced_team_id === team.id;
  const winner =
    m.status === "completed" &&
    (advanced || (score != null && other != null && score > other));
  return { name: team?.name ?? label ?? "TBD", color: team?.color ?? null, score, winner, advanced };
}

function BracketMatch({ m, emphasis = false }: { m: MatchWithDetails; emphasis?: boolean }) {
  const rows = [teamRow(m, "home"), teamRow(m, "away")];
  const played = m.status === "completed";
  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden shadow-md shadow-black/25",
        emphasis
          ? "border-brand/40 bg-surface-2/70"
          : "border-border-token/70 bg-surface-2/40"
      )}
    >
      <div className="divide-y divide-border-token/50">
        {rows.map((r, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2.5 px-3.5 py-2.5",
              played && !r.winner && "opacity-60"
            )}
          >
            <span
              aria-hidden
              className="h-4 w-1 rounded-full flex-shrink-0"
              style={{ backgroundColor: r.color || "#3f3f46" }}
            />
            <span
              className={cn(
                "flex-1 truncate font-condensed uppercase tracking-wide text-[15px]",
                r.winner ? "text-white font-semibold" : "text-zinc-300"
              )}
            >
              {r.name}
            </span>
            {r.advanced && <span className={chip({ tone: "win" })}>Advanced</span>}
            <span
              className={cn(
                "font-mono text-base font-bold tabular-nums w-6 text-right",
                r.winner ? "text-white" : "text-zinc-400"
              )}
            >
              {r.score ?? ""}
            </span>
          </div>
        ))}
      </div>
      {(m.notes || (!played && (m.match_date || m.kickoff_time))) && (
        <div className="border-t border-border-token/50 bg-base/30 px-3.5 py-1.5 text-[11px] text-zinc-500">
          {m.notes ??
            [formatMatchDate(m.match_date), m.kickoff_time].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}

/**
 * Two-round knockout bracket (semis feeding the final). Generic over however
 * many knockout stages exist; the last stage is treated as the showpiece.
 */
export function BracketView({ stages }: { stages: BracketStage[] }) {
  if (stages.length === 0) return null;
  return (
    <div className="rounded-xl border border-border-token/60 bg-surface/60 p-4 sm:p-5">
      <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
        {stages.map((stage, si) => {
          const last = si === stages.length - 1;
          return (
            <div key={stage.round.id} className={cn("flex-1 min-w-0 flex flex-col", last && "md:justify-center")}>
              <p className="mb-2.5 flex items-baseline justify-between gap-3">
                <span className="font-condensed uppercase tracking-wider text-sm text-white">
                  {stage.round.label}
                </span>
                {stage.round.round_date && (
                  <span className="text-[11px] font-mono text-zinc-500">
                    {formatMatchDate(stage.round.round_date)}
                  </span>
                )}
              </p>
              <div className={cn("space-y-3", last && "md:flex-1 md:flex md:flex-col md:justify-center md:space-y-0")}>
                {stage.matches.map((m) => (
                  <BracketMatch key={m.id} m={m} emphasis={last} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
