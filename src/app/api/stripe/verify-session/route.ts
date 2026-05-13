import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { recordCheckoutSessionPayment } from "@/lib/stripe-payments";

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

    const outcome = await recordCheckoutSessionPayment(session);

    if (outcome.status === "error") {
      return NextResponse.json(
        { error: "Failed to record payment." },
        { status: 500 }
      );
    }

    if (outcome.status === "skipped") {
      return NextResponse.json(
        { error: "Session had no associated email." },
        { status: 400 }
      );
    }

    return NextResponse.json({ status: outcome.status, paymentId: outcome.paymentId });
  } catch (err) {
    console.error("verify-session error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
