import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Tournament } from "@/lib/types";

export async function getPublicTournaments(): Promise<Tournament[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("*")
      .neq("status", "cancelled")
      .order("display_order", { ascending: true })
      .order("start_date", { ascending: true });

    if (error) {
      console.error("[tournaments] fetch failed:", error.message);
      return [];
    }
    return (data ?? []) as Tournament[];
  } catch (err) {
    console.error("[tournaments] fetch failed:", err);
    return [];
  }
}

export async function getFeaturedTournament(): Promise<Tournament | null> {
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
      console.error("[tournaments] featured fetch failed:", error.message);
      return null;
    }
    return (data as Tournament | null) ?? null;
  } catch (err) {
    console.error("[tournaments] featured fetch failed:", err);
    return null;
  }
}
