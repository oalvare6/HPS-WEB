import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MAX_UPDATE_BODY_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string; updateId: string }> };

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

  const { id, updateId } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  const { body: text, pinned } = body as { body?: unknown; pinned?: unknown };
  if (text !== undefined) {
    if (typeof text !== "string") {
      return NextResponse.json({ error: "Body must be a string." }, { status: 400 });
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Update body cannot be empty." }, { status: 400 });
    }
    if (trimmed.length > MAX_UPDATE_BODY_LENGTH) {
      return NextResponse.json(
        { error: `Update is too long (max ${MAX_UPDATE_BODY_LENGTH} chars).` },
        { status: 400 }
      );
    }
    patch.body = trimmed;
  }
  if (pinned !== undefined) {
    patch.pinned = pinned === true;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tournament_updates")
    .update(patch)
    .eq("id", updateId)
    .eq("tournament_id", id)
    .select()
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const slug = await getTournamentSlug(id);
  if (slug) revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
  return NextResponse.json({ update: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, updateId } = await ctx.params;
  const { error } = await supabaseAdmin
    .from("tournament_updates")
    .delete()
    .eq("id", updateId)
    .eq("tournament_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const slug = await getTournamentSlug(id);
  if (slug) revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
  return NextResponse.json({ ok: true });
}
