import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  acceptsPayments,
  acceptsRegistrations,
  isPastEvent,
  resolveEventState,
} from "@/lib/tournament-state";
import type {
  MatchScorer,
  MatchWithDetails,
  Team,
  Tournament,
  TournamentMatch,
  TournamentRound,
  TournamentStatus,
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

export type TournamentMatchesResult = {
  matches: MatchWithDetails[];
  teams: Pick<Team, "id" | "name" | "color">[];
  loadError: string | null;
};

export async function getPublicTournaments(): Promise<PublicTournamentsResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("is_draft", false)
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
      .eq("is_draft", false)
      .neq("status", "cancelled")
      .order("display_order", { ascending: true })
      .order("start_date", { ascending: true });

    if (error) {
      console.error("[tournaments] open fetch failed:", error.message, error);
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    const open = ((data ?? []) as Tournament[]).filter((t) => acceptsRegistrations(t));
    return { tournaments: open, loadError: null };
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
      .eq("is_draft", false)
      .neq("status", "cancelled")
      .order("display_order", { ascending: true })
      .order("start_date", { ascending: true });

    if (error) {
      console.error("[tournaments] payments-open fetch failed:", error.message, error);
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    const payable = ((data ?? []) as Tournament[]).filter((t) => acceptsPayments(t));
    return { tournaments: payable, loadError: null };
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
      .eq("is_draft", false)
      .neq("status", "cancelled")
      .order("display_order", { ascending: true })
      .order("start_date", { ascending: true })
      .limit(3);

    if (pinnedErr) {
      console.error("[tournaments] featured fetch failed:", pinnedErr.message, pinnedErr);
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }

    // A pinned event that has already happened must not headline the homepage,
    // however long it stays flagged as featured.
    const livePinned = ((pinned ?? []) as Tournament[]).filter((t) => !isPastEvent(t));
    if (livePinned.length > 0) {
      return { tournaments: livePinned, loadError: null };
    }

    const { data: fallback, error: fallbackErr } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("is_draft", false)
      .in("status", ["upcoming", "ongoing"])
      .order("start_date", { ascending: true });

    if (fallbackErr) {
      console.error(
        "[tournaments] featured fallback fetch failed:",
        fallbackErr.message,
        fallbackErr
      );
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    const nextUp = ((fallback ?? []) as Tournament[])
      .filter((t) => !isPastEvent(t))
      .slice(0, 1);
    return { tournaments: nextUp, loadError: null };
  } catch (err) {
    console.error("[tournaments] featured fetch failed:", err);
    return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
  }
}

/**
 * Slim tournament row keyed by slug, used by the smart pay redirect on
 * `/pay?tournament=<slug>`. Returns `null` for an unknown slug, a cancelled
 * tournament, or a tournament with `payments_open=false`. The minimal shape
 * matches what `<PayForm />` needs to render a preselected tournament
 * immediately without waiting for `/api/pay/options` to finish.
 */
export type PayableTournament = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  recurrence: string | null;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  entry_fee_cents: number | null;
  drop_in_fee_cents: number;
  payments_open: boolean;
  is_draft: boolean;
  status: TournamentStatus;
};

export async function getPayableTournamentBySlug(
  slug: string
): Promise<PayableTournament | null> {
  if (!slug || typeof slug !== "string") return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, title, slug, format, recurrence, time_start, time_end, location, entry_fee_cents, drop_in_fee_cents, payments_open, registration_open, is_draft, status, start_date, end_date"
      )
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      console.error("[tournaments] payable-by-slug failed:", error.message);
      return null;
    }
    if (!data) return null;
    if (!acceptsPayments(data)) return null;
    return data as PayableTournament;
  } catch (err) {
    console.error("[tournaments] payable-by-slug failed:", err);
    return null;
  }
}

/**
 * Single tournament by slug for the public detail page. Returns null on miss,
 * and null for a draft — a draft is not public, so its URL must 404 rather than
 * quietly render for anyone who guessed or kept the link.
 */
export async function getTournamentBySlug(slug: string): Promise<Tournament | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("slug", slug)
      .eq("is_draft", false)
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

/** The team choices a player sees at signup (A2 / D3). */
export type TeamOption = Pick<Team, "id" | "name" | "color">;

