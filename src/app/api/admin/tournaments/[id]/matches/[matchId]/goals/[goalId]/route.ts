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

type Ctx = { params: Promise<{ id: string; matchId: string; goalId: string }> };

/**
 * Fix one scorer row: the name ("Tony" becomes "Tony Portillo"), the count, the
 * side, own-goal flag or the person link. Scoped to the event: the match must
 * belong to it, and a team must be one of the match's sides.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, matchId, goalId } = await ctx.params;
  const body = await readJsonObject(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const b = body.value;

  const match = await loadMatch(id, matchId);
  if (!match) {
    return NextResponse.json({ error: "Match not found in this event." }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};

  if ("scorer_name" in b) {
    if (typeof b.scorer_name !== "string" || !b.scorer_name.trim()) {
      return NextResponse.json({ error: "Scorer name cannot be empty." }, { status: 400 });
    }
    const trimmed = b.scorer_name.trim();
    if (trimmed.length > MAX_SCORER_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Scorer name is too long (max ${MAX_SCORER_NAME_LENGTH} characters).` },
        { status: 400 }
      );
    }
    patch.scorer_name = trimmed;
  }
  if ("team_id" in b) {
    const v = b.team_id;
    if (typeof v !== "string" || !UUID_RE.test(v)) {
      return NextResponse.json({ error: "Pick which team the goal counted for." }, { status: 400 });
    }
    if (v !== match.home_team_id && v !== match.away_team_id) {
      return NextResponse.json(
        { error: "That team is not playing in this match." },
        { status: 400 }
      );
    }
    patch.team_id = v;
  }
  if ("goals" in b) {
    const n = typeof b.goals === "number" ? b.goals : Number(b.goals);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 99) {
      return NextResponse.json(
        { error: "Goals must be a whole number from 1 to 99." },
        { status: 400 }
      );
    }
    patch.goals = n;
  }
  if ("own_goal" in b) {
    if (typeof b.own_goal !== "boolean") {
      return NextResponse.json({ error: "own_goal must be true or false." }, { status: 400 });
    }
    patch.own_goal = b.own_goal;
    if (b.own_goal) {
      patch.scorer_name = "Own goal";
      patch.contact_id = null;
    }
  }
  if ("contact_id" in b && patch.own_goal !== true) {
    const v = b.contact_id;
    if (v == null || v === "") {
      patch.contact_id = null;
    } else if (typeof v !== "string" || !UUID_RE.test(v)) {
      return NextResponse.json({ error: "That person id is not valid." }, { status: 400 });
    } else {
      patch.contact_id = v;
    }
  }
  if ("sort_order" in b) {
    const n = typeof b.sort_order === "number" ? b.sort_order : Number(b.sort_order);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return NextResponse.json({ error: "Order must be a whole number." }, { status: 400 });
    }
    patch.sort_order = n;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("match_scorers")
    .update(patch)
    .eq("id", goalId)
    .eq("match_id", matchId)
    .select()
    .single();

  if (error) {
    const t = translateDbError(error, "Could not save the scorer.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  await revalidateEvent(id);
  return NextResponse.json({ scorer: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, matchId, goalId } = await ctx.params;
  const match = await loadMatch(id, matchId);
  if (!match) {
    return NextResponse.json({ error: "Match not found in this event." }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("match_scorers")
    .delete()
    .eq("id", goalId)
    .eq("match_id", matchId);

  if (error) {
    const t = translateDbError(error, "Could not remove the scorer.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  await revalidateEvent(id);
  return NextResponse.json({ ok: true });
}
