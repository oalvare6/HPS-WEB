import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateDbError } from "@/lib/admin-db-errors";
import {
  nextMatchNumber,
  nextSortOrder,
  optionalDate,
  optionalInt,
  optionalString,
  optionalUuid,
  readJsonObject,
  revalidateEvent,
  roundBelongs,
  teamBelongs,
} from "@/lib/admin-schedule-server";
import { MAX_MATCH_LABEL_LENGTH, MAX_MATCH_NOTE_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin
    .from("matches")
    .select("*")
    .eq("tournament_id", id)
    .order("match_number", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  if (error) {
    const t = translateDbError(error, "Could not load the matches.");
    return NextResponse.json({ error: t.message }, { status: t.status });
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

/**
 * Create a fixture. A fixture is teams, a round, a kickoff and a date — never a
 * score. Results go through PUT .../matches/[matchId]/result, which is the one
 * path that can mark a match completed, so a score can no longer be saved on a
 * match the public page treats as unplayed.
 */
export async function POST(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const body = await readJsonObject(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const b = body.value;

  if (
    (b.home_score != null && b.home_score !== "") ||
    (b.away_score != null && b.away_score !== "") ||
    (b.status != null && b.status !== "" && b.status !== "scheduled")
  ) {
    return NextResponse.json(
      { error: "Add the match first, then use Enter result for the score." },
      { status: 400 }
    );
  }

  const roundId = optionalUuid(b.round_id, "Round");
  if (!roundId.ok) return NextResponse.json({ error: roundId.error }, { status: 400 });
  const homeTeamId = optionalUuid(b.home_team_id, "Home team");
  if (!homeTeamId.ok)
    return NextResponse.json({ error: homeTeamId.error }, { status: 400 });
  const awayTeamId = optionalUuid(b.away_team_id, "Away team");
  if (!awayTeamId.ok)
    return NextResponse.json({ error: awayTeamId.error }, { status: 400 });
  const homeLabel = optionalString(b.home_team_label, "Home placeholder", MAX_MATCH_LABEL_LENGTH);
  if (!homeLabel.ok) return NextResponse.json({ error: homeLabel.error }, { status: 400 });
  const awayLabel = optionalString(b.away_team_label, "Away placeholder", MAX_MATCH_LABEL_LENGTH);
  if (!awayLabel.ok) return NextResponse.json({ error: awayLabel.error }, { status: 400 });
  const matchDate = optionalDate(b.match_date, "Match date");
  if (!matchDate.ok) return NextResponse.json({ error: matchDate.error }, { status: 400 });
  const kickoffTime = optionalString(b.kickoff_time, "Kickoff time", 40);
  if (!kickoffTime.ok) return NextResponse.json({ error: kickoffTime.error }, { status: 400 });
  const matchNumber = optionalInt(b.match_number, "Match number", { min: 1 });
  if (!matchNumber.ok)
    return NextResponse.json({ error: matchNumber.error }, { status: 400 });
  const notes = optionalString(b.notes, "Note", MAX_MATCH_NOTE_LENGTH);
  if (!notes.ok) return NextResponse.json({ error: notes.error }, { status: 400 });

  if (!homeTeamId.value && !homeLabel.value) {
    return NextResponse.json(
      { error: "Pick a home team or type a placeholder like “1st place”." },
      { status: 400 }
    );
  }
  if (!awayTeamId.value && !awayLabel.value) {
    return NextResponse.json(
      { error: "Pick an away team or type a placeholder like “4th place”." },
      { status: 400 }
    );
  }
  if (homeTeamId.value && awayTeamId.value && homeTeamId.value === awayTeamId.value) {
    return NextResponse.json(
      { error: "A team cannot play itself. Pick two different teams." },
      { status: 400 }
    );
  }

  const { data: tournament, error: tErr } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (tErr) {
    const t = translateDbError(tErr);
    return NextResponse.json({ error: t.message }, { status: t.status });
  }
  if (!tournament) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  for (const [teamId, side] of [
    [homeTeamId.value, "home"],
    [awayTeamId.value, "away"],
  ] as const) {
    if (teamId && !(await teamBelongs(teamId, id))) {
      return NextResponse.json(
        { error: `The ${side} team is not one of this event's teams.` },
        { status: 400 }
      );
    }
  }

  let round: { id: string; round_date: string | null } | null = null;
  if (roundId.value) {
    round = await roundBelongs(roundId.value, id);
    if (!round) {
      return NextResponse.json(
        { error: "That round is not part of this event." },
        { status: 400 }
      );
    }
  }

  const [number, sortOrder] = await Promise.all([
    matchNumber.value != null ? Promise.resolve(matchNumber.value) : nextMatchNumber(id),
    nextSortOrder("matches", id),
  ]);

  const { data, error } = await supabaseAdmin
    .from("matches")
    .insert({
      tournament_id: id,
      round_id: round?.id ?? null,
      match_number: number,
      home_team_id: homeTeamId.value,
      away_team_id: awayTeamId.value,
      home_team_label: homeTeamId.value ? null : homeLabel.value,
      away_team_label: awayTeamId.value ? null : awayLabel.value,
      match_date: matchDate.value ?? round?.round_date ?? null,
      kickoff_time: kickoffTime.value,
      home_score: null,
      away_score: null,
      status: "scheduled",
      notes: notes.value,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) {
    const t = translateDbError(error, "Could not add the match.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  await revalidateEvent(id);
  return NextResponse.json({ match: { ...data, scorers: [] } });
}
