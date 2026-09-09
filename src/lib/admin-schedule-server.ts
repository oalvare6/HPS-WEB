/**
 * Server-side checks shared by the schedule routes under
 * /api/admin/tournaments/[id]/{matches,rounds}. Every id posted by the browser
 * is verified to belong to THIS tournament before it is written — the same
 * shape `resolveTeamIdForTournament` uses for signups — so a crafted request
 * cannot park another event's team in a fixture, and a same-team fixture
 * cannot double-count in the table.
 */
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { MatchScorer, TournamentMatch } from "@/lib/types";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export function optionalString(
  raw: unknown,
  field: string,
  max: number
): Check<string | null> {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: `${field} must be text.` };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) {
    return { ok: false, error: `${field} is too long (max ${max} characters).` };
  }
  return { ok: true, value: trimmed };
}

export function optionalDate(raw: unknown, field: string): Check<string | null> {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !ISO_DATE_RE.test(raw)) {
    return { ok: false, error: `${field} must be a date (YYYY-MM-DD).` };
  }
  return { ok: true, value: raw };
}

export function optionalUuid(raw: unknown, field: string): Check<string | null> {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !UUID_RE.test(raw)) {
    return { ok: false, error: `${field} is not a valid id.` };
  }
  return { ok: true, value: raw };
}

export function optionalInt(
  raw: unknown,
  field: string,
  { min }: { min?: number } = {}
): Check<number | null> {
  if (raw == null || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: `${field} must be a whole number.` };
  }
  if (min != null && n < min) {
    return { ok: false, error: `${field} must be at least ${min}.` };
  }
  return { ok: true, value: n };
}

export async function getTournamentSlug(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("tournaments")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

/** The public event page is force-dynamic today; these are cheap and future-proof. */
export async function revalidateEvent(tournamentId: string): Promise<void> {
  const slug = await getTournamentSlug(tournamentId);
  if (slug) revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
}

export async function teamBelongs(
  teamId: string,
  tournamentId: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  return Boolean(data);
}

export async function roundBelongs(
  roundId: string,
  tournamentId: string
): Promise<{ id: string; round_date: string | null } | null> {
  const { data } = await supabaseAdmin
    .from("tournament_rounds")
    .select("id, round_date")
    .eq("id", roundId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  return (data as { id: string; round_date: string | null } | null) ?? null;
}

export async function loadMatch(
  tournamentId: string,
  matchId: string
): Promise<TournamentMatch | null> {
  const { data } = await supabaseAdmin
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  return (data as TournamentMatch | null) ?? null;
}

export async function loadMatchWithScorers(
  tournamentId: string,
  matchId: string
): Promise<(TournamentMatch & { scorers: MatchScorer[] }) | null> {
  const match = await loadMatch(tournamentId, matchId);
  if (!match) return null;
  const { data } = await supabaseAdmin
    .from("match_scorers")
    .select("*")
    .eq("match_id", matchId)
    .order("sort_order", { ascending: true });
  return { ...match, scorers: ((data ?? []) as MatchScorer[]) };
}

/** Next free match number in this event. */
export async function nextMatchNumber(tournamentId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("matches")
    .select("match_number")
    .eq("tournament_id", tournamentId)
    .not("match_number", "is", null)
    .order("match_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.match_number as number | undefined) ?? 0) + 1;
}

export async function nextSortOrder(
  table: "matches" | "tournament_rounds",
  tournamentId: string
): Promise<number> {
  const { data } = await supabaseAdmin
    .from(table)
    .select("sort_order")
    .eq("tournament_id", tournamentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.sort_order as number | undefined) ?? -1) + 1;
}

export async function readJsonObject(
  request: Request
): Promise<Check<Record<string, unknown>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "Invalid JSON body." };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be an object." };
  }
  return { ok: true, value: body as Record<string, unknown> };
}
