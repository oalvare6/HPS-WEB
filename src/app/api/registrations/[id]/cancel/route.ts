import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPayResumeToken } from "@/lib/app-signing";
import { getCurrentPlayer } from "@/lib/player-auth";
import {
  cancelBlockResponse,
  resolveCancelEligibility,
  type CardPaymentLookup,
} from "@/lib/registration-cancel";

/**
 * POST /api/registrations/[id]/cancel
 *
 * The way off a roster. Until this route existed there wasn't one: every
 * `DELETE` in the app is admin-only, so a player who couldn't make it had to
 * message the owner and hope.
 *
 * It never deletes. Cancelling stamps `cancelled_at` and leaves the row — the
 * owner keeps the record of who dropped and when, and the waiver linkage on that
 * row survives with it. `payment_status`, `payment_method` and every waiver
 * column are untouched, because "I'm not coming" is not a statement about money
 * or about a signature.
 *
 * The rule for who may do this lives in `lib/registration-cancel.ts`, tested
 * without a database. This route's only job is to answer its one question
 * honestly: did card money move?
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing registration id." }, { status: 400 });
  }

  const { data: registration, error: loadErr } = await supabaseAdmin
    .from("registrations")
    .select("id, contact_id, tournament_id, cancelled_at")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) {
    console.error("[registrations/cancel] lookup failed:", loadErr.message);
    return NextResponse.json(
      { error: "We couldn't load that signup. Please try again." },
      { status: 500 }
    );
  }
  if (!registration) {
    return NextResponse.json({ error: "Signup not found." }, { status: 404 });
  }

  /*
    Two ways in, because sign-in is not required to register (REBUILD-PLAN §A8).
    Most people who sign up have no account and reach their spot through the
    signed link they were sent, so a session-only check would lock the majority
    of players out of the one control they asked for.

    The token is the same HMAC pay-resume token `/api/waiver/sign` and
    `/api/register/payment-intent` already use, scoped to this one registration.
    There is deliberately no second scheme.
  */
  const token = readToken(request, await safeJson(request));
  const tokenOk = verifyPayResumeToken(id, token);

  let sessionOk = false;
  if (!tokenOk) {
    const player = await getCurrentPlayer();
    sessionOk = Boolean(
      player && registration.contact_id && player.contact.id === registration.contact_id
    );
  }

  if (!tokenOk && !sessionOk) {
    return NextResponse.json(
      {
        error:
          "We couldn't confirm this is your signup. Sign in, or open the link we sent you.",
      },
      { status: 403 }
    );
  }

  const cardPayment = await findSucceededCardPayment({
    registrationId: id,
    contactId: registration.contact_id,
    tournamentId: registration.tournament_id,
  });

  const eligibility = resolveCancelEligibility({
    cancelledAt: registration.cancelled_at ?? null,
    cardPayment,
  });

  if (!eligibility.allowed) {
    const { status, message } = cancelBlockResponse(eligibility.reason);
    // `already_cancelled` answers 200: a second tap has reached the state the
    // player wanted, and a 4xx there would make a working cancel look broken.
    if (status === 200) {
      return NextResponse.json({ ok: true, alreadyCancelled: true, message });
    }
    return NextResponse.json({ error: message, reason: eligibility.reason }, { status });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("registrations")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    // Guards the gap between the read above and this write: if something else
    // cancelled it in between, this matches nothing rather than overwriting the
    // earlier timestamp with a later one.
    .is("cancelled_at", null);

  if (updateErr) {
    console.error("[registrations/cancel] update failed:", updateErr.message);
    return NextResponse.json(
      { error: "We couldn't cancel that just now. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, alreadyCancelled: false });
}

/* ------------------------------------------------------------------ */

/**
 * Did Stripe take money for this spot?
 *
 * Asked of `payments`, never of `registrations.payment_status`. That column
 * reads `'paid'` for two unrelated events — a Stripe webhook, and the owner
 * tapping the paid toggle on the Roster after somebody hands over a twenty —
 * and refusing on it would block exactly the cash players this feature is for.
 *
 * Checked two ways because `payments.registration_id` is set on only 38 of the
 * 44 live rows; the six without it are older and would slip through a single
 * lookup. Either hit is enough to refuse.
 *
 * Any error returns `'failed'`, which the rule treats as a refusal. Not knowing
 * whether money moved is not the same as knowing it didn't.
 */
async function findSucceededCardPayment({
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
    console.error("[registrations/cancel] payment lookup failed:", e);
    return "failed";
  }
}

/** The token may arrive in the query string or the body; accept either. */
function readToken(
  request: NextRequest,
  body: Record<string, unknown> | null
): string | null {
  const fromQuery = request.nextUrl.searchParams.get("token");
  if (fromQuery) return fromQuery;
  const fromBody = body?.payToken ?? body?.token;
  return typeof fromBody === "string" ? fromBody : null;
}

/** A cancel with no body is legitimate — the token can come from the URL. */
async function safeJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
