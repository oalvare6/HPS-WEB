import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  MAX_ROUND_LABEL_LENGTH,
  MAX_ROUND_NOTE_LENGTH,
  TOURNAMENT_ROUND_STATUSES,
} from "@/lib/types";

type Ctx = { params: Promise<{ id: string; roundId: string }> };

const STATUS_SET = new Set<string>(TOURNAMENT_ROUND_STATUSES);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  const { id, roundId } = await ctx.params;

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

  if ("label" in b) {
    if (typeof b.label !== "string") {
      return NextResponse.json({ error: "Label must be a string." }, { status: 400 });
    }
    const trimmed = b.label.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Label cannot be empty." }, { status: 400 });
    }
    if (trimmed.length > MAX_ROUND_LABEL_LENGTH) {
      return NextResponse.json(
        { error: `Label is too long (max ${MAX_ROUND_LABEL_LENGTH} chars).` },
        { status: 400 }
      );
    }
    patch.label = trimmed;
  }
  if ("status" in b) {
    if (typeof b.status !== "string" || !STATUS_SET.has(b.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    patch.status = b.status;
  }
  if ("round_date" in b) {
    const v = b.round_date;
    if (v == null || v === "") {
      patch.round_date = null;
    } else if (typeof v !== "string" || !ISO_DATE_RE.test(v)) {
      return NextResponse.json(
        { error: "Round date must be a YYYY-MM-DD date." },
        { status: 400 }
      );
    } else {
      patch.round_date = v;
    }
  }
  if ("rescheduled_to" in b) {
    const v = b.rescheduled_to;
    if (v == null || v === "") {
      patch.rescheduled_to = null;
    } else if (typeof v !== "string" || !ISO_DATE_RE.test(v)) {
      return NextResponse.json(
        { error: "Rescheduled date must be a YYYY-MM-DD date." },
        { status: 400 }
      );
    } else {
      patch.rescheduled_to = v;
    }
  }
  for (const field of ["time_start", "time_end"] as const) {
    if (field in b) {
      const v = b[field];
      if (v == null || v === "") {
        patch[field] = null;
      } else if (typeof v !== "string") {
        return NextResponse.json(
          { error: `${field} must be a string.` },
          { status: 400 }
        );
      } else {
        patch[field] = v.trim() || null;
      }
    }
  }
  if ("note" in b) {
    const v = b.note;
    if (v == null || v === "") {
      patch.note = null;
    } else if (typeof v !== "string") {
      return NextResponse.json({ error: "Note must be a string." }, { status: 400 });
    } else {
      const trimmed = v.trim();
      if (trimmed.length > MAX_ROUND_NOTE_LENGTH) {
        return NextResponse.json(
          { error: `Note is too long (max ${MAX_ROUND_NOTE_LENGTH} chars).` },
          { status: 400 }
        );
      }
      patch.note = trimmed || null;
    }
  }
  if ("sort_order" in b) {
    const n = typeof b.sort_order === "number" ? b.sort_order : Number(b.sort_order);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return NextResponse.json(
        { error: "sort_order must be an integer." },
        { status: 400 }
      );
    }
    patch.sort_order = n;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tournament_rounds")
    .update(patch)
    .eq("id", roundId)
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
  return NextResponse.json({ round: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, roundId } = await ctx.params;
  const { error } = await supabaseAdmin
    .from("tournament_rounds")
    .delete()
    .eq("id", roundId)
    .eq("tournament_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const slug = await getTournamentSlug(id);
  if (slug) revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
  return NextResponse.json({ ok: true });
}
