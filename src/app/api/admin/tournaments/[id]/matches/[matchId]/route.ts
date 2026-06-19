import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  MAX_MATCH_NOTE_LENGTH,
  MAX_TEAM_LABEL_LENGTH,
} from "@/lib/types";
import {
  parseOptionalDate,
  parseOptionalLabel,
  parseOptionalScore,
  parseOptionalUuid,
  parseStatus,
} from "@/lib/match-input";

type Ctx = { params: Promise<{ id: string; matchId: string }> };

async function getTournamentSlug(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("tournaments")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? null;
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

  if ("round_id" in b) {
    const r = parseOptionalUuid(b.round_id, "Round");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.round_id = r.value;
  }
  if ("home_team_id" in b) {
    const r = parseOptionalUuid(b.home_team_id, "Home team");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.home_team_id = r.value;
    if (r.value) patch.home_team_label = null;
  }
  if ("away_team_id" in b) {
    const r = parseOptionalUuid(b.away_team_id, "Away team");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.away_team_id = r.value;
    if (r.value) patch.away_team_label = null;
  }
  if ("home_team_label" in b && !("home_team_id" in b && patch.home_team_id)) {
    const r = parseOptionalLabel(b.home_team_label, "Home label", MAX_TEAM_LABEL_LENGTH);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.home_team_label = r.value;
  }
  if ("away_team_label" in b && !("away_team_id" in b && patch.away_team_id)) {
    const r = parseOptionalLabel(b.away_team_label, "Away label", MAX_TEAM_LABEL_LENGTH);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.away_team_label = r.value;
  }
  if ("home_score" in b) {
    const r = parseOptionalScore(b.home_score, "Home score");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.home_score = r.value;
  }
  if ("away_score" in b) {
    const r = parseOptionalScore(b.away_score, "Away score");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.away_score = r.value;
  }
  if ("status" in b) {
    const r = parseStatus(b.status);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.status = r.value;
  }
  if ("kickoff_time" in b) {
    const r = parseOptionalLabel(b.kickoff_time, "Kickoff time", 40);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.kickoff_time = r.value;
  }
  if ("match_date" in b) {
    const r = parseOptionalDate(b.match_date, "Match date");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.match_date = r.value;
  }
  if ("notes" in b) {
    const r = parseOptionalLabel(b.notes, "Notes", MAX_MATCH_NOTE_LENGTH);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    patch.notes = r.value;
  }
  if ("sort_order" in b) {
    const n =
      typeof b.sort_order === "number" ? b.sort_order : Number(b.sort_order);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return NextResponse.json({ error: "sort_order must be an integer." }, { status: 400 });
    }
    patch.sort_order = n;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("matches")
    .update(patch)
    .eq("id", matchId)
    .eq("tournament_id", id)
    .select("*, scorers:match_scorers(*)")
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
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
    .from("matches")
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
