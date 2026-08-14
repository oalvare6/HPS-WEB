import { NextResponse } from "next/server";
import { verifyPayResumeToken } from "@/lib/app-signing";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { reconcileIfUnsigned } from "@/lib/waiver-reconcile";
import {
  isPaymentMethodChoice,
  isSettledStatus,
  type PaymentMethodChoice,
} from "@/lib/payment-method";

/**
 * POST /api/register/payment-intent
 *
 * Record how a player intends to settle their entry fee — `'cash'` when they
 * are bringing it to the field, `'card'` when they change their mind and want
 * to check out after all.
 *
 * **This never moves money and never marks anyone paid.** `payment_status`
 * stays `'pending'`; only `payment_method` is written. The owner marks cash
 * collected from the Roster, which is the override that already exists.
 *
 * Authorization is the same HMAC pay-resume token `/api/register` mints for
 * this registration, exactly as `/api/waiver/sign` uses it: scoped to one
 * registration id and no easier to forge than the payment link the player was
 * already given. There is deliberately no second token scheme.
 */

type IntentPayload = {
  registrationId?: string;
  payToken?: string;
  method?: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IntentPayload;
    const registrationId = str(body.registrationId);
    const payToken = str(body.payToken);
    const method = str(body.method);

    if (!registrationId || !verifyPayResumeToken(registrationId, payToken)) {
      return NextResponse.json(
        {
          error:
            "This link is no longer valid. Please start again from the event page.",
        },
        { status: 403 }
      );
    }

    if (!isPaymentMethodChoice(method)) {
      return NextResponse.json(
        { error: "Choose card or cash." },
        { status: 400 }
      );
    }

    const { data: registration, error: loadErr } = await supabaseAdmin
      .from("registrations")
      .select("id, payment_status, payment_method, waiver_signed, cancelled_at")
      .eq("id", registrationId)
      .maybeSingle();

    if (loadErr) {
      console.error("[register/payment-intent] lookup failed:", loadErr.message);
      return NextResponse.json(
        { error: "We couldn't load your registration. Please try again." },
        { status: 500 }
      );
    }
    if (!registration) {
      return NextResponse.json(
        { error: "Registration not found." },
        { status: 404 }
      );
    }

    // Cancelled. Recording "I'll pay cash" against a spot they gave up would put
    // them back on the owner's collection list for a night they aren't coming to.
    if (registration.cancelled_at) {
      return NextResponse.json(
        {
          error:
            "You cancelled this spot. Sign up again if you'd like to come, and you can pick how to pay then.",
        },
        { status: 409 }
      );
    }

    // Already settled. Overwriting the method now would put "paying cash" next
    // to somebody who has paid, which is how a player gets asked for money a
    // second time at the field. Answer as a no-op rather than an error — this
    // is a double-tap or a stale tab, not a mistake worth surfacing.
    if (isSettledStatus(registration.payment_status)) {
      return NextResponse.json({
        ok: true,
        alreadySettled: true,
        method: registration.payment_method,
        paymentStatus: registration.payment_status,
      });
    }

    /*
      The waiver is a hard gate on roster membership (D12) and this must not
      become the way around it: "I'll pay cash" would otherwise be a one-click
      route to a confirmed-looking spot with no signature on file — the exact
      state that produced two paid-but-unsigned Community Cup players.

      Ask DocuSeal before refusing, for the same reason /register and /pay do:
      `waiver_signed` is only as current as the last webhook we received, and
      that webhook delivered nothing at all for a month. `reconcileIfUnsigned`
      costs nothing when the column already says signed.
    */
    let waiverSigned = registration.waiver_signed === true;
    if (!waiverSigned) {
      const reconciled = await reconcileIfUnsigned({
        id: registration.id,
        waiver_signed: false,
      });
      waiverSigned = reconciled?.signed === true;
    }

    if (!waiverSigned) {
      return NextResponse.json(
        {
          error:
            "Sign your waiver first — we can't hold a spot without it. It takes about a minute.",
          needsWaiver: true,
        },
        { status: 409 }
      );
    }

    const nextMethod: PaymentMethodChoice = method;

    const { error: updateErr } = await supabaseAdmin
      .from("registrations")
      // payment_status is deliberately absent. Declaring cash does not settle
      // anything — the Roster's "still owes" count must keep counting them.
      .update({ payment_method: nextMethod })
      .eq("id", registrationId);

    if (updateErr) {
      console.error(
        "[register/payment-intent] update failed:",
        updateErr.message
      );
      return NextResponse.json(
        { error: "We couldn't save that. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      method: nextMethod,
      paymentStatus: registration.payment_status,
    });
  } catch (error) {
    console.error("[register/payment-intent] unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected server error. Please try again." },
      { status: 500 }
    );
  }
}
