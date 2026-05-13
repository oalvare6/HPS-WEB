import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { MAX_UPDATE_BODY_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin
    .from("tournament_updates")
    .select("*")
    .eq("tournament_id", id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ updates: data ?? [] });
}

export async function POST(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }
  const { body: text, pinned } = body as { body?: unknown; pinned?: unknown };
  if (typeof text !== "string") {
    return NextResponse.json({ error: "Update body is required." }, { status: 400 });
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

  const { data: tournament, error: tErr } = await supabaseAdmin
    .from("tournaments")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();
  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("tournament_updates")
    .insert({
      tournament_id: id,
      body: trimmed,
      pinned: pinned === true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/events/${tournament.slug}`);
  revalidatePath("/events");
  return NextResponse.json({ update: data });
}
