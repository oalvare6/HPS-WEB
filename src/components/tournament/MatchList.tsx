import { ChevronDown } from "lucide-react";
import type { MatchWithDetails, TournamentRound } from "@/lib/types";
import { formatShortDate, isMatchPlayed, type RoundGroup } from "@/lib/schedule";
import { roundAnchorId } from "./hub-tab";
import { ScorerList, TeamLabel } from "./primitives";

function timeRangeOf(r: Pick<TournamentRound, "time_start" | "time_end"> | null): string | null {
  if (!r) return null;
  if (r.time_start && r.time_end) return `${r.time_start} – ${r.time_end}`;
  return r.time_start || r.time_end || null;
}

/**
 * One round's header: label, date, time range, whether it counts, its status
 * and note. Rendered inside a `<summary>` so the whole strip is the tap target.
 * Also used on pre-season pages where the rounds exist but no match does.
 */
export function RoundHeader({ group }: { group: RoundGroup }) {
  const r = group.round;
  const cancelled = r?.status === "cancelled";
  const rescheduled = r?.status === "rescheduled";
  const date = formatShortDate(group.date) ?? "Date TBA";
  const time = timeRangeOf(r);
  const total = group.matches.length;
  const played = group.playedCount;
  const countLabel =
    total === 0
      ? null
      : played === 0
        ? `${total} ${total === 1 ? "match" : "matches"}`
        : played < total
          ? `${played} of ${total} played`
          : `${total} played`;

  // Spans throughout: this renders inside a <summary>, whose content model is
  // phrasing content, so no div or p.
  return (
    <span className="flex items-center justify-between gap-3 min-w-0 flex-1">
      <span className="block min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          <span
            className={`font-semibold ${
              cancelled ? "text-zinc-500 line-through" : "text-white"
            }`}
          >
            {group.label}
          </span>
          {cancelled && (
            <span className="text-[11px] font-mono bg-red-500/20 text-red-300 px-2 py-0.5 rounded uppercase tracking-wider">
              Cancelled
            </span>
          )}
          {rescheduled && (
            <span className="text-[11px] font-mono bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded uppercase tracking-wider">
              Rescheduled
            </span>
          )}
        </span>
        <span className="text-xs text-zinc-400 mt-0.5 flex flex-wrap gap-x-2">
          <span className={cancelled ? "line-through" : ""}>{date}</span>
          {time && (
            <>
              <span aria-hidden className="text-zinc-600">·</span>
              <span>{time}</span>
            </>
          )}
          {rescheduled && r?.rescheduled_to && (
            <>
              <span aria-hidden className="text-zinc-600">·</span>
              <span className="text-yellow-300">
                now {formatShortDate(r.rescheduled_to) ?? r.rescheduled_to}
              </span>
            </>
          )}
        </span>
        {!group.countsTowardTable && (
          <span className="block text-[11px] text-zinc-500 mt-0.5">
            Does not count toward the table
          </span>
        )}
      </span>
      {countLabel && (
        <span className="text-xs text-zinc-500 whitespace-nowrap flex-shrink-0">
          {countLabel}
        </span>
      )}
    </span>
  );
}

function StatusPill({ status }: { status: MatchWithDetails["status"] }) {
  if (status === "postponed") {
    return (
      <span className="inline-block text-[11px] font-semibold text-yellow-300 bg-yellow-500/10 px-1.5 py-0.5 rounded">
        Postponed
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-block text-[11px] font-semibold text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded">
        Cancelled
      </span>
    );
  }
  return null;
}

function Side({
  name,
  color,
  placeholder,
  score,
  winner,
  scorers,
  muted,
}: {
  name: string;
  color: string | null;
  placeholder: boolean;
  score: number | null;
  winner: boolean;
  scorers: MatchWithDetails["scorers"];
  muted: boolean;
}) {
  return (
    <div className={muted ? "opacity-60" : ""}>
      <div className="flex items-baseline justify-between gap-3">
        <TeamLabel
          name={name}
          color={color}
          strong={winner}
          placeholder={placeholder}
          className="flex-1"
        />
        {score != null && (
          <span
            className={`font-mono text-lg leading-none tabular-nums flex-shrink-0 ${
              winner ? "font-bold text-white" : "font-semibold text-zinc-300"
            }`}
          >
            {score}
          </span>
        )}
      </div>
      {scorers.length > 0 && (
        <p className="pl-[18px] leading-snug">
          <ScorerList goals={scorers} />
        </p>
      )}
    </div>
  );
}

