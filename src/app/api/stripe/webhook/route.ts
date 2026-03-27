import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  // #region agent log
  fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'stripe/webhook/route.ts:entry',message:'Webhook POST received',data:{hasSig:!!sig,hasSecret:!!webhookSecret,bodyLen:rawBody.length},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'stripe/webhook/route.ts:sigFail',message:'Signature verification FAILED',data:{error:String(err)},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // #region agent log
  fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'stripe/webhook/route.ts:eventType',message:'Event received',data:{eventType:event.type},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'stripe/webhook/route.ts:sessionData',message:'Checkout session data',data:{email,tournamentName,registrationId,amountTotal,paymentIntentId,sessionId:session.id},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'stripe/webhook/route.ts:preInsert',message:'About to insert payment',data:{email,resolvedRegistrationId,amount:amountTotal/100},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'stripe/webhook/route.ts:postInsert',message:'Payment insert result',data:{success:!error,error:error?JSON.stringify(error):null},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    if (error) {
      console.error("Failed to insert payment record:", error);
    }

    if (resolvedRegistrationId) {
      const { error: updateErr } = await supabaseAdmin
        .from("registrations")
        .update({ payment_status: "paid" })
        .eq("id", resolvedRegistrationId);

      // #region agent log
      fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'stripe/webhook/route.ts:regUpdate',message:'Registration payment_status update result',data:{resolvedRegistrationId,success:!updateErr,error:updateErr?JSON.stringify(updateErr):null},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
      // #endregion

      if (updateErr) {
        console.error("Failed to update registration payment_status:", updateErr);
      }
    }
  }

  return NextResponse.json({ received: true });
}
