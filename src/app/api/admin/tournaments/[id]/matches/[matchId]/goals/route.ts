import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateDbError } from "@/lib/admin-db-errors";
import {
  UUID_RE,
  loadMatch,
  readJsonObject,
  revalidateEvent,
} from "@/lib/admin-schedule-server";
import { MAX_SCORER_NAME_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string; matchId: string }> };

// (No GET: scorers arrive embedded in the matches list.)

/**
 * Add one scorer row to an existing result. The Enter-result sheet saves the
 * whole result at once through PUT .../result; this route remains for single
 * additions and for the import tooling. team_id must be one of the match's two
 * sides, and per the one rule it is the team the goal counted FOR.
 */
export async function POST(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, matchId } = await ctx.params;
  const body = await readJsonObject(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const b = body.value;

  const ownGoal = b.own_goal === true;
  const scorerName =
    typeof b.scorer_name === "string" ? b.scorer_name.trim() : "";
  if (!ownGoal && !scorerName) {
    return NextResponse.json({ error: "Scorer name is required." }, { status: 400 });
  }
  if (scorerName.length > MAX_SCORER_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Scorer name is too long (max ${MAX_SCORER_NAME_LENGTH} characters).` },
      { status: 400 }
    );
  }
  if (typeof b.team_id !== "string" || !UUID_RE.test(b.team_id)) {
    return NextResponse.json({ error: "Pick which team the goal counted for." }, { status: 400 });
  }
  const teamId = b.team_id;

  let goals = 1;
  if (b.goals != null && b.goals !== "") {
    const n = typeof b.goals === "number" ? b.goals : Number(b.goals);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 99) {
      return NextResponse.json(
        { error: "Goals must be a whole number from 1 to 99." },
        { status: 400 }
      );
    }
    goals = n;
  }

  let contactId: string | null = null;
  if (!ownGoal && b.contact_id != null && b.contact_id !== "") {
    if (typeof b.contact_id !== "string" || !UUID_RE.test(b.contact_id)) {
      return NextResponse.json({ error: "That person id is not valid." }, { status: 400 });
    }
    contactId = b.contact_id;
  }

  const match = await loadMatch(id, matchId);
  if (!match) {
    return NextResponse.json({ error: "Match not found in this event." }, { status: 404 });
  }
  if (teamId !== match.home_team_id && teamId !== match.away_team_id) {
    return NextResponse.json(
      { error: "That team is not playing in this match." },
      { status: 400 }
    );
  }

  const { data: maxRow } = await supabaseAdmin
    .from("match_scorers")
    .select("sort_order")
    .eq("match_id", matchId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxRow?.sort_order as number | undefined) ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from("match_scorers")
    .insert({
      match_id: matchId,
      team_id: teamId,
      scorer_name: ownGoal ? "Own goal" : scorerName,
      goals,
      own_goal: ownGoal,
      contact_id: contactId,
      sort_order: nextSort,
    })
    .select()
    .single();

  if (error) {
    const t = translateDbError(error, "Could not add the scorer.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  await revalidateEvent(id);
  return NextResponse.json({ scorer: data });
}
