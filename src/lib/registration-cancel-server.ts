/**
 * The database half of "take me off the roster", shared by the legacy
 * token/session route (`/api/registrations/[id]/cancel`) and the resume-session
 * route (`/pay/resume/api/cancel`). Authorisation is the CALLER's job; this
 * module only answers its one question honestly — did card money move? — and
 * stamps `cancelled_at` when the rule says it may.
 *
 * Idempotent: a second call reports `alreadyCancelled` with a 200.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  cancelBlockResponse,
  resolveCancelEligibility,
  type CardPaymentLookup,
} from "@/lib/registration-cancel";

export type CancelRegistrationResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Did Stripe take money for this spot?
 *
 * Asked of `payments`, never of `registrations.payment_status` — that column
 * reads `'paid'` for cash the owner marked by hand too, and refusing on it
 * would block exactly the cash players this feature is for. Checked two ways
 * because older payment rows lack `registration_id`. Any error returns
 * `'failed'`, which the rule treats as a refusal.
 */
export async function findSucceededCardPayment({
  registrationId,
  contactId,
  tournamentId,
}: {
  registrationId: string;
  contactId: string | null;
  tournamentId: string | null;
}): Promise<CardPaymentLookup> {
  try {
    const { data: byRegistration, error: byRegistrationErr } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("registration_id", registrationId)
      .eq("status", "succeeded")
      .limit(1)
      .maybeSingle();

    if (byRegistrationErr) throw new Error(byRegistrationErr.message);
    if (byRegistration) return "found";

    if (!contactId || !tournamentId) return "none";

    const { data: byContact, error: byContactErr } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("contact_id", contactId)
      .eq("tournament_id", tournamentId)
      .eq("status", "succeeded")
      .limit(1)
      .maybeSingle();

    if (byContactErr) throw new Error(byContactErr.message);
    return byContact ? "found" : "none";
  } catch (e) {
    console.error("[registration-cancel] payment lookup failed:", e);
    return "failed";
  }
}

/**
 * Cancel a registration the caller has ALREADY authorised. Never deletes;
 * stamps `cancelled_at` and leaves every other column alone.
 */
export async function cancelRegistrationById(
  registrationId: string
): Promise<CancelRegistrationResult> {
  const { data: registration, error: loadErr } = await supabaseAdmin
    .from("registrations")
    .select("id, contact_id, tournament_id, cancelled_at")
    .eq("id", registrationId)
    .maybeSingle();

  if (loadErr) {
    console.error("[registration-cancel] lookup failed:", loadErr.message);
    return {
      status: 500,
      body: { error: "We couldn't load that signup. Please try again." },
    };
  }
  if (!registration) {
    return { status: 404, body: { error: "Signup not found." } };
  }

  const cardPayment = await findSucceededCardPayment({
    registrationId,
    contactId: registration.contact_id,
    tournamentId: registration.tournament_id,
  });

  const eligibility = resolveCancelEligibility({
    cancelledAt: registration.cancelled_at ?? null,
    cardPayment,
  });

  if (!eligibility.allowed) {
    const { status, message } = cancelBlockResponse(eligibility.reason);
    if (status === 200) {
      return { status: 200, body: { ok: true, alreadyCancelled: true, message } };
    }
    return { status, body: { error: message, reason: eligibility.reason } };
  }

  const { error: updateErr } = await supabaseAdmin
    .from("registrations")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", registrationId)
    // Guards the gap between the read above and this write: if something else
    // cancelled it in between, this matches nothing rather than overwriting the
    // earlier timestamp with a later one.
    .is("cancelled_at", null);

  if (updateErr) {
    console.error("[registration-cancel] update failed:", updateErr.message);
    return {
      status: 500,
      body: { error: "We couldn't cancel that just now. Please try again." },
    };
  }

  return { status: 200, body: { ok: true, alreadyCancelled: false } };
}
