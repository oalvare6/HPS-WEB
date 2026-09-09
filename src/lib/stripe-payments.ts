import type Stripe from "stripe";
import { checkoutSessionFacts, finalizeCheckoutSession } from "@/lib/payment-finalize";
import { getFinalizeStore } from "@/lib/payment-finalize-store-supabase";

export type RecordPaymentOutcome =
  | { status: "already_recorded"; paymentId: string }
  | { status: "recorded"; paymentId: string }
  /** Money moved but the business facts did not match; recorded, flagged, not confirmed. */
  | { status: "needs_review"; paymentId: string | null; reason: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string };

/**
 * Record a Checkout Session as a payment and confirm what it paid for.
 *
 * Kept as the entry point for the success page and the admin sync so their
 * call sites did not have to change, but the implementation is now the F-02
 * finaliser: one database transaction (`finalize_checkout_payment`), amount /
 * currency / event re-validated against server-side rows, and — the property
 * the old version lacked — CONVERGENT: calling it for a session whose
 * `payments` row already exists still confirms a registration that is somehow
 * still `pending`. Repeated calls are no-ops.
 *
 * No Stripe event id is available on these paths, so delivery idempotency is
 * skipped and only the business-level convergence runs.
 */
export async function recordCheckoutSessionPayment(
  session: Stripe.Checkout.Session
): Promise<RecordPaymentOutcome> {
  const outcome = await finalizeCheckoutSession(checkoutSessionFacts(session), getFinalizeStore(), {
    eventId: null,
    eventType: "app",
  });

  switch (outcome.status) {
    case "finalized":
      return outcome.paymentInserted
        ? { status: "recorded", paymentId: outcome.paymentId ?? "" }
        : { status: "already_recorded", paymentId: outcome.paymentId ?? "" };
    case "needs_review":
      return { status: "needs_review", paymentId: outcome.paymentId, reason: outcome.reason };
    case "not_paid":
      return { status: "skipped", reason: `not_paid:${outcome.paymentStatus ?? "none"}` };
    case "skipped":
      return { status: "skipped", reason: outcome.reason };
    case "duplicate_event":
      // Unreachable without an event id; mapped for completeness.
      return { status: "already_recorded", paymentId: "" };
    case "error":
      return { status: "error", error: outcome.error };
  }
}
