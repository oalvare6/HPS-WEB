import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  MATCH_STAGES,
  MATCH_STATUSES,
  MAX_MATCH_NOTE_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  type MatchGoalInput,
  type MatchStage,
  type MatchStatus,
} from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const STAGE_SET = new Set<string>(MATCH_STAGES);
const STATUS_SET = new Set<string>(MATCH_STATUSES);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getTournamentSlug(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("tournaments")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

function parseGoals(
  raw: unknown
): { ok: true; value: MatchGoalInput[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Goals must be a list." };
  const value: MatchGoalInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Each goal line must be an object." };
    }
    const g = item as Record<string, unknown>;
    if (typeof g.team_id !== "string" || !UUID_RE.test(g.team_id)) {
      return { ok: false, error: "Each goal line needs a valid team_id." };
    }
    const playerName = typeof g.player_name === "string" ? g.player_name.trim() : "";
    if (!playerName) {
      return { ok: false, error: "Each goal line needs a player name." };
    }
    if (playerName.length > MAX_PLAYER_NAME_LENGTH) {
      return {
        ok: false,
        error: `Player name is too long (max ${MAX_PLAYER_NAME_LENGTH} chars).`,
      };
    }
    const goals = typeof g.goals === "number" ? g.goals : Number(g.goals);
    if (!Number.isInteger(goals) || goals < 1) {
      return { ok: false, error: "Goal count must be a positive integer." };
    }
    value.push({ team_id: g.team_id, player_name: playerName, goals });
  }
  return { ok: true, value };
}

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin
    .from("tournament_matches")
    .select(
      `*,
       home_team:teams!tournament_matches_home_team_id_fkey ( id, name, color ),
       away_team:teams!tournament_matches_away_team_id_fkey ( id, name, color ),
       goals:match_goals ( * )`
    )
    .eq("tournament_id", id)
    .order("sort_order", { ascending: true })
    .order("match_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ matches: data ?? [] });
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

  if (typeof b.home_team_id !== "string" || !UUID_RE.test(b.home_team_id)) {
    return NextResponse.json({ error: "home_team_id is required." }, { status: 400 });
  }
  if (typeof b.away_team_id !== "string" || !UUID_RE.test(b.away_team_id)) {
    return NextResponse.json({ error: "away_team_id is required." }, { status: 400 });
  }
  if (b.home_team_id === b.away_team_id) {
    return NextResponse.json(
      { error: "Home and away team must be different." },
      { status: 400 }
    );
  }

  const stage: MatchStage =
    typeof b.stage === "string" && STAGE_SET.has(b.stage) ? (b.stage as MatchStage) : "group";

  const status: MatchStatus =
    typeof b.status === "string" && STATUS_SET.has(b.status)
      ? (b.status as MatchStatus)
      : "scheduled";

  let matchDate: string | null = null;
  if (b.match_date != null && b.match_date !== "") {
    if (typeof b.match_date !== "string" || !ISO_DATE_RE.test(b.match_date)) {
      return NextResponse.json(
        { error: "match_date must be a YYYY-MM-DD date." },
        { status: 400 }
      );
    }
    matchDate = b.match_date;
  }

  const kickoffTime =
    typeof b.kickoff_time === "string" && b.kickoff_time.trim()
      ? b.kickoff_time.trim()
      : null;

  let homeScore: number | null = null;
  let awayScore: number | null = null;
  if (b.home_score != null && b.home_score !== "") {
    const n = Number(b.home_score);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "home_score must be a non-negative integer." }, { status: 400 });
    }
    homeScore = n;
  }
  if (b.away_score != null && b.away_score !== "") {
    const n = Number(b.away_score);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "away_score must be a non-negative integer." }, { status: 400 });
    }
    awayScore = n;
  }
  if (status === "final" && (homeScore == null || awayScore == null)) {
    return NextResponse.json(
      { error: "Final matches need both scores." },
      { status: 400 }
    );
  }

  let notes: string | null = null;
  if (typeof b.notes === "string" && b.notes.trim()) {
    const trimmed = b.notes.trim();
    if (trimmed.length > MAX_MATCH_NOTE_LENGTH) {
      return NextResponse.json(
        { error: `Notes too long (max ${MAX_MATCH_NOTE_LENGTH} chars).` },
        { status: 400 }
      );
    }
    notes = trimmed;
  }

  const roundId =
    typeof b.round_id === "string" && UUID_RE.test(b.round_id) ? b.round_id : null;

  const goals = parseGoals(b.goals);
  if (!goals.ok) return NextResponse.json({ error: goals.error }, { status: 400 });
  for (const g of goals.value) {
    if (g.team_id !== b.home_team_id && g.team_id !== b.away_team_id) {
      return NextResponse.json(
        { error: "Each goal line's team must be one of the two match teams." },
        { status: 400 }
      );
    }
  }

  const tournament = await supabaseAdmin
    .from("tournaments")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();
  if (tournament.error) {
    return NextResponse.json({ error: tournament.error.message }, { status: 500 });
  }
  if (!tournament.data) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  const { data: maxRow } = await supabaseAdmin
    .from("tournament_matches")
    .select("sort_order")
    .eq("tournament_id", id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxRow?.sort_order as number | undefined) ?? -1) + 1;

  const { data: match, error: insertErr } = await supabaseAdmin
    .from("tournament_matches")
    .insert({
      tournament_id: id,
      round_id: roundId,
      stage,
      match_date: matchDate,
      kickoff_time: kickoffTime,
      home_team_id: b.home_team_id,
      away_team_id: b.away_team_id,
      home_score: homeScore,
      away_score: awayScore,
      status,
      notes,
      sort_order: nextSort,
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  if (goals.value.length > 0) {
    const { error: goalsErr } = await supabaseAdmin.from("match_goals").insert(
      goals.value.map((g) => ({
        match_id: match.id,
        team_id: g.team_id,
        player_name: g.player_name,
        goals: g.goals,
      }))
    );
    if (goalsErr) {
      return NextResponse.json({ error: goalsErr.message }, { status: 500 });
    }
  }

  revalidatePath(`/events/${tournament.data.slug}`);
  revalidatePath("/events");
  return NextResponse.json({ match });
}
