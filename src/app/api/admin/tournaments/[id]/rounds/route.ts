import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  MAX_ROUND_LABEL_LENGTH,
  MAX_ROUND_NOTE_LENGTH,
  TOURNAMENT_ROUND_STATUSES,
  type TournamentRoundStatus,
} from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const STATUS_SET = new Set<string>(TOURNAMENT_ROUND_STATUSES);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseOptionalString(
  raw: unknown,
  field: string,
  max: number
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: `${field} must be a string.` };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) {
    return { ok: false, error: `${field} is too long (max ${max} chars).` };
  }
  return { ok: true, value: trimmed };
}

function parseOptionalDate(
  raw: unknown,
  field: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string" || !ISO_DATE_RE.test(raw)) {
    return { ok: false, error: `${field} must be a YYYY-MM-DD date.` };
  }
  return { ok: true, value: raw };
}

function parseRequiredLabel(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Label is required." };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Label is required." };
  if (trimmed.length > MAX_ROUND_LABEL_LENGTH) {
    return {
      ok: false,
      error: `Label is too long (max ${MAX_ROUND_LABEL_LENGTH} chars).`,
    };
  }
  return { ok: true, value: trimmed };
}

function parseStatus(
  raw: unknown
): { ok: true; value: TournamentRoundStatus } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, value: "scheduled" };
  if (typeof raw !== "string" || !STATUS_SET.has(raw)) {
    return { ok: false, error: "Invalid status." };
  }
  return { ok: true, value: raw as TournamentRoundStatus };
}

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin
    .from("tournament_rounds")
    .select("*")
    .eq("tournament_id", id)
    .order("sort_order", { ascending: true })
    .order("round_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rounds: data ?? [] });
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
  const b = body as Record<string, unknown>;

  const label = parseRequiredLabel(b.label);
  if (!label.ok) return NextResponse.json({ error: label.error }, { status: 400 });
  const status = parseStatus(b.status);
  if (!status.ok) return NextResponse.json({ error: status.error }, { status: 400 });
  const roundDate = parseOptionalDate(b.round_date, "Round date");
  if (!roundDate.ok)
    return NextResponse.json({ error: roundDate.error }, { status: 400 });
  const rescheduledTo = parseOptionalDate(b.rescheduled_to, "Rescheduled date");
  if (!rescheduledTo.ok)
    return NextResponse.json({ error: rescheduledTo.error }, { status: 400 });
  const timeStart = parseOptionalString(b.time_start, "Start time", 40);
  if (!timeStart.ok)
    return NextResponse.json({ error: timeStart.error }, { status: 400 });
  const timeEnd = parseOptionalString(b.time_end, "End time", 40);
  if (!timeEnd.ok) return NextResponse.json({ error: timeEnd.error }, { status: 400 });
  const note = parseOptionalString(b.note, "Note", MAX_ROUND_NOTE_LENGTH);
  if (!note.ok) return NextResponse.json({ error: note.error }, { status: 400 });

  // Verify tournament + grab slug for revalidate
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

  // Default sort_order = current max + 1
  const { data: maxRow } = await supabaseAdmin
    .from("tournament_rounds")
    .select("sort_order")
    .eq("tournament_id", id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxRow?.sort_order as number | undefined) ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from("tournament_rounds")
    .insert({
      tournament_id: id,
      label: label.value,
      round_date: roundDate.value,
      time_start: timeStart.value,
      time_end: timeEnd.value,
      status: status.value,
      note: note.value,
      rescheduled_to: rescheduledTo.value,
      sort_order: nextSort,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/events/${tournament.slug}`);
  revalidatePath("/events");
  return NextResponse.json({ round: data });
}
