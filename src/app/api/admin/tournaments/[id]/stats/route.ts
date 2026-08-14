import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

type PaymentRow = {
  amount: number | string | null;
  currency: string | null;
};

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid tournament id." },
      { status: 400 }
    );
  }

  const [allRes, paidRes, paymentsRes] = await Promise.all([
    // Both counts exclude players who have cancelled — a headcount the owner
    // reads before an event has to mean "people who are coming".
    supabaseAdmin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", id)
      .is("cancelled_at", null),
    supabaseAdmin
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", id)
      .eq("payment_status", "paid")
      .is("cancelled_at", null),
    supabaseAdmin
      .from("payments")
      .select("amount, currency")
      .eq("tournament_id", id)
      .eq("status", "succeeded"),
  ]);

  if (allRes.error) {
    return NextResponse.json({ error: allRes.error.message }, { status: 500 });
  }
  if (paidRes.error) {
    return NextResponse.json({ error: paidRes.error.message }, { status: 500 });
  }
  if (paymentsRes.error) {
    return NextResponse.json(
      { error: paymentsRes.error.message },
      { status: 500 }
    );
  }

  const paymentRows: PaymentRow[] = (paymentsRes.data ?? []) as PaymentRow[];

  let totalCents = 0;
  for (const row of paymentRows) {
    const raw = row.amount;
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? Number(raw)
          : NaN;
    if (Number.isFinite(n)) {
      totalCents += Math.round(n * 100);
    }
  }

  const currency =
    paymentRows.find((r) => typeof r.currency === "string" && r.currency)
      ?.currency ?? "usd";

  return NextResponse.json({
    registrantCount: allRes.count ?? 0,
    paidRegistrantCount: paidRes.count ?? 0,
    paymentCount: paymentRows.length,
    paymentTotalCents: totalCents,
    currency,
  });
}
