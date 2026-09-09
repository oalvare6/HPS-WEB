/**
 * Stripe webhook contract (F-02), separated from the Next.js route so it can
 * be exercised with a signed test payload and a fake store.
 *
 *   1. verify the signature (fail closed: 400)
 *   2. parse only supported event types
 *   3. derive payment identity / amount / currency from the verified object
 *   4–7. identify → re-read → validate → finalise in one transaction
 *        (all inside finalizeCheckoutSession)
 *   8. answer 2xx ONLY once the persistence this event needs has committed.
 *
 * Retryable local failure → 500, so Stripe redelivers. Irrelevant event types
 * and already-processed deliveries → 200. A permanent business mismatch is
 * recorded and acknowledged with 200 (retrying would never change the answer;
 * the row is flagged for the owner instead).
 */
import type Stripe from "stripe";
import {
  checkoutSessionFacts,
  finalizeCheckoutSession,
  type FinalizeStore,
} from "@/lib/payment-finalize";

export const HANDLED_STRIPE_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
] as const;

export type StripeWebhookDeps = {
  /** Usually `getStripe().webhooks.constructEvent`. Must throw on a bad signature. */
  constructEvent: (rawBody: string, signature: string, secret: string) => Stripe.Event;
  webhookSecret: string;
  store: FinalizeStore;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

export async function handleStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  deps: StripeWebhookDeps
): Promise<Response> {
  let event: Stripe.Event;
  try {
    event = deps.constructEvent(rawBody, signatureHeader ?? "", deps.webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err instanceof Error ? err.message : err);
    return json({ error: "Invalid signature." }, 400);
  }

  if (!(HANDLED_STRIPE_EVENTS as readonly string[]).includes(event.type)) {
    return json({ received: true, ignored: true, type: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const facts = checkoutSessionFacts(session);

  if (event.type === "checkout.session.async_payment_failed") {
    try {
      await deps.store.recordEvent({
        eventId: event.id,
        type: event.type,
        objectId: facts.sessionId,
        outcome: "payment_failed",
        detail: null,
      });
    } catch (err) {
      console.error("Stripe webhook: could not record failed payment", err);
      return json({ error: "Could not record event." }, 500);
    }
    return json({ received: true, outcome: "payment_failed" });
  }

  const outcome = await finalizeCheckoutSession(facts, deps.store, {
    eventId: event.id,
    eventType: event.type,
  });

  switch (outcome.status) {
    case "error":
      console.error("Stripe webhook: finalisation failed", {
        eventId: event.id,
        sessionId: facts.sessionId,
        error: outcome.error,
      });
      return json({ error: "Finalisation failed; retry." }, outcome.retryable ? 500 : 200);
    case "needs_review":
      console.warn("Stripe webhook: payment recorded but NOT confirmed", {
        eventId: event.id,
        sessionId: facts.sessionId,
        registrationId: outcome.registrationId,
        reason: outcome.reason,
      });
      return json({ received: true, outcome: outcome.status });
    case "finalized":
      return json({
        received: true,
        outcome: outcome.status,
        registrationUpdated: outcome.registrationUpdated,
      });
    case "duplicate_event":
    case "not_paid":
    case "skipped":
      return json({ received: true, outcome: outcome.status });
  }
}
