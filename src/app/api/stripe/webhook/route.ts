import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { recordCheckoutSessionPayment } from "@/lib/stripe-payments";

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

    // We used to email a Supabase invite here so the payer could "claim" an
    // account. That is gone with email sign-in (D5): the invite created an
    // email-identity account whose only key was the emailed link, so once
    // sign-in became Google/Apple only it would have minted accounts nobody
    // could open a second time. Production already has 28 accounts and 5 that
    // have ever been signed into; there was no case for manufacturing more.
    //
    // `/pay/success` now offers Google/Apple directly instead, which links to
    // the same person by verified email with no dead-end row in between.
  }

  return NextResponse.json({ received: true });
}

