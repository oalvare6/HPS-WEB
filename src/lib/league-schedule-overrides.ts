import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  SPRING_2026_LEAGUE_ROUNDS,
  formatLeagueDateLong,
  getLeagueScheduleHighlight,
  type LeagueScheduleHighlight,
  type LeagueScheduleRow,
} from "@/lib/spring-2026-league-schedule";

export const LEAGUE_OVERRIDE_CACHE_TAG = "league-round-overrides";

export type LeagueRoundStatus = "scheduled" | "cancelled" | "rescheduled" | "note";

export const LEAGUE_ROUND_STATUSES: LeagueRoundStatus[] = [
  "scheduled",
  "cancelled",
  "rescheduled",
  "note",
];

export type LeagueRoundOverride = {
  date_key: string;
  status: LeagueRoundStatus;
  note: string | null;
  rescheduled_to: string | null;
  updated_at: string;
};

export type EnhancedLeagueRow = LeagueScheduleRow & {
  override: LeagueRoundOverride | null;
  /** "scheduled" when no override row exists. */
  effectiveStatus: LeagueRoundStatus;
  rescheduledToLabel: string | null;
};

async function fetchOverridesRaw(): Promise<Record<string, LeagueRoundOverride>> {
  try {
    const { data, error } = await supabaseAdmin
      .from("league_round_overrides")
      .select("date_key, status, note, rescheduled_to, updated_at");
    if (error) {
      console.error("[league-overrides] fetch failed:", error.message);
      return {};
    }
    const out: Record<string, LeagueRoundOverride> = {};
    for (const row of data ?? []) {
      const r = row as Partial<LeagueRoundOverride> & { date_key?: string };
      if (r.date_key && typeof r.status === "string") {
        out[r.date_key] = {
          date_key: r.date_key,
          status: r.status as LeagueRoundStatus,
          note: typeof r.note === "string" ? r.note : null,
          rescheduled_to: typeof r.rescheduled_to === "string" ? r.rescheduled_to : null,
          updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
        };
      }
    }
    return out;
  } catch (err) {
    console.error("[league-overrides] fetch failed:", err);
    return {};
  }
}

const fetchOverridesCached = unstable_cache(
  fetchOverridesRaw,
  ["league-round-overrides"],
  { revalidate: 60, tags: [LEAGUE_OVERRIDE_CACHE_TAG] }
);

export async function getLeagueOverridesMap(): Promise<Record<string, LeagueRoundOverride>> {
  return fetchOverridesCached();
}

export function mergeRoundsWithOverrides(
  rounds: LeagueScheduleRow[],
  overrides: Record<string, LeagueRoundOverride>
): EnhancedLeagueRow[] {
  return rounds.map((row) => {
    const override = overrides[row.dateKey] ?? null;
    const effectiveStatus: LeagueRoundStatus = override?.status ?? "scheduled";
    const rescheduledToLabel =
      override?.rescheduled_to && /^\d{4}-\d{2}-\d{2}$/.test(override.rescheduled_to)
        ? formatLeagueDateLong(override.rescheduled_to)
        : null;
    return { ...row, override, effectiveStatus, rescheduledToLabel };
  });
}

export async function getEnhancedLeagueSchedule(): Promise<EnhancedLeagueRow[]> {
  const overrides = await getLeagueOverridesMap();
  return mergeRoundsWithOverrides(SPRING_2026_LEAGUE_ROUNDS, overrides);
}

/**
 * Highlight that respects overrides:
 * - Cancelled rounds are never highlighted.
 * - Otherwise mirrors `getLeagueScheduleHighlight` over only the still-active rows.
 */
export function getEnhancedHighlight(
  enhanced: EnhancedLeagueRow[],
  now: Date = new Date()
): LeagueScheduleHighlight {
  const activeRows = enhanced.filter((r) => r.effectiveStatus !== "cancelled");
  if (activeRows.length === 0) {
    return {
      activeIndex: null,
      isToday: false,
      badge: null,
      seasonComplete: true,
      seasonNotStarted: false,
    };
  }
  const baseHighlight = getLeagueScheduleHighlight(now, activeRows);
  if (baseHighlight.activeIndex === null) return baseHighlight;
  const activeRow = activeRows[baseHighlight.activeIndex];
  const fullIndex = enhanced.findIndex((r) => r.id === activeRow.id);
  return { ...baseHighlight, activeIndex: fullIndex === -1 ? null : fullIndex };
}
