import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateDbError } from "@/lib/admin-db-errors";
import {
  MANUAL_PAYMENT_METHODS,
  MAX_MANUAL_PAYMENT_CENTS,
  isManualPaymentMethod,
  type ManualPaymentRow,
} from "@/lib/manual-payments";

/**
 * Offline money: cash, Zelle, anything Stripe never saw.
 *
 * Stage 2.3 item A. `payments` is the Stripe ledger and this route never writes
 * it; every write here goes through `record_manual_payment`, which is the one
 * writer, exactly as `save_match_result` is for results. Stripe stays
 * authoritative for card settlement — see the migration for what that means in
 * practice when both exist for one registration.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 500;

type Ctx = { params: Promise<{ id: string }> };

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid registration id." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("manual_payments")
    .select(
      "id, amount_cents, currency, method, received_at, note, recorded_by, created_at, voided_at, voided_by, void_reason"
    )
    .eq("registration_id", id)
    .order("received_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[manual-payments] list failed:", error.message);
    return NextResponse.json({ error: "Could not load receipts." }, { status: 500 });
  }

  const receipts = (data ?? []) as ManualPaymentRow[];
  // Voided receipts stay in the list — they are the audit trail — but only live
  // ones count towards what has been collected.
  const totalCents = receipts
    .filter((r) => !r.voided_at)
    .reduce((sum, r) => sum + r.amount_cents, 0);

  return NextResponse.json({ receipts, totalCents });
}

export async function POST(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid registration id." }, { status: 400 });
  }

  const body = await readJson(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Amount arrives as dollars from the form, because that is what the owner
  // types. Cents are what is stored; the conversion happens once, here.
  const amountRaw = Number(body.amount);
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
    return NextResponse.json(
      { error: "Enter an amount greater than zero." },
      { status: 400 }
    );
  }
  const amountCents = Math.round(amountRaw * 100);
  if (amountCents > MAX_MANUAL_PAYMENT_CENTS) {
    return NextResponse.json(
      { error: "That amount looks like a typo. Enter it again if it is right." },
      { status: 400 }
    );
  }

  if (!isManualPaymentMethod(body.method)) {
    return NextResponse.json(
      { error: `Method must be one of: ${MANUAL_PAYMENT_METHODS.join(", ")}.` },
      { status: 400 }
    );
  }

  const receivedAt =
    typeof body.received_at === "string" && body.received_at.trim()
      ? body.received_at.trim()
      : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedAt)) {
    return NextResponse.json(
      { error: "Enter the date the money was received." },
      { status: 400 }
    );
  }

  const recordedBy =
    typeof body.recorded_by === "string" ? body.recorded_by.trim().slice(0, 120) : "";
  if (!recordedBy) {
    return NextResponse.json(
      { error: "Say who took the payment." },
      { status: 400 }
    );
  }

  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, MAX_TEXT)
      : null;

  const { data, error } = await supabaseAdmin.rpc("record_manual_payment", {
    p: {
      registration_id: id,
      amount_cents: amountCents,
      method: body.method,
      received_at: receivedAt,
      recorded_by: recordedBy,
      note,
    },
  });

  if (error) {
    console.error("[manual-payments] record failed:", error.message);
    // The RPC raises its own operator-readable messages (amount, method, date,
    // recorded_by, unknown registration); translateDbError passes those through
    // and maps anything lower-level to something a non-technical owner can act on.
    const { message, status } = translateDbError(
      error,
      "Could not record that payment."
    );
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(data ?? {}, { status: 201 });
}
