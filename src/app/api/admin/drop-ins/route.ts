import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import {
  DROP_IN_PAYMENT_STATUSES,
  MAX_DROP_IN_NOTE_LENGTH,
  type DropInPaymentStatus,
} from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUS = new Set<DropInPaymentStatus>(DROP_IN_PAYMENT_STATUSES);

export async function GET(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const tournamentId = url.searchParams.get("tournament_id");
  const status = url.searchParams.get("status");

  try {
    let query = supabaseAdmin
      .from("drop_ins")
      .select(
        `id, created_at, tournament_id, round_id, contact_id, paid_by_contact_id,
         amount_cents, payment_status, notes,
         tournament:tournaments ( id, title, slug ),
         round:tournament_rounds ( id, label, round_date ),
         contact:contacts ( id, first_name, last_name, email, phone ),
         paid_by:contacts!drop_ins_paid_by_contact_id_fkey ( id, first_name, last_name, email )`
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (tournamentId && UUID_RE.test(tournamentId)) {
      query = query.eq("tournament_id", tournamentId);
    }
    if (status && VALID_STATUS.has(status as DropInPaymentStatus)) {
      query = query.eq("payment_status", status);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Admin drop-ins fetch error:", error);
      return NextResponse.json(
        { error: error.message ?? "Failed to load drop-ins." },
        { status: 500 }
      );
    }

    return NextResponse.json({ drop_ins: data ?? [] });
  } catch (err) {
    console.error("Admin drop-ins error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const tournamentId =
      typeof body.tournament_id === "string" && UUID_RE.test(body.tournament_id)
        ? body.tournament_id
        : null;
    const contactId =
      typeof body.contact_id === "string" && UUID_RE.test(body.contact_id)
        ? body.contact_id
        : null;
    const roundId =
      typeof body.round_id === "string" && UUID_RE.test(body.round_id)
        ? body.round_id
        : null;
    const paidByContactId =
      typeof body.paid_by_contact_id === "string" &&
      UUID_RE.test(body.paid_by_contact_id)
        ? body.paid_by_contact_id
        : null;
    const amountCents = Number(body.amount_cents);
    const status =
      typeof body.payment_status === "string" &&
      VALID_STATUS.has(body.payment_status as DropInPaymentStatus)
        ? (body.payment_status as DropInPaymentStatus)
        : "pending";
    const notes =
      typeof body.notes === "string"
        ? body.notes.slice(0, MAX_DROP_IN_NOTE_LENGTH)
        : null;

    if (!tournamentId) {
      return NextResponse.json(
        { error: "tournament_id is required." },
        { status: 400 }
      );
    }
    if (!contactId) {
      return NextResponse.json(
        { error: "contact_id is required." },
        { status: 400 }
      );
    }
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      return NextResponse.json(
        { error: "amount_cents must be a non-negative integer." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("drop_ins")
      .insert({
        tournament_id: tournamentId,
        contact_id: contactId,
        round_id: roundId,
        paid_by_contact_id: paidByContactId,
        amount_cents: Math.round(amountCents),
        payment_status: status,
        notes,
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Insert failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error("Admin drop-ins POST error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
