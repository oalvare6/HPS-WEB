import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MAX_SCORER_NAME_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string; matchId: string; goalId: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const { id, matchId, goalId } = await ctx.params;

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
      return NextResponse.json({ error: "Scorer name cannot be empty." }, { status: 400 });
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
  if ("team_id" in b) {
    const v = b.team_id;
    if (v == null || v === "") {
      patch.team_id = null;
    } else if (typeof v !== "string" || !UUID_RE.test(v)) {
      return NextResponse.json({ error: "Team must be a valid id." }, { status: 400 });
    } else {
      patch.team_id = v;
    }
  }
  if ("goals" in b) {
    const n = typeof b.goals === "number" ? b.goals : Number(b.goals);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      return NextResponse.json(
        { error: "Goals must be a whole number of at least 1." },
        { status: 400 }
      );
    }
    patch.goals = n;
  }
  if ("sort_order" in b) {
    const n = typeof b.sort_order === "number" ? b.sort_order : Number(b.sort_order);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return NextResponse.json({ error: "sort_order must be an integer." }, { status: 400 });
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

  const { id, matchId, goalId } = await ctx.params;
  const { error } = await supabaseAdmin
    .from("match_scorers")
    .delete()
    .eq("id", goalId)
    .eq("match_id", matchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const slug = await getTournamentSlug(id);
  if (slug) revalidatePath(`/events/${slug}`);
  return NextResponse.json({ ok: true });
}
