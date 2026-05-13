import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  Tournament,
  TournamentRound,
  TournamentUpdate,
} from "@/lib/types";

/** Shown when Supabase/env fails; distinct from an legitimately empty tournament list. */
export const TOURNAMENTS_LOAD_USER_MESSAGE =
  "We couldn't load events right now. Please refresh the page or try again in a few minutes.";

export type PublicTournamentsResult = {
  tournaments: Tournament[];
  /** Non-null when the request failed (not the same as zero tournaments). */
  loadError: string | null;
};

export type FeaturedTournamentsResult = {
  tournaments: Tournament[];
  /** Non-null when the featured query failed. */
  loadError: string | null;
};

export type RecentEventsResult = {
  tournaments: Tournament[];
  loadError: string | null;
};

export type TournamentUpdatesResult = {
  updates: TournamentUpdate[];
  loadError: string | null;
};

export type TournamentRoundsResult = {
  rounds: TournamentRound[];
  loadError: string | null;
};

export async function getPublicTournaments(): Promise<PublicTournamentsResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .neq("status", "cancelled")
      .order("display_order", { ascending: true })
      .order("start_date", { ascending: true });

    if (error) {
      console.error("[tournaments] fetch failed:", error.message, error);
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    return { tournaments: (data ?? []) as Tournament[], loadError: null };
  } catch (err) {
    console.error("[tournaments] fetch failed:", err);
    return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
  }
}

/**
 * Tournaments currently accepting registrations. Used by `/register` to
 * populate the tournament selector and by the registration API to validate
 * a posted tournament_id.
 */
export async function getRegistrationOpenTournaments(): Promise<PublicTournamentsResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("registration_open", true)
      .neq("status", "cancelled")
      .order("display_order", { ascending: true })
      .order("start_date", { ascending: true });

    if (error) {
      console.error("[tournaments] open fetch failed:", error.message, error);
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    return { tournaments: (data ?? []) as Tournament[], loadError: null };
  } catch (err) {
    console.error("[tournaments] open fetch failed:", err);
    return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
  }
}

/**
 * Tournaments currently accepting payments. Used by `/pay` to validate amount
 * and link the payment back to a tournament.
 */
export async function getPaymentsOpenTournaments(): Promise<PublicTournamentsResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("payments_open", true)
      .neq("status", "cancelled")
      .order("display_order", { ascending: true })
      .order("start_date", { ascending: true });

    if (error) {
      console.error("[tournaments] payments-open fetch failed:", error.message, error);
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    return { tournaments: (data ?? []) as Tournament[], loadError: null };
  } catch (err) {
    console.error("[tournaments] payments-open fetch failed:", err);
    return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
  }
}

/**
 * Fetch a single tournament by id.
 */
export async function getTournamentById(id: string): Promise<Tournament | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[tournaments] by-id failed:", error.message);
      return null;
    }
    return (data as Tournament) ?? null;
  } catch (err) {
    console.error("[tournaments] by-id failed:", err);
    return null;
  }
}

/**
 * Returns up to 3 tournaments to show in the homepage hero carousel:
 *   1. Admin-pinned (`is_featured = true`), in display_order/start_date order.
 *   2. Fallback when nothing is pinned: the next single tournament with
 *      status in ('upcoming', 'ongoing'), ordered by start_date asc. This
 *      keeps the hero from going empty while there's anything active or
 *      coming up. Registration-open is intentionally NOT required so an
 *      ongoing tournament with closed sign-ups still surfaces.
 */
export async function getFeaturedTournaments(): Promise<FeaturedTournamentsResult> {
  try {
    const { data: pinned, error: pinnedErr } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("is_featured", true)
      .neq("status", "cancelled")
      .order("display_order", { ascending: true })
      .order("start_date", { ascending: true })
      .limit(3);

    if (pinnedErr) {
      console.error("[tournaments] featured fetch failed:", pinnedErr.message, pinnedErr);
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }

    if (pinned && pinned.length > 0) {
      return { tournaments: pinned as Tournament[], loadError: null };
    }

    const { data: fallback, error: fallbackErr } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .in("status", ["upcoming", "ongoing"])
      .order("start_date", { ascending: true })
      .limit(1);

    if (fallbackErr) {
      console.error(
        "[tournaments] featured fallback fetch failed:",
        fallbackErr.message,
        fallbackErr
      );
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    return { tournaments: (fallback ?? []) as Tournament[], loadError: null };
  } catch (err) {
    console.error("[tournaments] featured fetch failed:", err);
    return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
  }
}

/** Single tournament by slug for the public detail page. Returns null on miss. */
export async function getTournamentBySlug(slug: string): Promise<Tournament | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      console.error("[tournaments] slug fetch failed:", error.message, error);
      return null;
    }
    return (data as Tournament | null) ?? null;
  } catch (err) {
    console.error("[tournaments] slug fetch failed:", err);
    return null;
  }
}

/** Pinned first, then newest first. Empty array if none or on error. */
export async function getTournamentUpdates(
  tournamentId: string
): Promise<TournamentUpdatesResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournament_updates")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[tournament_updates] fetch failed:", error.message, error);
      return { updates: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    return { updates: (data ?? []) as TournamentUpdate[], loadError: null };
  } catch (err) {
    console.error("[tournament_updates] fetch failed:", err);
    return { updates: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
  }
}

/**
 * Up to N most-recently-completed tournaments, for the "Recent Events" home
 * section. Returns an empty array when there are none (caller hides the section).
 */
export async function getRecentEvents(limit = 3): Promise<RecentEventsResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("status", "completed")
      .order("start_date", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[tournaments] recent fetch failed:", error.message, error);
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    return { tournaments: (data ?? []) as Tournament[], loadError: null };
  } catch (err) {
    console.error("[tournaments] recent fetch failed:", err);
    return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
  }
}

/**
 * Rounds for a tournament, sorted by sort_order then date. Empty array on
 * miss/error so callers can render an "No schedule yet" empty state.
 */
export async function getTournamentRounds(
  tournamentId: string
): Promise<TournamentRoundsResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournament_rounds")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true })
      .order("round_date", { ascending: true });
    if (error) {
      console.error("[tournament_rounds] fetch failed:", error.message, error);
      return { rounds: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    return { rounds: (data ?? []) as TournamentRound[], loadError: null };
  } catch (err) {
    console.error("[tournament_rounds] fetch failed:", err);
    return { rounds: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
  }
}

/**
 * Counts of recent updates per tournament (last 7 days), keyed by tournament_id.
 * Used by the admin hub badge. Returns empty map on error.
 */
export async function getRecentUpdateCountsByTournament(): Promise<{
  total: number;
  byTournament: Record<string, number>;
}> {
  try {
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("tournament_updates")
      .select("tournament_id, created_at")
      .gte("created_at", sinceIso);
    if (error) {
      console.error("[tournament_updates] recent counts failed:", error.message);
      return { total: 0, byTournament: {} };
    }
    const byTournament: Record<string, number> = {};
    for (const row of (data ?? []) as { tournament_id: string }[]) {
      byTournament[row.tournament_id] = (byTournament[row.tournament_id] ?? 0) + 1;
    }
    return { total: data?.length ?? 0, byTournament };
  } catch (err) {
    console.error("[tournament_updates] recent counts failed:", err);
    return { total: 0, byTournament: {} };
  }
}
