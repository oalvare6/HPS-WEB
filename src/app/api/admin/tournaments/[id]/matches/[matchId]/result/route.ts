import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateDbError } from "@/lib/admin-db-errors";
import {
  UUID_RE,
  loadMatchWithScorers,
  readJsonObject,
  revalidateEvent,
} from "@/lib/admin-schedule-server";
import {
  MAX_SCORER_NAME_LENGTH,
  type MatchResultScorerInput,
} from "@/lib/types";

type Ctx = { params: Promise<{ id: string; matchId: string }> };

const MAX_SCORER_ROWS = 60;

function parseScorers(
  raw: unknown
): { ok: true; value: MatchResultScorerInput[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Scorers must be a list." };
  if (raw.length > MAX_SCORER_ROWS) {
    return { ok: false, error: `That is too many scorer rows (max ${MAX_SCORER_ROWS}).` };
  }
  const out: MatchResultScorerInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Each scorer must be an object." };
    }
    const s = item as Record<string, unknown>;
    if (typeof s.team_id !== "string" || !UUID_RE.test(s.team_id)) {
      return { ok: false, error: "Each scorer needs a team." };
    }
    const ownGoal = s.own_goal === true;
    const name =
      typeof s.scorer_name === "string" ? s.scorer_name.trim() : "";
    if (!ownGoal && !name) {
      return { ok: false, error: "Every scorer needs a name." };
    }
    if (name.length > MAX_SCORER_NAME_LENGTH) {
      return {
        ok: false,
        error: `A scorer name is too long (max ${MAX_SCORER_NAME_LENGTH} characters).`,
      };
    }
    const goalsRaw = s.goals == null || s.goals === "" ? 1 : Number(s.goals);
    if (!Number.isInteger(goalsRaw) || goalsRaw < 1 || goalsRaw > 99) {
      return { ok: false, error: "Goals must be a whole number from 1 to 99." };
    }
    let contactId: string | null = null;
    if (!ownGoal && s.contact_id != null && s.contact_id !== "") {
      if (typeof s.contact_id !== "string" || !UUID_RE.test(s.contact_id)) {
        return { ok: false, error: "A scorer's person id is not valid." };
      }
      contactId = s.contact_id;
    }
    out.push({
      team_id: s.team_id,
      scorer_name: ownGoal ? "Own goal" : name,
      goals: goalsRaw,
      own_goal: ownGoal,
      contact_id: contactId,
    });
  }
  return { ok: true, value: out };
}

/**
 * Save the whole result of a match — both scores and every scorer — in one
 * database transaction (public.save_match_result). This is the ONLY way a
 * match becomes completed, so a completed match always has both scores and its
 * scorers always match what the owner last saw on screen.
 */
export async function PUT(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, matchId } = await ctx.params;
  const body = await readJsonObject(request);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
  const b = body.value;

  const home = Number(b.home_score);
  const away = Number(b.away_score);
  if (
    b.home_score == null || b.home_score === "" ||
    b.away_score == null || b.away_score === "" ||
    !Number.isInteger(home) || !Number.isInteger(away) ||
    home < 0 || away < 0 || home > 99 || away > 99
  ) {
    return NextResponse.json(
      { error: "Enter both scores as whole numbers from 0 to 99." },
      { status: 400 }
    );
  }
  const scorers = parseScorers(b.scorers);
  if (!scorers.ok) return NextResponse.json({ error: scorers.error }, { status: 400 });

  const { error } = await supabaseAdmin.rpc("save_match_result", {
    p_tournament_id: id,
    p_match_id: matchId,
    p_home: home,
    p_away: away,
    p_scorers: scorers.value,
  });
  if (error) {
    const t = translateDbError(error, "Could not save the result.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  await revalidateEvent(id);
  const match = await loadMatchWithScorers(id, matchId);
  return NextResponse.json({ match });
}

/** Undo a result: scores cleared, scorers removed, status back to scheduled. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, matchId } = await ctx.params;
  const { error } = await supabaseAdmin.rpc("clear_match_result", {
    p_tournament_id: id,
    p_match_id: matchId,
  });
  if (error) {
    const t = translateDbError(error, "Could not clear the result.");
    return NextResponse.json({ error: t.message }, { status: t.status });
  }

  await revalidateEvent(id);
  const match = await loadMatchWithScorers(id, matchId);
  return NextResponse.json({ match });
}