function MatchRow({ m, groupDate }: { m: MatchWithDetails; groupDate: string | null }) {
  const played = isMatchPlayed(m);
  const homeName = m.home_team?.name ?? m.home_team_label ?? "TBD";
  const awayName = m.away_team?.name ?? m.away_team_label ?? "TBD";
  const homePlaceholder = !m.home_team;
  const awayPlaceholder = !m.away_team;
  const homeWin = played && (m.home_score as number) > (m.away_score as number);
  const awayWin = played && (m.away_score as number) > (m.home_score as number);
  const homeGoals = played
    ? m.scorers.filter((g) => g.team_id != null && g.team_id === m.home_team_id)
    : [];
  const awayGoals = played
    ? m.scorers.filter((g) => g.team_id != null && g.team_id === m.away_team_id)
    : [];
  const cancelled = m.status === "cancelled";
  const postponed = m.status === "postponed";
  const movedTo =
    postponed && m.match_date && m.match_date !== groupDate
      ? formatShortDate(m.match_date)
      : null;

  return (
    <li className="px-4 py-3">
      <div className="flex gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <Side
            name={homeName}
            color={m.home_team?.color ?? null}
            placeholder={homePlaceholder}
            score={played ? m.home_score : null}
            winner={homeWin}
            scorers={homeGoals}
            muted={cancelled}
          />
          <Side
            name={awayName}
            color={m.away_team?.color ?? null}
            placeholder={awayPlaceholder}
            score={played ? m.away_score : null}
            winner={awayWin}
            scorers={awayGoals}
            muted={cancelled}
          />
        </div>
        <div className="flex-shrink-0 w-[4.25rem] flex flex-col items-end justify-center gap-1 text-right">
          {!played &&
            (postponed || cancelled ? (
              <StatusPill status={m.status} />
            ) : (
              <span className="text-xs font-mono text-zinc-300 whitespace-nowrap">
                {m.kickoff_time || "TBA"}
              </span>
            ))}
          {m.match_number != null && (
            <span className="text-[10px] font-mono text-zinc-600 tabular-nums">
              #{m.match_number}
            </span>
          )}
        </div>
      </div>
      {movedTo && (
        <p className="text-xs text-yellow-300/90 mt-1.5">Now {movedTo}</p>
      )}
      {m.notes && <p className="text-xs text-zinc-500 mt-1.5">{m.notes}</p>}
    </li>
  );
}

type Props = {
  groups: RoundGroup[];
  /** Group keys that start expanded; everything else starts collapsed. */
  openKeys: Set<string>;
};

/**
 * Every round in season order as a native `<details>`, matches stacked home
 * over away with the score or kickoff at the right. No JavaScript is needed to
 * open or close a round, so this renders on the server and inside the client
 * hub alike.
 */
export function MatchList({ groups, openKeys }: Props) {
  if (groups.length === 0) {
    return (
      <p className="dashboard-card px-4 py-6 text-center text-sm text-zinc-500">
        The match schedule will appear here once it is posted.
      </p>
    );
  }

  // Anchor ids come from labels; two groups with the same label (or several
  // "Unscheduled" buckets) get a numeric suffix rather than a duplicate id.
  const seen = new Map<string, number>();
  const anchorFor = (g: RoundGroup) => {
    const base = roundAnchorId(g.round ? g.label : `${g.label}-${g.date ?? "tbd"}`);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const cancelledRound = g.round?.status === "cancelled";
        return (
          <details
            key={g.key}
            id={anchorFor(g)}
            open={openKeys.has(g.key)}
            className={`group dashboard-card overflow-hidden scroll-mt-24 ${
              cancelledRound ? "opacity-80" : ""
            }`}
          >
            <summary className="flex items-center gap-3 px-4 py-2.5 min-h-[44px] cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden hover:bg-surface-2/40 transition-colors">
              <RoundHeader group={g} />
              <ChevronDown
                size={16}
                aria-hidden
                className="flex-shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
              />
            </summary>
            {g.round?.note && (
              <p className="px-4 pb-2.5 -mt-0.5 text-xs text-zinc-400">{g.round.note}</p>
            )}
            {g.matches.length === 0 ? (
              <p className="border-t border-border-token px-4 py-3 text-sm text-zinc-500 italic">
                Fixtures to be confirmed
              </p>
            ) : (
              <ul className="border-t border-border-token divide-y divide-border-token/60">
                {g.matches.map((m) => (
                  <MatchRow key={m.id} m={m} groupDate={g.date} />
                ))}
              </ul>
            )}
          </details>
        );
      })}
    </div>
  );
}
