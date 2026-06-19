import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MAX_SCORER_NAME_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string; matchId: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Confirms the match exists under the tournament and returns the slug. */
async function resolveMatch(
  tournamentId: string,
  matchId: string
): Promise<{ slug: string } | null> {
  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("id, tournament_id")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (!match) return null;
  const { data: tournament } = await supabaseAdmin
    .from("tournaments")
    .select("slug")
    .eq("id", tournamentId)
    .maybeSingle();
  return { slug: (tournament?.slug as string | undefined) ?? "" };
}

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { matchId } = await ctx.params;
  const { data, error } = await supabaseAdmin
    .from("match_scorers")
    .select("*")
    .eq("match_id", matchId)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scorers: data ?? [] });
}

export async function POST(request: Request, ctx: Ctx) {
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

  if (typeof b.scorer_name !== "string" || !b.scorer_name.trim()) {
    return NextResponse.json({ error: "Scorer name is required." }, { status: 400 });
  }
  const scorerName = b.scorer_name.trim();
  if (scorerName.length > MAX_SCORER_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Scorer name is too long (max ${MAX_SCORER_NAME_LENGTH} chars).` },
      { status: 400 }
    );
  }

  let teamId: string | null = null;
  if (b.team_id != null && b.team_id !== "") {
    if (typeof b.team_id !== "string" || !UUID_RE.test(b.team_id)) {
      return NextResponse.json({ error: "Team must be a valid id." }, { status: 400 });
    }
    teamId = b.team_id;
  }

  let goals = 1;
  if (b.goals != null && b.goals !== "") {
    const n = typeof b.goals === "number" ? b.goals : Number(b.goals);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      return NextResponse.json(
        { error: "Goals must be a whole number of at least 1." },
        { status: 400 }
      );
    }
    goals = n;
  }

  const resolved = await resolveMatch(id, matchId);
  if (!resolved) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
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
      scorer_name: scorerName,
      goals,
      sort_order: nextSort,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (resolved.slug) revalidatePath(`/events/${resolved.slug}`);
  return NextResponse.json({ scorer: data });
}
