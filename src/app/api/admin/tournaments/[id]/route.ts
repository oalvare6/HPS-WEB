import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";
import type { TournamentInput } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return NextResponse.json({ tournament: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const body = (await request.json()) as Partial<TournamentInput>;

  const update: Record<string, unknown> = {};
  const fields: (keyof TournamentInput)[] = [
    "title", "slug", "status", "registration_open", "payments_open",
    "description", "start_date", "end_date", "time_start", "time_end",
    "recurrence", "location", "format", "entry_fee", "max_teams",
    "image_url", "image_preset", "register_url", "pay_url", "display_order",
  ];
  for (const f of fields) {
    if (f in body) update[f] = body[f];
  }
  if (typeof update.slug === "string") {
    update.slug = slugify(update.slug as string);
  }
  if (typeof update.title === "string" && (!update.slug || update.slug === "")) {
    update.slug = slugify(update.title as string);
  }

  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  revalidatePath("/events");
  revalidatePath("/");
  return NextResponse.json({ tournament: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { error } = await supabaseAdmin.from("tournaments").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath("/events");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
