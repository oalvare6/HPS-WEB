import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  MATCH_STATUSES,
  MAX_MATCH_LABEL_LENGTH,
  MAX_MATCH_NOTE_LENGTH,
  type MatchStatus,
} from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const STATUS_SET = new Set<string>(MATCH_STATUSES);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseOptionalString(
  raw: unknown,
  field: string,
  max: number
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: `${field} must be a string.` };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) {
    return { ok: false, error: `${field} is too long (max ${max} chars).` };
  }
  return { ok: true, value: trimmed };
}

function parseOptionalDate(
  raw: unknown,
  field: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !ISO_DATE_RE.test(raw)) {
    return { ok: false, error: `${field} must be a YYYY-MM-DD date.` };
  }
  return { ok: true, value: raw };
}

function parseOptionalUuid(
  raw: unknown,
  field: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !UUID_RE.test(raw)) {
    return { ok: false, error: `${field} must be a valid id.` };
  }
  return { ok: true, value: raw };
}

function parseOptionalInt(
  raw: unknown,
  field: string,
  { min }: { min?: number } = {}
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: `${field} must be an integer.` };
  }
  if (min != null && n < min) {
    return { ok: false, error: `${field} must be at least ${min}.` };
  }
  return { ok: true, value: n };
}

function parseStatus(
  raw: unknown
): { ok: true; value: MatchStatus } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: "scheduled" };
  if (typeof raw !== "string" || !STATUS_SET.has(raw)) {
    return { ok: false, error: "Invalid match status." };
  }
  return { ok: true, value: raw as MatchStatus };
}

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin
    .from("matches")
    .select("*")
    .eq("tournament_id", id)
    .order("sort_order", { ascending: true })
    .order("match_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const matches = data ?? [];
  let scorersByMatch: Record<string, unknown[]> = {};
  if (matches.length > 0) {
    const { data: scorers } = await supabaseAdmin
      .from("match_scorers")
      .select("*")
      .in(
        "match_id",
        matches.map((m) => m.id as string)
      )
      .order("sort_order", { ascending: true });
    scorersByMatch = {};
    for (const s of scorers ?? []) {
      const key = s.match_id as string;
      (scorersByMatch[key] ??= []).push(s);
    }
  }

  return NextResponse.json({
    matches: matches.map((m) => ({
      ...m,
      scorers: scorersByMatch[m.id as string] ?? [],
    })),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const status = parseStatus(b.status);
  if (!status.ok) return NextResponse.json({ error: status.error }, { status: 400 });
  const roundId = parseOptionalUuid(b.round_id, "Round");
  if (!roundId.ok) return NextResponse.json({ error: roundId.error }, { status: 400 });
  const homeTeamId = parseOptionalUuid(b.home_team_id, "Home team");
  if (!homeTeamId.ok)
    return NextResponse.json({ error: homeTeamId.error }, { status: 400 });
  const awayTeamId = parseOptionalUuid(b.away_team_id, "Away team");
  if (!awayTeamId.ok)
    return NextResponse.json({ error: awayTeamId.error }, { status: 400 });
  const homeLabel = parseOptionalString(b.home_team_label, "Home label", MAX_MATCH_LABEL_LENGTH);
  if (!homeLabel.ok) return NextResponse.json({ error: homeLabel.error }, { status: 400 });
  const awayLabel = parseOptionalString(b.away_team_label, "Away label", MAX_MATCH_LABEL_LENGTH);
  if (!awayLabel.ok) return NextResponse.json({ error: awayLabel.error }, { status: 400 });
  const matchDate = parseOptionalDate(b.match_date, "Match date");
  if (!matchDate.ok) return NextResponse.json({ error: matchDate.error }, { status: 400 });
  const kickoffTime = parseOptionalString(b.kickoff_time, "Kickoff time", 40);
  if (!kickoffTime.ok) return NextResponse.json({ error: kickoffTime.error }, { status: 400 });
  const matchNumber = parseOptionalInt(b.match_number, "Match number", { min: 0 });
  if (!matchNumber.ok)
    return NextResponse.json({ error: matchNumber.error }, { status: 400 });
  const homeScore = parseOptionalInt(b.home_score, "Home score", { min: 0 });
  if (!homeScore.ok) return NextResponse.json({ error: homeScore.error }, { status: 400 });
  const awayScore = parseOptionalInt(b.away_score, "Away score", { min: 0 });
  if (!awayScore.ok) return NextResponse.json({ error: awayScore.error }, { status: 400 });
  const notes = parseOptionalString(b.notes, "Note", MAX_MATCH_NOTE_LENGTH);
  if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: 400 });

  const { data: tournament, error: tErr } = await supabaseAdmin
    .from("tournaments")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  const { data: maxRow } = await supabaseAdmin
    .from("matches")
    .select("sort_order")
    .eq("tournament_id", id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxRow?.sort_order as number | undefined) ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from("matches")
    .insert({
      tournament_id: id,
      round_id: roundId.value,
      match_number: matchNumber.value,
      home_team_id: homeTeamId.value,
      away_team_id: awayTeamId.value,
      home_team_label: homeLabel.value,
      away_team_label: awayLabel.value,
      match_date: matchDate.value,
      kickoff_time: kickoffTime.value,
      home_score: homeScore.value,
      away_score: awayScore.value,
      status: status.value,
      notes: notes.value,
      sort_order: nextSort,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/events/${tournament.slug}`);
  revalidatePath("/events");
  return NextResponse.json({ match: { ...data, scorers: [] } });
}
