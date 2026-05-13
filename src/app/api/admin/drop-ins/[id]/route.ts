import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import {
  DROP_IN_PAYMENT_STATUSES,
  MAX_DROP_IN_NOTE_LENGTH,
  type DropInPaymentStatus,
} from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUS = new Set<DropInPaymentStatus>(DROP_IN_PAYMENT_STATUSES);

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (typeof body.amount_cents === "number" && body.amount_cents >= 0) {
      patch.amount_cents = Math.round(body.amount_cents);
    }
    if (typeof body.notes === "string" || body.notes === null) {
      patch.notes =
        typeof body.notes === "string"
          ? body.notes.slice(0, MAX_DROP_IN_NOTE_LENGTH)
          : null;
    }
    if (
      typeof body.payment_status === "string" &&
      VALID_STATUS.has(body.payment_status as DropInPaymentStatus)
    ) {
      patch.payment_status = body.payment_status;
    }
    if ("round_id" in body) {
      patch.round_id =
        typeof body.round_id === "string" && UUID_RE.test(body.round_id)
          ? body.round_id
          : null;
    }
    if ("paid_by_contact_id" in body) {
      patch.paid_by_contact_id =
        typeof body.paid_by_contact_id === "string" &&
        UUID_RE.test(body.paid_by_contact_id)
          ? body.paid_by_contact_id
          : null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No fields to update." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("drop_ins")
      .update(patch)
      .eq("id", id)
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Update failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error("Admin drop-in PATCH error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin.from("drop_ins").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Admin drop-in DELETE error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
