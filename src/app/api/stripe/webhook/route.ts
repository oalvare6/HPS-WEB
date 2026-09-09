import { NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";
import { handleStripeWebhook } from "@/lib/stripe-webhook";
import { getFinalizeStore } from "@/lib/payment-finalize-store-supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 *
 * The contract lives in src/lib/stripe-webhook.ts (signature → supported
 * events → re-validated finalisation → 2xx only after commit; 5xx so Stripe
 * retries a local failure). This file only wires production dependencies.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  return handleStripeWebhook(rawBody, req.headers.get("stripe-signature"), {
    constructEvent: (body, sig, secret) => getStripe().webhooks.constructEvent(body, sig, secret),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    store: getFinalizeStore(),
  });
}
