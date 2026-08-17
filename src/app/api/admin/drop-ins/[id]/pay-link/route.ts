import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { getStripe } from "@/lib/stripe";
import { acceptsPayments, type StatefulTournament } from "@/lib/tournament-state";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Create a Stripe Checkout session for a specific drop-in row and return its
 * URL. The admin can text/email this link to the person paying. The webhook
 * + verify-session pipeline already understands `drop_in_id` metadata and
 * will flip the drop_in row to 'paid' after successful checkout.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("drop_ins")
      .select(
        `id, amount_cents, payment_status, tournament_id, contact_id, paid_by_contact_id,
         tournament:tournaments ( id, title, slug, status, registration_open, payments_open, is_draft, start_date, end_date ),
         contact:contacts ( id, email, first_name, last_name ),
         paid_by:contacts!drop_ins_paid_by_contact_id_fkey ( id, email )`
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Drop-in not found." }, { status: 404 });
    }

    if (data.payment_status === "paid") {
      return NextResponse.json(
        { error: "Already paid." },
        { status: 400 }
      );
    }

    const tournament = Array.isArray(data.tournament)
      ? data.tournament[0]
      : data.tournament;
    // acceptsPayments, not raw payments_open: the audit found this was the
    // ONE remaining checkout path missing the Phase-1a calendar backstop, so
    // a past event with the flag left on could still sell entry here.
    if (tournament && !acceptsPayments(tournament as StatefulTournament)) {
      return NextResponse.json(
        { error: "This event is not currently accepting payments." },
        { status: 400 }
      );
    }

    const contact = Array.isArray(data.contact) ? data.contact[0] : data.contact;
    const paidBy = Array.isArray(data.paid_by) ? data.paid_by[0] : data.paid_by;

    const customerEmail =
      paidBy?.email ?? contact?.email ?? null;

    if (!customerEmail) {
      return NextResponse.json(
        { error: "Drop-in contact has no email on file." },
        { status: 400 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `https://${req.headers.get("host")}`;

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customerEmail.toLowerCase(),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: data.amount_cents,
            product_data: {
              name: tournament?.title
                ? `${tournament.title} — Drop-in`
                : "Drop-in",
              description: contact
                ? `Drop-in for ${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim()
                : "Houston Premier Soccer — Drop-in",
            },
          },
        },
      ],
      metadata: {
        email: customerEmail.toLowerCase(),
        tournament_id: data.tournament_id ?? "",
        tournament_name: tournament?.title ?? "",
        drop_in_id: data.id,
        contact_id: data.contact_id,
        pay_kind: "drop_in",
      },
      success_url: `${baseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pay?cancelled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Drop-in pay link error:", err);
    return NextResponse.json(
      { error: "Failed to create pay link." },
      { status: 500 }
    );
  }
}