/**
 * Teams for several tournaments at once, keyed by tournament id.
 *
 * The registration page needs the teams for every event it lists, and there are
 * only ever a handful open at a time — so one query up front beats a client
 * round-trip each time the player changes the tournament dropdown.
 *
 * A tournament with no teams yet is simply absent from the map; the form then
 * hides the team picker rather than showing an empty one.
 */
export async function getTeamsByTournament(
  tournamentIds: string[]
): Promise<Record<string, TeamOption[]>> {
  if (tournamentIds.length === 0) return {};
  try {
    const { data, error } = await supabaseAdmin
      .from("teams")
      .select("id, name, color, tournament_id")
      .in("tournament_id", tournamentIds)
      .order("name", { ascending: true });
    if (error) {
      console.error("[teams] by-tournament fetch failed:", error.message);
      return {};
    }
    const byTournament: Record<string, TeamOption[]> = {};
    for (const row of (data ?? []) as (TeamOption & { tournament_id: string })[]) {
      const list = byTournament[row.tournament_id] ?? [];
      list.push({ id: row.id, name: row.name, color: row.color });
      byTournament[row.tournament_id] = list;
    }
    return byTournament;
  } catch (err) {
    console.error("[teams] by-tournament fetch failed:", err);
    return {};
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
    // Deliberately NOT `.eq("status", "completed")`: an event whose last day has
    // passed belongs in the archive whether or not anyone marked it completed.
    // The date is the authority, so the archive fills itself.
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("is_draft", false)
      .neq("status", "cancelled")
      .order("start_date", { ascending: false });
    if (error) {
      console.error("[tournaments] recent fetch failed:", error.message, error);
      return { tournaments: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    const finished = ((data ?? []) as Tournament[])
      .filter((t) => resolveEventState(t) === "finished")
      .slice(0, limit);
    return { tournaments: finished, loadError: null };
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
 * Matches for a tournament, enriched with team display info and nested scorers.
 * Fetched in three queries (matches, teams, scorers) and stitched in code to
 * avoid PostgREST ambiguity from the two team foreign keys on a single row.
 * Sorted by sort_order then match_number. Empty arrays on miss/error.
 */
export async function getTournamentMatches(
  tournamentId: string
): Promise<TournamentMatchesResult> {
  try {
    const [matchesRes, teamsRes] = await Promise.all([
      supabaseAdmin
        .from("matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("sort_order", { ascending: true })
        .order("match_number", { ascending: true }),
      supabaseAdmin
        .from("teams")
        .select("id, name, color")
        .eq("tournament_id", tournamentId)
        .order("name", { ascending: true }),
    ]);

    if (matchesRes.error) {
      console.error("[matches] fetch failed:", matchesRes.error.message);
      return { matches: [], teams: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    if (teamsRes.error) {
      console.error("[matches] teams fetch failed:", teamsRes.error.message);
      return { matches: [], teams: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }

    const matchRows = (matchesRes.data ?? []) as TournamentMatch[];
    const teams = (teamsRes.data ?? []) as Pick<Team, "id" | "name" | "color">[];
    const teamById = new Map(teams.map((t) => [t.id, t]));

    let scorers: MatchScorer[] = [];
    if (matchRows.length > 0) {
      const { data: scorerRows, error: scorerErr } = await supabaseAdmin
        .from("match_scorers")
        .select("*")
        .in(
          "match_id",
          matchRows.map((m) => m.id)
        )
        .order("sort_order", { ascending: true });
      if (scorerErr) {
        console.error("[match_scorers] fetch failed:", scorerErr.message);
      } else {
        scorers = (scorerRows ?? []) as MatchScorer[];
      }
    }

    const scorersByMatch = new Map<string, MatchScorer[]>();
    for (const s of scorers) {
      const list = scorersByMatch.get(s.match_id) ?? [];
      list.push(s);
      scorersByMatch.set(s.match_id, list);
    }

    const matches: MatchWithDetails[] = matchRows.map((m) => ({
      ...m,
      home_team: m.home_team_id ? teamById.get(m.home_team_id) ?? null : null,
      away_team: m.away_team_id ? teamById.get(m.away_team_id) ?? null : null,
      scorers: scorersByMatch.get(m.id) ?? [],
    }));

    return { matches, teams, loadError: null };
  } catch (err) {
    console.error("[matches] fetch failed:", err);
    return { matches: [], teams: [], loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
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
