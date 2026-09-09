import type { TopScorers } from "@/lib/types";

/**
 * The top-scorer table. Ranks come from `computeTopScorers` (ties share a
 * rank: 3, 3, 5). Own goals are counted below the list, never against a name.
 */
export function ScorersList({ topScorers }: { topScorers: TopScorers }) {
  const { rows, ownGoals } = topScorers;

  if (rows.length === 0) {
    return (
      <div>
        <p className="dashboard-card px-4 py-6 text-center text-sm text-zinc-500">
          The scorer list starts with the first result.
        </p>
        {ownGoals > 0 && (
          <p className="mt-2 text-xs text-zinc-500">Own goals: {ownGoals}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <ol className="dashboard-card divide-y divide-border-token/60 overflow-hidden">
        {rows.map((s) => (
          <li
            key={`${s.contact_id ?? s.scorer_name.toLowerCase()}-${s.team_id ?? "none"}`}
            className="flex items-center gap-3 px-4 py-3"
          >
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums flex-shrink-0 ${
                s.rank === 1 ? "bg-brand text-white" : "bg-surface-2 text-zinc-400"
              }`}
            >
              {s.rank}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-white font-medium truncate block">{s.scorer_name}</span>
              {s.team_name && (
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 min-w-0 max-w-full">
                  <span
                    aria-hidden
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: s.team_color || "#3f3f46" }}
                  />
                  <span className="truncate">{s.team_name}</span>
                </span>
              )}
            </div>
            <span className="font-mono font-bold text-white tabular-nums flex-shrink-0 text-lg">
              {s.goals}
              <span className="sr-only"> {s.goals === 1 ? "goal" : "goals"}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-2 space-y-0.5 text-xs text-zinc-500">
        {ownGoals > 0 && <p>Own goals: {ownGoals}</p>}
        <p>All matches, including playoffs.</p>
      </div>
    </div>
  );
}
