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
} from "@/lib/types";

type Ctx = { params: Promise<{ id: string; matchId: string }> };

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

export async function PATCH(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, matchId } = await ctx.params;

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

  const patch: Record<string, unknown> = {};

  if ("home_team_id" in b) {
    if (typeof b.home_team_id !== "string" || !UUID_RE.test(b.home_team_id)) {
      return NextResponse.json({ error: "Invalid home_team_id." }, { status: 400 });
    }
    patch.home_team_id = b.home_team_id;
  }
  if ("away_team_id" in b) {
    if (typeof b.away_team_id !== "string" || !UUID_RE.test(b.away_team_id)) {
      return NextResponse.json({ error: "Invalid away_team_id." }, { status: 400 });
    }
    patch.away_team_id = b.away_team_id;
  }
  if (
    patch.home_team_id &&
    patch.away_team_id &&
    patch.home_team_id === patch.away_team_id
  ) {
    return NextResponse.json(
      { error: "Home and away team must be different." },
      { status: 400 }
    );
  }
  if ("stage" in b) {
    if (typeof b.stage !== "string" || !STAGE_SET.has(b.stage)) {
      return NextResponse.json({ error: "Invalid stage." }, { status: 400 });
    }
    patch.stage = b.stage;
  }
  if ("status" in b) {
    if (typeof b.status !== "string" || !STATUS_SET.has(b.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    patch.status = b.status;
  }
  if ("match_date" in b) {
    const v = b.match_date;
    if (v == null || v === "") {
      patch.match_date = null;
    } else if (typeof v !== "string" || !ISO_DATE_RE.test(v)) {
      return NextResponse.json(
        { error: "match_date must be a YYYY-MM-DD date." },
        { status: 400 }
      );
    } else {
      patch.match_date = v;
    }
  }
  if ("kickoff_time" in b) {
    const v = b.kickoff_time;
    patch.kickoff_time = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  if ("round_id" in b) {
    const v = b.round_id;
    patch.round_id = typeof v === "string" && UUID_RE.test(v) ? v : null;
  }
  for (const field of ["home_score", "away_score"] as const) {
    if (field in b) {
      const v = b[field];
      if (v == null || v === "") {
        patch[field] = null;
      } else {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0) {
          return NextResponse.json(
            { error: `${field} must be a non-negative integer.` },
            { status: 400 }
          );
        }
        patch[field] = n;
      }
    }
  }
  if ("notes" in b) {
    const v = b.notes;
    if (v == null || v === "") {
      patch.notes = null;
    } else if (typeof v !== "string") {
      return NextResponse.json({ error: "notes must be a string." }, { status: 400 });
    } else {
      const trimmed = v.trim();
      if (trimmed.length > MAX_MATCH_NOTE_LENGTH) {
        return NextResponse.json(
          { error: `Notes too long (max ${MAX_MATCH_NOTE_LENGTH} chars).` },
          { status: 400 }
        );
      }
      patch.notes = trimmed || null;
    }
  }

  const resolvedStatus = (patch.status as string | undefined) ?? undefined;
  if (resolvedStatus === "final") {
    const { data: existing } = await supabaseAdmin
      .from("tournament_matches")
      .select("home_score, away_score")
      .eq("id", matchId)
      .maybeSingle();
    const home = "home_score" in patch ? patch.home_score : existing?.home_score;
    const away = "away_score" in patch ? patch.away_score : existing?.away_score;
    if (home == null || away == null) {
      return NextResponse.json(
        { error: "Final matches need both scores." },
        { status: 400 }
      );
    }
  }

  let goalsPatch: MatchGoalInput[] | null = null;
  if ("goals" in b) {
    const parsed = parseGoals(b.goals);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    goalsPatch = parsed.value;
  }

  if (Object.keys(patch).length === 0 && goalsPatch === null) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  let data = null;
  if (Object.keys(patch).length > 0) {
    const result = await supabaseAdmin
      .from("tournament_matches")
      .update(patch)
      .eq("id", matchId)
      .eq("tournament_id", id)
      .select()
      .single();
    if (result.error) {
      const status = result.error.code === "PGRST116" ? 404 : 500;
      return NextResponse.json({ error: result.error.message }, { status });
    }
    data = result.data;
  }

  if (goalsPatch !== null) {
    const { error: delErr } = await supabaseAdmin
      .from("match_goals")
      .delete()
      .eq("match_id", matchId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    if (goalsPatch.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("match_goals").insert(
        goalsPatch.map((g) => ({
          match_id: matchId,
          team_id: g.team_id,
          player_name: g.player_name,
          goals: g.goals,
        }))
      );
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }
  }

  const slug = await getTournamentSlug(id);
  if (slug) revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
  return NextResponse.json({ match: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, matchId } = await ctx.params;
  const { error } = await supabaseAdmin
    .from("tournament_matches")
    .delete()
    .eq("id", matchId)
    .eq("tournament_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const slug = await getTournamentSlug(id);
  if (slug) revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
  return NextResponse.json({ ok: true });
}
