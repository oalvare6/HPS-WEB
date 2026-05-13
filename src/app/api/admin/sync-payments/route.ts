import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { verifyAdmin } from "@/lib/admin-auth";
import { recordCheckoutSessionPayment } from "@/lib/stripe-payments";

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

      const outcome = await recordCheckoutSessionPayment(session);

      if (outcome.status === "already_recorded") {
        skipped++;
        continue;
      }

      if (outcome.status === "recorded") {
        synced++;
        continue;
      }

      if (outcome.status === "skipped") {
        errors.push(`Skipped session ${session.id}: ${outcome.reason}`);
        continue;
      }

      if (outcome.status === "error") {
        errors.push(`Insert failed for session ${session.id}: ${outcome.error}`);
        continue;
      }
    }

    return NextResponse.json({
      synced,
      skipped,
      errors,
      total: sessions.data.length,
    });
  } catch (err) {
    console.error("Sync payments error:", err);
    return NextResponse.json(
      { error: "Failed to sync payments." },
      { status: 500 }
    );
  }
}
