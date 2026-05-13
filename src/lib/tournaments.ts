import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tournament } from "@/lib/types";

/** Shown when Supabase/env fails; distinct from an legitimately empty tournament list. */
export const TOURNAMENTS_LOAD_USER_MESSAGE =
  "We couldn't load events right now. Please refresh the page or try again in a few minutes.";

export type PublicTournamentsResult = {
  tournaments: Tournament[];
  /** Non-null when the request failed (not the same as zero tournaments). */
  loadError: string | null;
};

export type FeaturedTournamentResult = {
  tournament: Tournament | null;
  /** Non-null when the featured query failed. */
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

export async function getFeaturedTournament(): Promise<FeaturedTournamentResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .eq("status", "upcoming")
      .eq("registration_open", true)
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[tournaments] featured fetch failed:", error.message, error);
      return { tournament: null, loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
    }
    return { tournament: (data as Tournament | null) ?? null, loadError: null };
  } catch (err) {
    console.error("[tournaments] featured fetch failed:", err);
    return { tournament: null, loadError: TOURNAMENTS_LOAD_USER_MESSAGE };
  }
}
