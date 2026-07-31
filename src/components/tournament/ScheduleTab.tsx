"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import type { MatchWithDetails, TournamentRound } from "@/lib/types";
import { Scoreline } from "./Scoreline";
import { chip, formatMatchDate, TeamMark } from "./primitives";

type RoundGroup = {
  key: string;
  label: string;
  date: string | null;
  items: MatchWithDetails[];
};

function MatchRow({ m }: { m: MatchWithDetails }) {
  const home = m.home_team?.name ?? m.home_team_label ?? "TBD";
  const away = m.away_team?.name ?? m.away_team_label ?? "TBD";
  const done = m.status === "completed" && m.home_score != null;
  return (
    <li className="px-4 py-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamMark
          name={home}
          color={m.home_team?.color ?? null}
          align="right"
          strong={done && (m.home_score ?? 0) >= (m.away_score ?? 0)}
        />
        <div className="text-center flex-shrink-0 min-w-14">
          {done ? (
            <Scoreline home={m.home_score} away={m.away_score} size="sm" />
          ) : m.status === "postponed" ? (
            <span className={chip({ tone: "warn" })}>PPD</span>
          ) : m.status === "cancelled" ? (
            <span className={chip({ tone: "danger" })}>CXL</span>
          ) : (
            <span className="text-xs text-zinc-500 font-mono">
              {m.kickoff_time || "vs"}
            </span>
          )}
        </div>
        <TeamMark
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
}

function RoundSection({ group }: { group: RoundGroup }) {
  const finished = group.items.every(
    (m) => m.status === "completed" || m.status === "cancelled"
  );
  return (
    <details open={!finished} className="group/round">
      <summary className="sticky top-[4.5rem] md:top-[5.5rem] z-10 flex cursor-pointer select-none items-center justify-between gap-3 rounded-lg border border-border-token/60 bg-surface/95 px-4 py-2.5 backdrop-blur-sm list-none [&::-webkit-details-marker]:hidden">
        <span className="font-condensed uppercase tracking-wider text-[15px] text-white">
          {group.label}
        </span>
        <span className="flex items-center gap-2.5 text-xs text-zinc-500">
          {group.date && <span className="font-mono">{formatMatchDate(group.date)}</span>}
          {finished && <span className={chip({ tone: "neutral" })}>Played</span>}
          <ChevronDown
            size={14}
            className="transition-transform group-open/round:rotate-180"
          />
        </span>
      </summary>
      <ul className="mt-2 mb-1 rounded-xl border border-border-token/60 bg-surface/70 divide-y divide-border-token/50 overflow-hidden">
        {group.items.map((m) => (
          <MatchRow key={m.id} m={m} />
        ))}
      </ul>
    </details>
  );
}

/**
 * Fixture list grouped under a sticky round/date rail. Rounds that are fully
 * played collapse by default so upcoming fixtures lead the page.
 */
export function ScheduleTab({
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
    const ordered: RoundGroup[] = [];
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
      <div className="rounded-xl border border-dashed border-border-token/70 bg-surface/50 px-5 py-8 text-center">
        <p className="text-sm font-semibold text-white">No fixtures posted yet</p>
        <p className="mt-1 text-sm text-zinc-400">
          The schedule goes up here as soon as the bracket is set.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <RoundSection key={g.key} group={g} />
      ))}
    </div>
  );
}
