import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MAX_MATCH_NOTE_LENGTH, MAX_TEAM_LABEL_LENGTH } from "@/lib/types";
import {
  parseOptionalDate,
  parseOptionalLabel,
  parseOptionalScore,
  parseOptionalUuid,
  parseStatus,
} from "@/lib/match-input";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin
    .from("matches")
    .select("*, scorers:match_scorers(*)")
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

  const roundId = parseOptionalUuid(b.round_id, "Round");
  if (!roundId.ok) return NextResponse.json({ error: roundId.error }, { status: 400 });
  const homeTeamId = parseOptionalUuid(b.home_team_id, "Home team");
  if (!homeTeamId.ok) return NextResponse.json({ error: homeTeamId.error }, { status: 400 });
  const awayTeamId = parseOptionalUuid(b.away_team_id, "Away team");
  if (!awayTeamId.ok) return NextResponse.json({ error: awayTeamId.error }, { status: 400 });
  const homeLabel = parseOptionalLabel(b.home_team_label, "Home label", MAX_TEAM_LABEL_LENGTH);
  if (!homeLabel.ok) return NextResponse.json({ error: homeLabel.error }, { status: 400 });
  const awayLabel = parseOptionalLabel(b.away_team_label, "Away label", MAX_TEAM_LABEL_LENGTH);
  if (!awayLabel.ok) return NextResponse.json({ error: awayLabel.error }, { status: 400 });
  const homeScore = parseOptionalScore(b.home_score, "Home score");
  if (!homeScore.ok) return NextResponse.json({ error: homeScore.error }, { status: 400 });
  const awayScore = parseOptionalScore(b.away_score, "Away score");
  if (!awayScore.ok) return NextResponse.json({ error: awayScore.error }, { status: 400 });
  const status = parseStatus(b.status);
  if (!status.ok) return NextResponse.json({ error: status.error }, { status: 400 });
  const kickoff = parseOptionalLabel(b.kickoff_time, "Kickoff time", 40);
  if (!kickoff.ok) return NextResponse.json({ error: kickoff.error }, { status: 400 });
  const matchDate = parseOptionalDate(b.match_date, "Match date");
  if (!matchDate.ok) return NextResponse.json({ error: matchDate.error }, { status: 400 });
  const notes = parseOptionalLabel(b.notes, "Notes", MAX_MATCH_NOTE_LENGTH);
  if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: 400 });

  if (!homeTeamId.value && !homeLabel.value) {
    return NextResponse.json(
      { error: "Pick a home team or enter a home label." },
      { status: 400 }
    );
  }
  if (!awayTeamId.value && !awayLabel.value) {
    return NextResponse.json(
      { error: "Pick an away team or enter an away label." },
      { status: 400 }
    );
  }
  if (
    homeTeamId.value &&
    awayTeamId.value &&
    homeTeamId.value === awayTeamId.value
  ) {
    return NextResponse.json(
      { error: "Home and away teams must be different." },
      { status: 400 }
    );
  }

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
      home_team_id: homeTeamId.value,
      away_team_id: awayTeamId.value,
      home_team_label: homeTeamId.value ? null : homeLabel.value,
      away_team_label: awayTeamId.value ? null : awayLabel.value,
      home_score: homeScore.value,
      away_score: awayScore.value,
      status: status.value,
      kickoff_time: kickoff.value,
      match_date: matchDate.value,
      notes: notes.value,
      sort_order: nextSort,
    })
    .select("*, scorers:match_scorers(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/events/${tournament.slug}`);
  revalidatePath("/events");
  return NextResponse.json({ match: data });
}
