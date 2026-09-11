import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { translateDbError } from "@/lib/admin-db-errors";

/**
 * Withdraw a receipt that should not have been recorded.
 *
 * A correction is a void plus a new receipt, never an edit: an audit trail that
 * can be rewritten is not an audit trail. The row stays, carrying who voided it
 * and why, and `void_manual_payment` recomputes the registration's payment
 * status — including downwards, which is the point.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string; receiptId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id, receiptId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(receiptId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    /* an empty body is fine; only voided_by is required */
  }

  const voidedBy =
    typeof body.voided_by === "string" ? body.voided_by.trim().slice(0, 120) : "";
  if (!voidedBy) {
    return NextResponse.json({ error: "Say who is voiding this." }, { status: 400 });
  }
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 500)
      : null;

  // Scope the void to this registration so a receipt id from elsewhere cannot be
  // voided through another player's dialog.
  const { data: owned, error: lookupError } = await supabaseAdmin
    .from("manual_payments")
    .select("id")
    .eq("id", receiptId)
    .eq("registration_id", id)
    .maybeSingle();

  if (lookupError) {
    console.error("[manual-payments] void lookup failed:", lookupError.message);
    return NextResponse.json({ error: "Could not void that receipt." }, { status: 500 });
  }
  if (!owned) {
    return NextResponse.json(
      { error: "That receipt is not on this registration." },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc("void_manual_payment", {
    p: { id: receiptId, voided_by: voidedBy, reason },
  });

  if (error) {
    console.error("[manual-payments] void failed:", error.message);
    const { message, status } = translateDbError(
      error,
      "Could not void that receipt."
    );
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(data ?? {});
}
