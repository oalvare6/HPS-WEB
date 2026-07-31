"use client";

import * as ScrollArea from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";
import type { StandingsRow } from "@/lib/types";

export type FormResult = "W" | "D" | "L";

const FORM_STYLE: Record<FormResult, string> = {
  W: "bg-green-500/20 text-green-400",
  D: "bg-zinc-500/20 text-zinc-400",
  L: "bg-red-500/20 text-red-400",
};

function FormGuide({ results }: { results: FormResult[] }) {
  if (results.length === 0) return <span className="text-zinc-600">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {results.map((r, i) => (
        <span
          key={i}
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold",
            FORM_STYLE[r]
          )}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

/**
 * League table with a sticky team column inside a horizontal scroll area so
 * GF/GA/form survive on small screens, qualification-zone tinting, and an
 * optional caption + footnote (used for the World Cup double-points rule).
 */
export function StandingsTab({
  standings,
  form,
  qualificationSpots = 0,
  qualificationLabel,
  caption,
  footnote,
}: {
  standings: StandingsRow[];
  form?: Map<string, FormResult[]>;
  qualificationSpots?: number;
  qualificationLabel?: string | null;
  caption?: string | null;
  footnote?: string | null;
}) {
  const hasForm = !!form && standings.some((r) => (form.get(r.team_id) ?? []).length > 0);

  return (
    <div>
      {caption && (
        <p className="mb-2.5 text-xs font-mono uppercase tracking-[0.18em] text-zinc-400">
          {caption}
        </p>
      )}

      <ScrollArea.Root type="auto" className="dashboard-card overflow-hidden">
        <ScrollArea.Viewport className="w-full">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-xs font-mono uppercase tracking-wider text-zinc-500 border-b border-border-token">
                <th className="sticky left-0 z-10 bg-surface text-left font-medium pl-4 pr-2 py-3">
                  Team
                </th>
                <th className="text-center font-medium px-2 py-3" title="Played">P</th>
                <th className="text-center font-medium px-2 py-3" title="Won">W</th>
                <th className="text-center font-medium px-2 py-3" title="Drawn">D</th>
                <th className="text-center font-medium px-2 py-3" title="Lost">L</th>
                <th className="text-center font-medium px-2 py-3" title="Goals for">GF</th>
                <th className="text-center font-medium px-2 py-3" title="Goals against">GA</th>
                <th className="text-center font-medium px-2 py-3" title="Goal difference">GD</th>
                {hasForm && (
                  <th className="text-center font-medium px-3 py-3" title="Last five results">
                    Form
                  </th>
                )}
                <th className="text-center font-semibold px-4 py-3 text-zinc-300" title="Points">
                  Pts
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((r, i) => {
                const qualifies = qualificationSpots > 0 && i < qualificationSpots;
                return (
                  <tr
                    key={r.team_id}
                    className={cn(
                      "border-b border-border-token/60 last:border-0 transition-colors",
                      qualifies ? "bg-brand/[0.05] hover:bg-brand/[0.09]" : "hover:bg-surface-2/40"
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-surface pl-4 pr-2 py-3">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={cn(
                            "w-5 flex-shrink-0 text-right font-mono text-xs tabular-nums",
                            qualifies ? "text-brand font-bold" : "text-zinc-500"
                          )}
                        >
                          {i + 1}
                        </span>
                        <span
                          aria-hidden
                          className="h-4 w-1 rounded-full flex-shrink-0"
                          style={{ backgroundColor: r.team_color || "#3f3f46" }}
                        />
                        <span className="truncate font-condensed uppercase tracking-wide text-[15px] text-white font-semibold">
                          {r.team_name}
                        </span>
                      </span>
                    </td>
                    <td className="text-center px-2 py-3 text-zinc-300 tabular-nums">{r.played}</td>
                    <td className="text-center px-2 py-3 text-zinc-300 tabular-nums">{r.won}</td>
                    <td className="text-center px-2 py-3 text-zinc-300 tabular-nums">{r.drawn}</td>
                    <td className="text-center px-2 py-3 text-zinc-300 tabular-nums">{r.lost}</td>
                    <td className="text-center px-2 py-3 text-zinc-400 tabular-nums">{r.goals_for}</td>
                    <td className="text-center px-2 py-3 text-zinc-400 tabular-nums">{r.goals_against}</td>
                    <td className="text-center px-2 py-3 text-zinc-300 tabular-nums">
                      {r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}
                    </td>
                    {hasForm && (
                      <td className="text-center px-3 py-3">
                        <FormGuide results={form?.get(r.team_id) ?? []} />
                      </td>
                    )}
                    <td className="text-center px-4 py-3 font-bold text-white tabular-nums text-base">
                      {r.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          orientation="horizontal"
          className="flex h-2 touch-none select-none bg-surface-2/50 p-0.5"
        >
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-zinc-600" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      <div className="mt-2.5 space-y-1 text-xs text-zinc-500">
        {qualificationSpots > 0 && (
          <p className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-brand/40 flex-shrink-0" />
            {qualificationLabel ?? `Top ${qualificationSpots} advance to the knockout round`}
          </p>
        )}
        {footnote && <p>{footnote}</p>}
      </div>
    </div>
  );
}
