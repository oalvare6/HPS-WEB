/**
 * Pure helpers for reading a tournament's schedule: which rounds count, how
 * matches group under rounds, what is next and what was last. Shared by the
 * public hub, the at-a-glance card and the admin panel, so the three cannot
 * disagree about which round is "tonight".
 */
import type {
  MatchWithDetails,
  TournamentMatch,
  TournamentRound,
} from "@/lib/types";
import { todayInHouston } from "@/lib/tournament-state";

type RoundLite = Pick<TournamentRound, "id" | "counts_toward_table">;

/**
 * The one definition of "this match has been played". Status alone is not
 * enough (FOLLOWUPS:78 records completed matches with no score, and scored
 * matches still marked scheduled); a match is played when it says completed AND
 * carries both scores. Every consumer — table, leaderboard, public hub, admin —
 * reads this, so they cannot disagree about whether a result exists.
 */
export function isMatchPlayed(
  m: Pick<TournamentMatch, "status" | "home_score" | "away_score">
): boolean {
  return m.status === "completed" && m.home_score != null && m.away_score != null;
}

/**
 * Whether results in this round move the league table. A missing value
 * (un-migrated database, stale row) means true: every round counts, which is
 * what the site did before the column existed. Never read
 * `counts_toward_table` directly.
 */
export function roundCountsTowardTable(
  r: RoundLite | null | undefined
): boolean {
  if (!r) return true;
  return r.counts_toward_table !== false;
}

export type RoundGroup = {
  /** The round's id, or "unscheduled:<date|none>" for matches with no round. */
  key: string;
  round: TournamentRound | null;
  label: string;
  /** YYYY-MM-DD or null. The round's date, or the shared match date. */
  date: string | null;
  countsTowardTable: boolean;
  matches: MatchWithDetails[];
  playedCount: number;
};

function byMatchOrder(a: MatchWithDetails, b: MatchWithDetails): number {
  const an = a.match_number ?? Number.MAX_SAFE_INTEGER;
  const bn = b.match_number ?? Number.MAX_SAFE_INTEGER;
  if (an !== bn) return an - bn;
  const at = a.kickoff_time ?? "";
  const bt = b.kickoff_time ?? "";
  if (at !== bt) return at.localeCompare(bt);
  return a.sort_order - b.sort_order;
}

function byRoundOrder(a: TournamentRound, b: TournamentRound): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  const ad = a.round_date ?? "9999-12-31";
  const bd = b.round_date ?? "9999-12-31";
  if (ad !== bd) return ad.localeCompare(bd);
  return a.label.localeCompare(b.label);
}

/**
 * Every round in order — empty ones included, so the shape of the season
 * (seven league rounds, semis, exhibition, final) is visible from day one —
 * followed by any matches that have no round, grouped by their own date.
 */
export function groupMatchesByRound(
  rounds: TournamentRound[],
  matches: MatchWithDetails[]
): RoundGroup[] {
  const byRound = new Map<string, MatchWithDetails[]>();
  const orphans: MatchWithDetails[] = [];
  const knownRounds = new Set(rounds.map((r) => r.id));
  for (const m of matches) {
    if (m.round_id && knownRounds.has(m.round_id)) {
      const list = byRound.get(m.round_id) ?? [];
      list.push(m);
      byRound.set(m.round_id, list);
    } else {
      orphans.push(m);
    }
  }

  const groups: RoundGroup[] = [...rounds].sort(byRoundOrder).map((r) => {
    const items = (byRound.get(r.id) ?? []).sort(byMatchOrder);
    return {
      key: r.id,
      round: r,
      label: r.label,
      date: r.round_date,
      countsTowardTable: roundCountsTowardTable(r),
      matches: items,
      playedCount: items.filter(isMatchPlayed).length,
    };
  });

  if (orphans.length > 0) {
    const byDate = new Map<string, MatchWithDetails[]>();
    for (const m of orphans) {
      const k = m.match_date ?? "none";
      const list = byDate.get(k) ?? [];
      list.push(m);
      byDate.set(k, list);
    }
    const dates = Array.from(byDate.keys()).sort((a, b) =>
      a === "none" ? 1 : b === "none" ? -1 : a.localeCompare(b)
    );
    for (const d of dates) {
      const items = (byDate.get(d) ?? []).sort(byMatchOrder);
      groups.push({
        key: `unscheduled:${d}`,
        round: null,
        label: "Unscheduled",
        date: d === "none" ? null : d,
        countsTowardTable: true,
        matches: items,
        playedCount: items.filter(isMatchPlayed).length,
      });
    }
  }

  return groups;
}

/** The most recent group with at least one played match, or null. */
export function lastPlayedRound(groups: RoundGroup[]): RoundGroup | null {
  let last: RoundGroup | null = null;
  for (const g of groups) {
    if (g.playedCount > 0) last = g;
  }
  return last;
}

/**
 * The next group with something still to play: dated today or later, or
 * undated, holding at least one unplayed, uncancelled match. A round that is
 * partly played tonight is still "next".
 */
export function nextMatchday(
  groups: RoundGroup[],
  now: Date = new Date()
): RoundGroup | null {
  const today = todayInHouston(now);
  for (const g of groups) {
    if (g.round?.status === "cancelled") continue;
    if (g.date && g.date < today) continue;
    const pending = g.matches.some(
      (m) => !isMatchPlayed(m) && m.status !== "cancelled"
    );
    if (pending || g.matches.length === 0) return g;
  }
  return null;
}

/**
 * Which groups open by default on the public Matches tab: the next matchday
 * and the last played round (the same group when tonight is half played).
 * Everything else starts collapsed so a phone user is not scrolling October to
 * find tonight.
 */
export function openRoundKeys(
  groups: RoundGroup[],
  now: Date = new Date()
): Set<string> {
  const open = new Set<string>();
  const next = nextMatchday(groups, now);
  const last = lastPlayedRound(groups);
  if (next) open.add(next.key);
  if (last) open.add(last.key);
  if (open.size === 0 && groups[0]) open.add(groups[0].key);
  return open;
}

/** "Fri Sep 11" from YYYY-MM-DD, built as a local date so the day never shifts. */
export function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Kelvin Cardona 3" / "Own goal" — one scorer as the public page prints it. */
export function scorerLabel(s: {
  scorer_name: string;
  goals: number;
  own_goal?: boolean | null;
}): string {
  const name = s.own_goal === true ? "Own goal" : s.scorer_name;
  return s.goals > 1 ? `${name} ${s.goals}` : name;
}
