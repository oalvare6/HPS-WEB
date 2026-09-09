import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateDbError } from "@/lib/admin-db-errors";
import {
  ISO_DATE_RE,
  readJsonObject,
  revalidateEvent,
  roundBelongs,
} from "@/lib/admin-schedule-server";

type Ctx = { params: Promise<{ id: string; roundId: string }> };

/**
 * "Move this round": a rained-out Friday gets a new date, and every match
 * still sitting on the old date moves with it. A match the owner already moved
 * on its own (its date differs from the round's) is left alone.
 */
export async function POST(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, roundId } = await ctx.params;
  const body = await readJsonObject(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const newDate = body.value.round_date;
  if (typeof newDate !== "string" || !ISO_DATE_RE.test(newDate)) {
    return NextResponse.json({ error: "Pick the new date." }, { status: 400 });
  }

  const round = await roundBelongs(roundId, id);
  if (!round) {
    return NextResponse.json({ error: "Round not found in this event." }, { status: 404 });
  }

  const { error: rErr } = await supabaseAdmin
    .from("tournament_rounds")
    .update({ round_date: newDate, status: "scheduled", rescheduled_to: null })
    .eq("id", roundId)
    .eq("tournament_id", id);
  if (rErr) {
    const t = translateDbError(rErr, "Could not move the round.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  let query = supabaseAdmin
    .from("matches")
    .update({ match_date: newDate })
    .eq("tournament_id", id)
    .eq("round_id", roundId);
  query = round.round_date
    ? query.or(`match_date.is.null,match_date.eq.${round.round_date}`)
    : query.is("match_date", null);
  const { error: mErr } = await query;
  if (mErr) {
    const t = translateDbError(mErr, "The round moved but its matches did not.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  await revalidateEvent(id);
  return NextResponse.json({ ok: true, round_date: newDate });
}
