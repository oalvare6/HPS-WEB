import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  MATCH_STATUSES,
  MAX_MATCH_LABEL_LENGTH,
  MAX_MATCH_NOTE_LENGTH,
} from "@/lib/types";

type Ctx = { params: Promise<{ id: string; matchId: string }> };

const STATUS_SET = new Set<string>(MATCH_STATUSES);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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

function setOptionalString(
  patch: Record<string, unknown>,
  b: Record<string, unknown>,
  field: string,
  max: number
): string | null {
  if (!(field in b)) return null;
  const v = b[field];
  if (v == null || v === "") {
    patch[field] = null;
    return null;
  }
  if (typeof v !== "string") return `${field} must be a string.`;
  const trimmed = v.trim();
  if (trimmed.length > max) return `${field} is too long (max ${max} chars).`;
  patch[field] = trimmed || null;
  return null;
}

function setOptionalUuid(
  patch: Record<string, unknown>,
  b: Record<string, unknown>,
  field: string
): string | null {
  if (!(field in b)) return null;
  const v = b[field];
  if (v == null || v === "") {
    patch[field] = null;
    return null;
  }
  if (typeof v !== "string" || !UUID_RE.test(v)) return `${field} must be a valid id.`;
  patch[field] = v;
  return null;
}

function setOptionalInt(
  patch: Record<string, unknown>,
  b: Record<string, unknown>,
  field: string,
  { min }: { min?: number } = {}
): string | null {
  if (!(field in b)) return null;
  const v = b[field];
  if (v == null || v === "") {
    patch[field] = null;
    return null;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return `${field} must be an integer.`;
  }
  if (min != null && n < min) return `${field} must be at least ${min}.`;
  patch[field] = n;
  return null;
}

export async function PATCH(request: Request, ctx: Ctx) {
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

  const patch: Record<string, unknown> = {};
  let err: string | null = null;

  if ("status" in b) {
    if (typeof b.status !== "string" || !STATUS_SET.has(b.status)) {
      return NextResponse.json({ error: "Invalid match status." }, { status: 400 });
    }
    patch.status = b.status;
  }
  if ("match_date" in b) {
    const v = b.match_date;
    if (v == null || v === "") {
      patch.match_date = null;
    } else if (typeof v !== "string" || !ISO_DATE_RE.test(v)) {
      return NextResponse.json(
        { error: "Match date must be a YYYY-MM-DD date." },
        { status: 400 }
      );
    } else {
      patch.match_date = v;
    }
  }

  err =
    setOptionalUuid(patch, b, "round_id") ||
    setOptionalUuid(patch, b, "home_team_id") ||
    setOptionalUuid(patch, b, "away_team_id") ||
    setOptionalString(patch, b, "home_team_label", MAX_MATCH_LABEL_LENGTH) ||
    setOptionalString(patch, b, "away_team_label", MAX_MATCH_LABEL_LENGTH) ||
    setOptionalString(patch, b, "kickoff_time", 40) ||
    setOptionalString(patch, b, "notes", MAX_MATCH_NOTE_LENGTH) ||
    setOptionalInt(patch, b, "match_number", { min: 0 }) ||
    setOptionalInt(patch, b, "home_score", { min: 0 }) ||
    setOptionalInt(patch, b, "away_score", { min: 0 }) ||
    setOptionalInt(patch, b, "sort_order");
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("matches")
    .update(patch)
    .eq("id", matchId)
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
  return NextResponse.json({ match: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, matchId } = await ctx.params;
  const { error } = await supabaseAdmin
    .from("matches")
    .delete()
    .eq("id", matchId)
    .eq("tournament_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const slug = await getTournamentSlug(id);
  if (slug) revalidatePath(`/events/${slug}`);
  revalidatePath("/events");
  return NextResponse.json({ ok: true });
}
