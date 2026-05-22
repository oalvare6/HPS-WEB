import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { normalizeEmail } from "@/lib/contacts";
import { hasAuthUserForEmail } from "@/lib/player-auth";
import { getStripe } from "@/lib/stripe";
import { recordCheckoutSessionPayment } from "@/lib/stripe-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

    if (outcome.status === "recorded") {
      // First time we've seen this Stripe session. If the payer has no
      // Supabase auth user yet, send a one-off "claim your account" email
      // via Supabase's invite flow. Replays
      // (`outcome.status === "already_recorded"`) intentionally skip this
      // so Stripe retries don't re-send the invite.
      await maybeSendClaimInvite(req, session);
    }
  }

  return NextResponse.json({ received: true });
}

/**
 * Side-effect-only: ship a Supabase invite email to a paying customer who
 * doesn't yet have an `auth.users` row. Failures are logged and swallowed
 * so a flaky SMTP / GoTrue / network hop never causes Stripe to redeliver
 * the webhook (which would otherwise duplicate the payment record check
 * and risk multiple invite emails).
 */
async function maybeSendClaimInvite(
  req: NextRequest,
  session: Stripe.Checkout.Session
): Promise<void> {
  try {
    const email = normalizeEmail(
      session.metadata?.email ?? session.customer_email ?? ""
    );
    if (!email) return;

    const exists = await hasAuthUserForEmail(email);
    if (exists) return;

    const origin = resolveSiteOrigin(req);
    const redirectTo = new URL("/auth/callback", origin);
    redirectTo.searchParams.set("next", "/auth/claim");

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectTo.toString(),
    });
    if (error) {
      console.error(
        "[stripe-webhook] inviteUserByEmail failed:",
        email,
        error.message
      );
    }
  } catch (err) {
    console.error("[stripe-webhook] maybeSendClaimInvite threw:", err);
  }
}

function resolveSiteOrigin(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return new URL(req.url).origin;
}
