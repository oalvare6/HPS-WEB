/**
 * Curated Spring 2026 Adult 7v7 Friday schedule (Houston / Central Time).
 * Not stored in DB: one league season, changes rarely — highlight state is derived from the wall clock.
 */

export const LEAGUE_SCHEDULE_TIMEZONE = "America/Chicago";

export type LeagueScheduleRow = {
  id: string;
  label: string;
  /** ISO calendar day YYYY-MM-DD (league Friday in Central Time) */
  dateKey: string;
  /** Break / makeup — different badge when "today" */
  special: boolean;
  note?: string;
};

export const SPRING_2026_LEAGUE_ROUNDS: LeagueScheduleRow[] = [
  { id: "r1", label: "Round 1", dateKey: "2026-03-27", special: false },
  { id: "r2", label: "Round 2", dateKey: "2026-04-03", special: false },
  { id: "r3", label: "Round 3", dateKey: "2026-04-10", special: false },
  { id: "r4", label: "Round 4", dateKey: "2026-04-17", special: false },
  { id: "r5", label: "Round 5", dateKey: "2026-04-24", special: false },
  { id: "r6", label: "Round 6", dateKey: "2026-05-01", special: false },
  { id: "r7", label: "Round 7", dateKey: "2026-05-08", special: false },
  { id: "brk", label: "Break", dateKey: "2026-05-15", special: true },
  { id: "r8", label: "Round 8 (Final)", dateKey: "2026-05-22", special: false },
  { id: "mk", label: "Make-up Round", dateKey: "2026-05-29", special: true, note: "if needed" },
];

function todayKeyChicago(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: LEAGUE_SCHEDULE_TIMEZONE });
}

/** Format YYYY-MM-DD as a long weekday date in Central Time (no off-by-one vs UTC). */
export function formatLeagueDateLong(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const anchorUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return anchorUtc.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: LEAGUE_SCHEDULE_TIMEZONE,
  });
}

export type LeagueScheduleHighlight = {
  /** Index in SPRING_2026_LEAGUE_ROUNDS to emphasize */
  activeIndex: number | null;
  /** True when `activeIndex` is "today" in Chicago */
  isToday: boolean;
  /** Badge text for the active row, or null */
  badge: string | null;
  /** True when today is strictly after the last listed date */
  seasonComplete: boolean;
  /** True before the first listed date */
  seasonNotStarted: boolean;
};

/**
 * Pick at most one highlighted row: today's row if it matches a listed Friday;
 * otherwise the next upcoming Friday; otherwise none (season over or gap).
 */
export function getLeagueScheduleHighlight(
  now: Date = new Date(),
  rows: LeagueScheduleRow[] = SPRING_2026_LEAGUE_ROUNDS
): LeagueScheduleHighlight {
  const today = todayKeyChicago(now);
  const lastKey = rows[rows.length - 1]?.dateKey ?? today;

  if (today < rows[0].dateKey) {
    return {
      activeIndex: 0,
      isToday: false,
      badge: "Next up",
      seasonComplete: false,
      seasonNotStarted: true,
    };
  }

  if (today > lastKey) {
    return {
      activeIndex: null,
      isToday: false,
      badge: null,
      seasonComplete: true,
      seasonNotStarted: false,
    };
  }

  const todayIdx = rows.findIndex((r) => r.dateKey === today);
  if (todayIdx !== -1) {
    const row = rows[todayIdx];
    const badge = row.special ? "This week" : "Tonight";
    return {
      activeIndex: todayIdx,
      isToday: true,
      badge,
      seasonComplete: false,
      seasonNotStarted: false,
    };
  }

  let nextIdx: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].dateKey > today) {
      nextIdx = i;
      break;
    }
  }

  if (nextIdx === null) {
    return {
      activeIndex: null,
      isToday: false,
      badge: null,
      seasonComplete: true,
      seasonNotStarted: false,
    };
  }

  return {
    activeIndex: nextIdx,
    isToday: false,
    badge: "Next up",
    seasonComplete: false,
    seasonNotStarted: false,
  };
}
