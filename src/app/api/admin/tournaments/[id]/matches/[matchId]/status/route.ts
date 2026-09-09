import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateDbError } from "@/lib/admin-db-errors";
import {
  loadMatch,
  optionalDate,
  optionalString,
  readJsonObject,
  revalidateEvent,
} from "@/lib/admin-schedule-server";
import { isMatchPlayed } from "@/lib/schedule";
import { MAX_MATCH_NOTE_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string; matchId: string }> };

/**
 * Postpone, cancel, or put a match back on the calendar. Never "completed" —
 * that is what a result is for. A postponed match may carry its new date
 * (written to match_date) so the public page can say "Postponed, now Sep 18".
 */
export async function POST(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, matchId } = await ctx.params;
  const body = await readJsonObject(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const b = body.value;

  const status = b.status;
  if (status !== "postponed" && status !== "cancelled" && status !== "scheduled") {
    return NextResponse.json(
      { error: "Status must be postponed, cancelled or scheduled." },
      { status: 400 }
    );
  }

  const existing = await loadMatch(id, matchId);
  if (!existing) {
    return NextResponse.json({ error: "Match not found in this event." }, { status: 404 });
  }
  if (isMatchPlayed(existing)) {
    return NextResponse.json(
      { error: "This match already has a result. Clear the result first." },
      { status: 409 }
    );
  }

  const patch: Record<string, unknown> = { status, home_score: null, away_score: null };
  if ("match_date" in b) {
    const v = optionalDate(b.match_date, "New date");
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.match_date = v.value;
  }
  if ("notes" in b) {
    const v = optionalString(b.notes, "Note", MAX_MATCH_NOTE_LENGTH);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    patch.notes = v.value;
  }

  const { data, error } = await supabaseAdmin
    .from("matches")
    .update(patch)
    .eq("id", matchId)
    .eq("tournament_id", id)
    .select()
    .single();
  if (error) {
    const t = translateDbError(error, "Could not update the match.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  await revalidateEvent(id);
  return NextResponse.json({ match: data });
}
