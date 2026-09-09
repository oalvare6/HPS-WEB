/**
 * The database half of "I'll pay cash at the field" / "I'll pay by card",
 * shared by the signed-in account route (`/api/registrations/[id]/payment-method`)
 * and the resume-session route (`/pay/resume/api/payment-method`).
 *
 * Authorisation is the CALLER's job. This never moves money and never marks
 * anyone paid: `payment_status` stays exactly as it was and only
 * `payment_method` is written (see lib/payment-method.ts). The owner marks
 * cash collected from the Roster.
 *
 * The waiver is a hard gate on roster membership (D12) and this must not be
 * the way around it: "I'll pay cash" would otherwise be a one-click route to
 * a confirmed-looking spot with no signature on file. `ensureWaiver` lets the
 * account path add its authenticated reuse convergence; by default the row is
 * reconciled against DocuSeal and nothing else.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { reconcileIfUnsigned } from "@/lib/waiver-reconcile";
import { isSettledStatus, type PaymentMethodChoice } from "@/lib/payment-method";

export type PaymentMethodRow = {
  id: string;
  contact_id: string | null;
  waiver_type: string | null;
  payment_status: string;
  payment_method: string | null;
  waiver_signed: boolean | null;
  cancelled_at: string | null;
};

export type DeclarePaymentMethodResult = {
  status: number;
  body: Record<string, unknown>;
};

/** Default waiver check: our own column, then DocuSeal. Never a contact's waiver. */
export async function reconciledWaiverSigned(row: Pick<PaymentMethodRow, "id" | "waiver_signed">): Promise<boolean> {
  if (row.waiver_signed === true) return true;
  const reconciled = await reconcileIfUnsigned({ id: row.id, waiver_signed: false });
  return reconciled?.signed === true;
}

export async function declarePaymentMethod(
  registrationId: string,
  method: PaymentMethodChoice,
  opts: { ensureWaiver?: (row: PaymentMethodRow) => Promise<boolean> } = {}
): Promise<DeclarePaymentMethodResult> {
  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select("id, contact_id, waiver_type, payment_status, payment_method, waiver_signed, cancelled_at")
    .eq("id", registrationId)
    .maybeSingle();

  if (error) {
    console.error("[payment-method] lookup failed:", error.message);
    return { status: 500, body: { error: "We couldn't load your registration. Please try again." } };
  }
  if (!data) {
    return { status: 404, body: { error: "Registration not found." } };
  }
  const row = data as PaymentMethodRow;

  // Cancelled. Recording "I'll pay cash" against a spot they gave up would put
  // them back on the owner's collection list for a night they aren't coming to.
  if (row.cancelled_at) {
    return {
      status: 409,
      body: {
        error:
          "You cancelled this spot. Sign up again if you'd like to come, and you can pick how to pay then.",
      },
    };
  }

  // Already settled. Overwriting the method now would put "paying cash" next
  // to somebody who has paid. A no-op, not an error — this is a double-tap.
  if (isSettledStatus(row.payment_status)) {
    return {
      status: 200,
      body: {
        ok: true,
        alreadySettled: true,
        method: row.payment_method,
        paymentStatus: row.payment_status,
      },
    };
  }

  const waiverSigned = await (opts.ensureWaiver ?? reconciledWaiverSigned)(row);
  if (!waiverSigned) {
    return {
      status: 409,
      body: {
        error: "Sign your waiver first — we can't hold a spot without it. It takes about a minute.",
        needsWaiver: true,
      },
    };
  }

  const { error: updateErr } = await supabaseAdmin
    .from("registrations")
    // payment_status is deliberately absent. Declaring cash settles nothing.
    .update({ payment_method: method })
    .eq("id", registrationId);

  if (updateErr) {
    console.error("[payment-method] update failed:", updateErr.message);
    return { status: 500, body: { error: "We couldn't save that. Please try again." } };
  }

  return { status: 200, body: { ok: true, method, paymentStatus: row.payment_status } };
}
