import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";
import type { TournamentInput } from "@/lib/types";

export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .order("display_order", { ascending: true })
    .order("start_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tournaments: data ?? [] });
}

export async function POST(request: Request) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as Partial<TournamentInput>;

  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const slug = body.slug && body.slug.trim().length > 0 ? slugify(body.slug) : slugify(body.title);
  if (!slug) {
    return NextResponse.json({ error: "Slug could not be generated." }, { status: 400 });
  }

  const row = {
    title: body.title,
    slug,
    status: body.status ?? "upcoming",
    registration_open: body.registration_open ?? false,
    payments_open: body.payments_open ?? false,
    description: body.description ?? null,
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    time_start: body.time_start ?? null,
    time_end: body.time_end ?? null,
    recurrence: body.recurrence ?? null,
    location: body.location ?? null,
    format: body.format ?? null,
    entry_fee: body.entry_fee ?? null,
    max_teams: body.max_teams ?? null,
    image_url: body.image_url ?? null,
    image_preset: body.image_preset ?? null,
    register_url: body.register_url ?? null,
    pay_url: body.pay_url ?? null,
    display_order: body.display_order ?? 0,
  };

  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .insert(row)
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
