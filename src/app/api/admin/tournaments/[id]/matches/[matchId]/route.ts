import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateDbError } from "@/lib/admin-db-errors";
import {
  loadMatch,
  optionalDate,
  optionalInt,
  optionalString,
  optionalUuid,
  readJsonObject,
  revalidateEvent,
  roundBelongs,
  teamBelongs,
} from "@/lib/admin-schedule-server";
import { isMatchPlayed } from "@/lib/schedule";
import { MAX_MATCH_LABEL_LENGTH, MAX_MATCH_NOTE_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string; matchId: string }> };

/**
 * Edit a fixture: teams, placeholders, round, date, kickoff, note, match
 * number. Scores and status are deliberately NOT accepted here — they were,
 * and that is how nine World Cup matches ended up scored-but-scheduled. Use
 * PUT .../result, DELETE .../result and POST .../status instead.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, matchId } = await ctx.params;
  const body = await readJsonObject(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const b = body.value;

  if ("home_score" in b || "away_score" in b || "status" in b) {
    return NextResponse.json(
      {
        error:
          "Scores and status are saved with Enter result, Postpone or Cancel, not here.",
      },
      { status: 400 }
    );
  }

  const existing = await loadMatch(id, matchId);
  if (!existing) {
    return NextResponse.json({ error: "Match not found in this event." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if ("round_id" in b) {
    const v = optionalUuid(b.round_id, "Round");
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    if (v.value && !(await roundBelongs(v.value, id))) {
      return NextResponse.json(
        { error: "That round is not part of this event." },
        { status: 400 }
      );
    }
    patch.round_id = v.value;
  }
  for (const [field, label] of [
    ["home_team_id", "Home team"],
    ["away_team_id", "Away team"],
  ] as const) {
    if (field in b) {
      const v = optionalUuid(b[field], label);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      if (v.value && !(await teamBelongs(v.value, id))) {
        return NextResponse.json(
          { error: `${label} is not one of this event's teams.` },
          { status: 400 }
        );
      }
      patch[field] = v.value;
    }
  }
  for (const [field, label] of [
    ["home_team_label", "Home placeholder"],
    ["away_team_label", "Away placeholder"],
  ] as const) {
    if (field in b) {
      const v = optionalString(b[field], label, MAX_MATCH_LABEL_LENGTH);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      patch[field] = v.value;
    }
  }
  if ("match_date" in b) {
    const v = optionalDate(b.match_date, "Match date");
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.match_date = v.value;
  }
  if ("kickoff_time" in b) {
    const v = optionalString(b.kickoff_time, "Kickoff time", 40);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.kickoff_time = v.value;
  }
  if ("notes" in b) {
    const v = optionalString(b.notes, "Note", MAX_MATCH_NOTE_LENGTH);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.notes = v.value;
  }
  if ("match_number" in b) {
    const v = optionalInt(b.match_number, "Match number", { min: 1 });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.match_number = v.value;
  }
  if ("sort_order" in b) {
    const v = optionalInt(b.sort_order, "Order");
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.sort_order = v.value;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // Validate the row as it will be after the patch, not field by field.
  const merged = { ...existing, ...patch } as typeof existing;
  const teamsChanged =
    merged.home_team_id !== existing.home_team_id ||
    merged.away_team_id !== existing.away_team_id;
  if (teamsChanged && isMatchPlayed(existing)) {
    return NextResponse.json(
      {
        error:
          "This match already has a result. Clear the result before changing the teams.",
      },
      { status: 409 }
    );
  }
  if (merged.home_team_id && merged.away_team_id && merged.home_team_id === merged.away_team_id) {
    return NextResponse.json(
      { error: "A team cannot play itself. Pick two different teams." },
      { status: 400 }
    );
  }
  if (!merged.home_team_id && !merged.home_team_label) {
    return NextResponse.json(
      { error: "Pick a home team or type a placeholder." },
      { status: 400 }
    );
  }
  if (!merged.away_team_id && !merged.away_team_label) {
    return NextResponse.json(
      { error: "Pick an away team or type a placeholder." },
      { status: 400 }
    );
  }
  // A real team replaces its placeholder text.
  if (merged.home_team_id) patch.home_team_label = null;
  if (merged.away_team_id) patch.away_team_label = null;

  const { data, error } = await supabaseAdmin
    .from("matches")
    .update(patch)
    .eq("id", matchId)
    .eq("tournament_id", id)
    .select()
    .single();

  if (error) {
    const t = translateDbError(error, "Could not save the match.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  await revalidateEvent(id);
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
    const t = translateDbError(error, "Could not delete the match.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  await revalidateEvent(id);
  return NextResponse.json({ ok: true });
}
