import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = (await req.json()) as { sessionId?: string };

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 }
      );
    }

    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid" || session.status !== "complete") {
      return NextResponse.json(
        { error: "Payment not completed." },
        { status: 400 }
      );
    }

    const email = (
      session.metadata?.email ??
      session.customer_email ??
      ""
    )
      .toLowerCase()
      .trim();
    const tournamentName = session.metadata?.tournament_name ?? null;
    const registrationId = session.metadata?.registration_id ?? null;
    const amountTotal = session.amount_total ?? 0;
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    if (!email) {
      return NextResponse.json({ error: "No email on session." }, { status: 400 });
    }

    // #region agent log
    fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'stripe/verify-session/route.ts:verify',message:'Verifying session',data:{stripeSessionId:sessionId,email,tournamentName,amountTotal,paymentIntentId},timestamp:Date.now(),hypothesisId:'FIX'})}).catch(()=>{});
    // #endregion

    // Check if this payment was already recorded (idempotent)
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ status: "already_recorded", paymentId: existing.id });
    }

    // Resolve registration
    let resolvedRegistrationId: string | null = registrationId || null;
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

    const { data: payment, error } = await supabaseAdmin
      .from("payments")
      .insert({
        email,
        tournament_name: tournamentName,
        amount: amountTotal / 100,
        currency: session.currency ?? "usd",
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        registration_id: resolvedRegistrationId,
        status: "succeeded",
      })
      .select("id")
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7425/ingest/32ce3c00-1017-4a1c-8ff2-742df9280f68',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a0f19a'},body:JSON.stringify({sessionId:'a0f19a',location:'stripe/verify-session/route.ts:insertResult',message:'Payment insert result',data:{success:!error,error:error?JSON.stringify(error):null},timestamp:Date.now(),hypothesisId:'FIX'})}).catch(()=>{});
    // #endregion

    if (error) {
      console.error("verify-session: failed to insert payment:", error);
      return NextResponse.json(
        { error: "Failed to record payment." },
        { status: 500 }
      );
    }

    if (resolvedRegistrationId) {
      await supabaseAdmin
        .from("registrations")
        .update({ payment_status: "paid" })
        .eq("id", resolvedRegistrationId);
    }

    return NextResponse.json({ status: "recorded", paymentId: payment.id });
  } catch (err) {
    console.error("verify-session error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
