import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { recordCheckoutSessionPayment } from "@/lib/stripe-payments";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const outcome = await recordCheckoutSessionPayment(session);
    if (outcome.status === "error") {
      console.error("Stripe webhook: record failed", outcome.error);
    }
  }

  return NextResponse.json({ received: true });
}
