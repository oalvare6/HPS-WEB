import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { upsertContactByEmail, normalizeEmail } from "@/lib/contacts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RecordPaymentOutcome =
  | { status: "already_recorded"; paymentId: string }
  | { status: "recorded"; paymentId: string }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string };

function readMetaUuid(
  meta: Stripe.Metadata | null | undefined,
  key: string
): string | null {
  const raw = meta?.[key];
  if (!raw) return null;
  return UUID_RE.test(raw) ? raw : null;
}

/**
 * Idempotently record a successful Checkout Session as a payment, resolving
 * and linking contact_id, tournament_id, registration_id, and drop_in_id from
 * session metadata. Also flips downstream rows (registration payment_status,
 * drop_in payment_status) to 'paid'.
 *
 * Safe to call from both the webhook and the post-redirect verify-session
 * fallback. The unique index on `stripe_session_id` prevents double inserts.
 */
export async function recordCheckoutSessionPayment(
  session: Stripe.Checkout.Session
): Promise<RecordPaymentOutcome> {
  const email = normalizeEmail(
    session.metadata?.email ?? session.customer_email ?? ""
  );

  if (!email) {
    return { status: "skipped", reason: "no_email" };
  }

  const tournamentId = readMetaUuid(session.metadata, "tournament_id");
  const registrationIdMeta = readMetaUuid(session.metadata, "registration_id");
  const dropInId = readMetaUuid(session.metadata, "drop_in_id");
  const contactIdMeta = readMetaUuid(session.metadata, "contact_id");
  const tournamentName = session.metadata?.tournament_name ?? null;
  const amountTotal = session.amount_total ?? 0;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const { data: existing } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (existing) {
    return { status: "already_recorded", paymentId: existing.id };
  }

  let contactId: string | null = contactIdMeta;
  if (!contactId) {
    const { contact } = await upsertContactByEmail({
      first_name: "",
      last_name: "",
      email,
      tags: ["paid"],
    });
    contactId = contact?.id ?? null;
  }

  let registrationId: string | null = registrationIdMeta;
  if (!registrationId) {
    let query = supabaseAdmin
      .from("registrations")
      .select("id")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1);
    if (tournamentId) {
      query = query.eq("tournament_id", tournamentId);
    }
    const { data: reg } = await query.maybeSingle();
    registrationId = reg?.id ?? null;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("payments")
    .insert({
      email,
      tournament_id: tournamentId,
      tournament_name: tournamentName,
      contact_id: contactId,
      registration_id: registrationId,
      drop_in_id: dropInId,
      amount: amountTotal / 100,
      currency: session.currency ?? "usd",
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      status: "succeeded",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[stripe-payments] insert failed:", error?.message);
    return { status: "error", error: error?.message ?? "insert failed" };
  }

  if (registrationId) {
    const { error: regErr } = await supabaseAdmin
      .from("registrations")
      .update({ payment_status: "paid" })
      .eq("id", registrationId);
    if (regErr) {
      console.error("[stripe-payments] registration update failed:", regErr.message);
    }
  }

  if (dropInId) {
    const { error: dropErr } = await supabaseAdmin
      .from("drop_ins")
      .update({ payment_status: "paid" })
      .eq("id", dropInId);
    if (dropErr) {
      console.error("[stripe-payments] drop_in update failed:", dropErr.message);
    }
  }

  return { status: "recorded", paymentId: inserted.id };
}
