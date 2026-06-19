"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ListChecks, Table2, Trophy } from "lucide-react";
import type {
  MatchWithDetails,
  ScorerRow,
  StandingsRow,
  TournamentRound,
} from "@/lib/types";

type TabKey = "schedule" | "results" | "standings" | "scorers";

type Props = {
  matches: MatchWithDetails[];
  rounds: TournamentRound[];
  standings: StandingsRow[];
  topScorers: ScorerRow[];
};

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

function TeamLabel({
  name,
  color,
  align = "left",
  strong = false,
}: {
  name: string;
  color: string | null;
  align?: "left" | "right";
  strong?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 min-w-0 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/10"
        style={{ backgroundColor: color || "#3f3f46" }}
      />
      <span className={`truncate ${strong ? "text-white font-semibold" : "text-zinc-200"}`}>
        {name}
      </span>
    </span>
  );
}

function ScorerList({ goals }: { goals: { scorer_name: string; goals: number }[] }) {
  if (goals.length === 0) return null;
  return (
    <span className="text-xs text-zinc-400">
      {goals
        .map((g) => (g.goals > 1 ? `${g.scorer_name} ${g.goals}` : g.scorer_name))
        .join(", ")}
    </span>
  );
}

export function TournamentHub({ matches, rounds, standings, topScorers }: Props) {
  const completed = useMemo(
    () => matches.filter((m) => m.status === "completed" && m.home_score != null),
    [matches]
  );
  const hasStandings = standings.some((r) => r.played > 0);
  const hasScorers = topScorers.length > 0;

  const tabs = useMemo(() => {
    const list: { key: TabKey; label: string; icon: typeof CalendarDays }[] = [];
    if (matches.length > 0 || rounds.length > 0) {
      list.push({ key: "schedule", label: "Schedule", icon: CalendarDays });
    }
    if (completed.length > 0) {
      list.push({ key: "results", label: "Results", icon: ListChecks });
    }
    if (hasStandings) {
      list.push({ key: "standings", label: "Standings", icon: Table2 });
    }
    if (hasScorers) {
      list.push({ key: "scorers", label: "Top Scorers", icon: Trophy });
    }
    return list;
  }, [matches.length, rounds.length, completed.length, hasStandings, hasScorers]);

  const defaultTab: TabKey = hasStandings
    ? "standings"
    : tabs[0]?.key ?? "schedule";
  const [active, setActive] = useState<TabKey>(defaultTab);

  if (tabs.length === 0) return null;
  const activeTab = tabs.some((t) => t.key === active) ? active : tabs[0].key;

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border-token mb-5 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = t.key === activeTab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                on
                  ? "border-brand text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Icon size={15} className={on ? "text-brand" : ""} />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "schedule" && (
        <ScheduleTab matches={matches} rounds={rounds} />
      )}
      {activeTab === "results" && <ResultsTab matches={completed} />}
      {activeTab === "standings" && <StandingsTab standings={standings} />}
      {activeTab === "scorers" && <ScorersTab scorers={topScorers} />}
    </div>
  );
}

