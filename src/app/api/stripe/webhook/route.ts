import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Stripe from "stripe";

// Stripe requires the raw body for signature verification — disable body parsing
export const config = {
  api: { bodyParser: false },
};

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

    const email = (session.metadata?.email ?? session.customer_email ?? "").toLowerCase().trim();
    const tournamentName = session.metadata?.tournament_name ?? null;
    const registrationId = session.metadata?.registration_id ?? null;
    const amountTotal = session.amount_total ?? 0; // cents
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    if (!email) {
      console.error("Stripe webhook: no email found in session", session.id);
      return NextResponse.json({ received: true });
    }

    // If no registration_id was captured at checkout time, try to find one now
    let resolvedRegistrationId: string | null = registrationId;
    if (!resolvedRegistrationId) {
      const { data: reg } = await supabaseAdmin
        .from("registrations")
        .select("id")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedRegistrationId = reg?.id ?? null;
    }

    const { error } = await supabaseAdmin.from("payments").insert({
      email,
      tournament_name: tournamentName,
      amount: amountTotal / 100,
      currency: session.currency ?? "usd",
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      registration_id: resolvedRegistrationId,
      status: "succeeded",
    });

    if (error) {
      console.error("Failed to insert payment record:", error);
      // Still return 200 so Stripe doesn't retry; log for manual review
    }
  }

  return NextResponse.json({ received: true });
}
