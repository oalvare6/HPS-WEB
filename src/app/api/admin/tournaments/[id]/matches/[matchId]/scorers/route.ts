import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MAX_SCORER_NAME_LENGTH } from "@/lib/types";
import { isUuid, parseGoals } from "@/lib/match-input";

type Ctx = { params: Promise<{ id: string; matchId: string }> };

async function getTournamentSlug(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("tournaments")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? null;
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

  const name = typeof b.scorer_name === "string" ? b.scorer_name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Scorer name is required." }, { status: 400 });
  }
  if (name.length > MAX_SCORER_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Scorer name is too long (max ${MAX_SCORER_NAME_LENGTH} chars).` },
      { status: 400 }
    );
  }
  const goals = parseGoals(b.goals);
  if (goals == null) {
    return NextResponse.json(
      { error: "Goals must be a whole number from 1 to 99." },
      { status: 400 }
    );
  }
  let teamId: string | null = null;
  if (b.team_id != null && b.team_id !== "") {
    if (typeof b.team_id !== "string" || !isUuid(b.team_id)) {
      return NextResponse.json({ error: "Invalid team id." }, { status: 400 });
    }
    teamId = b.team_id;
  }

  // Confirm the match belongs to this tournament before attaching scorers.
  const { data: match, error: mErr } = await supabaseAdmin
    .from("matches")
    .select("id")
    .eq("id", matchId)
    .eq("tournament_id", id)
    .maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("match_scorers")
    .insert({
      match_id: matchId,
      team_id: teamId,
      scorer_name: name,
      goals,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const slug = await getTournamentSlug(id);
  if (slug) revalidatePath(`/events/${slug}`);
  return NextResponse.json({ scorer: data });
}