function ScheduleTab({
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
    const ordered: { key: string; label: string; date: string | null; items: MatchWithDetails[] }[] =
      [];
    for (const r of rounds) {
      const items = byRound.get(r.id);
      if (items && items.length > 0) {
        ordered.push({ key: r.id, label: r.label, date: r.round_date, items });
      }
    }
    if (noRound.length > 0) {
      ordered.push({ key: "none", label: "Fixtures", date: null, items: noRound });
    }
    return ordered;
  }, [matches, rounds]);

  if (matches.length === 0) {
    return (
      <p className="text-sm text-zinc-500 italic">
        The match schedule will appear here once it&apos;s posted.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-sm font-semibold text-white">{g.label}</h3>
            {g.date && (
              <span className="text-xs text-zinc-500">{formatDate(g.date)}</span>
            )}
          </div>
          <ul className="dashboard-card divide-y divide-border-token overflow-hidden">
            {g.items.map((m) => {
              const home = m.home_team?.name ?? m.home_team_label ?? "TBD";
              const away = m.away_team?.name ?? m.away_team_label ?? "TBD";
              const done = m.status === "completed" && m.home_score != null;
              return (
                <li key={m.id} className="px-4 py-3">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <TeamLabel
                      name={home}
                      color={m.home_team?.color ?? null}
                      align="right"
                      strong={done && (m.home_score ?? 0) >= (m.away_score ?? 0)}
                    />
                    <div className="text-center flex-shrink-0">
                      {done ? (
                        <span className="font-mono font-bold text-white tabular-nums">
                          {m.home_score} <span className="text-zinc-600">–</span>{" "}
                          {m.away_score}
                        </span>
                      ) : m.status === "postponed" ? (
                        <span className="text-xs font-mono uppercase tracking-wider text-yellow-300 bg-yellow-500/10 px-2 py-0.5 rounded">
                          PPD
                        </span>
                      ) : m.status === "cancelled" ? (
                        <span className="text-xs font-mono uppercase tracking-wider text-red-300 bg-red-500/10 px-2 py-0.5 rounded">
                          Cxl
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500 font-mono">
                          {m.kickoff_time || "vs"}
                        </span>
                      )}
                    </div>
                    <TeamLabel
                      name={away}
                      color={m.away_team?.color ?? null}
                      align="left"
                      strong={done && (m.away_score ?? 0) >= (m.home_score ?? 0)}
                    />
                  </div>
                  {m.notes && (
                    <p className="text-xs text-zinc-500 text-center mt-1.5">{m.notes}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ResultsTab({ matches }: { matches: MatchWithDetails[] }) {
  return (
    <div className="space-y-3">
      {matches.map((m) => {
        const homeGoals = m.scorers.filter((g) => g.team_id === m.home_team_id);
        const awayGoals = m.scorers.filter((g) => g.team_id === m.away_team_id);
        const homeWin = (m.home_score ?? 0) > (m.away_score ?? 0);
        const awayWin = (m.away_score ?? 0) > (m.home_score ?? 0);
        return (
          <div key={m.id} className="dashboard-card p-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="text-right min-w-0">
                <TeamLabel
                  name={m.home_team?.name ?? m.home_team_label ?? "TBD"}
                  color={m.home_team?.color ?? null}
                  align="right"
                  strong={homeWin}
                />
                <div className="mt-1">
                  <ScorerList goals={homeGoals} />
                </div>
              </div>
              <div className="text-center flex-shrink-0 px-2">
                <span className="font-mono text-2xl font-bold text-white tabular-nums">
                  {m.home_score}
                  <span className="text-zinc-600 mx-1">–</span>
                  {m.away_score}
                </span>
                {m.match_date && (
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">
                    {formatDate(m.match_date)}
                  </div>
                )}
              </div>
              <div className="text-left min-w-0">
                <TeamLabel
                  name={m.away_team?.name ?? m.away_team_label ?? "TBD"}
                  color={m.away_team?.color ?? null}
                  align="left"
                  strong={awayWin}
                />
                <div className="mt-1">
                  <ScorerList goals={awayGoals} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StandingsTab({ standings }: { standings: StandingsRow[] }) {
  return (
    <div className="dashboard-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs font-mono uppercase tracking-wider text-zinc-500 border-b border-border-token">
            <th className="text-left font-medium px-4 py-3 w-8">#</th>
            <th className="text-left font-medium px-2 py-3">Team</th>
            <th className="text-center font-medium px-2 py-3" title="Played">P</th>
            <th className="text-center font-medium px-2 py-3" title="Won">W</th>
            <th className="text-center font-medium px-2 py-3" title="Drawn">D</th>
            <th className="text-center font-medium px-2 py-3" title="Lost">L</th>
            <th className="text-center font-medium px-2 py-3 hidden sm:table-cell" title="Goals for">
              GF
            </th>
            <th className="text-center font-medium px-2 py-3 hidden sm:table-cell" title="Goals against">
              GA
            </th>
            <th className="text-center font-medium px-2 py-3" title="Goal difference">GD</th>
            <th className="text-center font-semibold px-4 py-3 text-zinc-300" title="Points">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((r, i) => (
            <tr
              key={r.team_id}
              className="border-b border-border-token/60 last:border-0 hover:bg-surface-2/40 transition-colors"
            >
              <td className="px-4 py-3 text-zinc-500 font-mono">{i + 1}</td>
              <td className="px-2 py-3">
                <TeamLabel name={r.team_name} color={r.team_color} strong />
              </td>
              <td className="text-center px-2 py-3 text-zinc-300 tabular-nums">{r.played}</td>
              <td className="text-center px-2 py-3 text-zinc-300 tabular-nums">{r.won}</td>
              <td className="text-center px-2 py-3 text-zinc-300 tabular-nums">{r.drawn}</td>
              <td className="text-center px-2 py-3 text-zinc-300 tabular-nums">{r.lost}</td>
              <td className="text-center px-2 py-3 text-zinc-400 tabular-nums hidden sm:table-cell">
                {r.goals_for}
              </td>
              <td className="text-center px-2 py-3 text-zinc-400 tabular-nums hidden sm:table-cell">
                {r.goals_against}
              </td>
              <td className="text-center px-2 py-3 text-zinc-300 tabular-nums">
                {r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference}
              </td>
              <td className="text-center px-4 py-3 font-bold text-white tabular-nums">
                {r.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScorersTab({ scorers }: { scorers: ScorerRow[] }) {
  const top = scorers[0]?.goals ?? 0;
  return (
    <ul className="dashboard-card divide-y divide-border-token overflow-hidden">
      {scorers.map((s, i) => (
        <li
          key={`${s.scorer_name}-${s.team_id ?? "none"}`}
          className="flex items-center gap-3 px-4 py-3"
        >
          <span
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              i === 0 && s.goals === top
                ? "bg-brand text-white"
                : "bg-surface-2 text-zinc-400"
            }`}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-white font-medium truncate block">{s.scorer_name}</span>
            {s.team_name && (
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.team_color || "#3f3f46" }}
                />
                {s.team_name}
              </span>
            )}
          </div>
          <span className="font-mono font-bold text-white tabular-nums flex-shrink-0">
            {s.goals}
            <span className="text-zinc-500 text-xs font-normal ml-1">
              {s.goals === 1 ? "goal" : "goals"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
