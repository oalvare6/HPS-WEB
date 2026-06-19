import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MAX_SCORER_NAME_LENGTH } from "@/lib/types";
import { isUuid, parseGoals } from "@/lib/match-input";

type Ctx = {
  params: Promise<{ id: string; matchId: string; scorerId: string }>;
};

async function getTournamentSlug(id: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("tournaments")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

export async function PATCH(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, scorerId } = await ctx.params;

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
  const patch: Record<string, unknown> = {};

  if ("scorer_name" in b) {
    if (typeof b.scorer_name !== "string" || !b.scorer_name.trim()) {
      return NextResponse.json({ error: "Scorer name is required." }, { status: 400 });
    }
    const trimmed = b.scorer_name.trim();
    if (trimmed.length > MAX_SCORER_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Scorer name is too long (max ${MAX_SCORER_NAME_LENGTH} chars).` },
        { status: 400 }
      );
    }
    patch.scorer_name = trimmed;
  }
  if ("goals" in b) {
    const goals = parseGoals(b.goals);
    if (goals == null) {
      return NextResponse.json(
        { error: "Goals must be a whole number from 1 to 99." },
        { status: 400 }
      );
    }
    patch.goals = goals;
  }
  if ("team_id" in b) {
    if (b.team_id == null || b.team_id === "") {
      patch.team_id = null;
    } else if (typeof b.team_id !== "string" || !isUuid(b.team_id)) {
      return NextResponse.json({ error: "Invalid team id." }, { status: 400 });
    } else {
      patch.team_id = b.team_id;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("match_scorers")
    .update(patch)
    .eq("id", scorerId)
    .select("*")
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const slug = await getTournamentSlug(id);
  if (slug) revalidatePath(`/events/${slug}`);
  return NextResponse.json({ scorer: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, scorerId } = await ctx.params;
  const { error } = await supabaseAdmin
    .from("match_scorers")
    .delete()
    .eq("id", scorerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const slug = await getTournamentSlug(id);
  if (slug) revalidatePath(`/events/${slug}`);
  return NextResponse.json({ ok: true });
}
