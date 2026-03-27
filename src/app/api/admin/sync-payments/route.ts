import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

export async function POST() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const sessions = await getStripe().checkout.sessions.list({
      limit: 100,
      status: "complete",
    });

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const session of sessions.data) {
      if (session.payment_status !== "paid") {
        skipped++;
        continue;
      }

      // Skip if already recorded
      const { data: existing } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("stripe_session_id", session.id)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const email = (
        session.metadata?.email ??
        session.customer_email ??
        ""
      ).toLowerCase().trim();
      const tournamentName = session.metadata?.tournament_name ?? null;
      const registrationId = session.metadata?.registration_id ?? null;
      const amountTotal = session.amount_total ?? 0;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);

      if (!email) {
        errors.push(`No email for session ${session.id}`);
        continue;
      }

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
        errors.push(`Insert failed for ${email}: ${error.message}`);
        continue;
      }

      if (resolvedRegistrationId) {
        await supabaseAdmin
          .from("registrations")
          .update({ payment_status: "paid" })
          .eq("id", resolvedRegistrationId);
      }

      synced++;
    }

    return NextResponse.json({ synced, skipped, errors, total: sessions.data.length });
  } catch (err) {
    console.error("Sync payments error:", err);
    return NextResponse.json(
      { error: "Failed to sync payments." },
      { status: 500 }
    );
  }
}
