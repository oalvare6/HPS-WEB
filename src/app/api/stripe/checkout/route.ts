import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { upsertContactByEmail, normalizeEmail } from "@/lib/contacts";
import { verifyPayResumeToken } from "@/lib/app-signing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CheckoutBody = {
  email?: string;
  /** Canonical path: pay for a specific tournament. */
  tournamentId?: string;
  /** Canonical path: pay for a specific admin-created drop-in. */
  dropInId?: string;
  /** Optional disambiguation when only tournamentId is given. */
  payKind?: "entry" | "drop_in";
  /** Optional: tie this payment to a registration (waiver flow). */
  registrationId?: string;
  /** Resume token from /api/register. */
  payToken?: string;
};

type ResolvedCheckout = {
  amountCents: number;
  productName: string;
  productDescription: string;
  stripePriceId: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  dropInId: string | null;
  payKind: "entry" | "drop_in";
};

async function resolveTournamentCheckout(
  tournamentId: string,
  payKind: "entry" | "drop_in" | undefined
): Promise<ResolvedCheckout | { error: string; status: number }> {
  if (!UUID_RE.test(tournamentId)) {
    return { error: "Invalid tournament id.", status: 400 };
  }

  const { data: t, error } = await supabaseAdmin
    .from("tournaments")
    .select("id, title, entry_fee_cents, drop_in_fee_cents, stripe_price_id, payments_open, status")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !t) {
    return { error: "Tournament not found.", status: 404 };
  }

  if (!t.payments_open) {
    return { error: "This tournament is not currently accepting payments.", status: 400 };
  }

  const kind = payKind ?? "entry";
  const cents = kind === "drop_in" ? t.drop_in_fee_cents : t.entry_fee_cents;

  if (!cents || cents <= 0) {
    return {
      error:
        kind === "drop_in"
          ? "No drop-in fee is configured for this tournament."
          : "No entry fee is configured for this tournament.",
      status: 400,
    };
  }

  return {
    amountCents: cents,
    productName: kind === "drop_in" ? `${t.title} — Drop-in` : t.title,
    productDescription:
      kind === "drop_in"
        ? "Houston Premier Soccer — Single-night drop-in"
        : "Houston Premier Soccer — Tournament Entry Fee",
    stripePriceId: kind === "entry" ? (t.stripe_price_id ?? null) : null,
    tournamentId: t.id,
    tournamentName: t.title,
    dropInId: null,
    payKind: kind,
  };
}

async function resolveDropInCheckout(
  dropInId: string
): Promise<ResolvedCheckout | { error: string; status: number }> {
  if (!UUID_RE.test(dropInId)) {
    return { error: "Invalid drop-in id.", status: 400 };
  }

  const { data, error } = await supabaseAdmin
    .from("drop_ins")
    .select(
      "id, amount_cents, payment_status, tournament_id, tournaments ( id, title, payments_open )"
    )
    .eq("id", dropInId)
    .maybeSingle();

  if (error || !data) {
    return { error: "Drop-in not found.", status: 404 };
  }

  if (data.payment_status === "paid") {
    return { error: "This drop-in has already been paid.", status: 400 };
  }

  if (!data.amount_cents || data.amount_cents <= 0) {
    return { error: "Drop-in has no amount configured.", status: 400 };
  }

  const t = Array.isArray(data.tournaments) ? data.tournaments[0] : data.tournaments;

  if (t && !t.payments_open) {
    return { error: "This tournament is not currently accepting payments.", status: 400 };
  }

  return {
    amountCents: data.amount_cents,
    productName: t?.title ? `${t.title} — Drop-in` : "Drop-in",
    productDescription: "Houston Premier Soccer — Single-night drop-in",
    stripePriceId: null,
    tournamentId: data.tournament_id ?? null,
    tournamentName: t?.title ?? null,
    dropInId: data.id,
    payKind: "drop_in",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutBody;
    const email = normalizeEmail(body.email ?? "");

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    let resolved: ResolvedCheckout;
    let resolvedRegistrationId: string | null = null;
    let checkoutEmail = email;

    if (body.registrationId) {
      if (!UUID_RE.test(body.registrationId)) {
        return NextResponse.json({ error: "Invalid registration id." }, { status: 400 });
      }
      if (!verifyPayResumeToken(body.registrationId, body.payToken)) {
        return NextResponse.json(
          { error: "Invalid or expired payment link. Start from your registration link." },
          { status: 403 }
        );
      }

      const { data: registration, error: registrationErr } = await supabaseAdmin
        .from("registrations")
        .select("id, email, payment_status, tournament_id")
        .eq("id", body.registrationId)
        .maybeSingle();

      if (registrationErr || !registration) {
        return NextResponse.json({ error: "Registration not found." }, { status: 404 });
      }
      if (registration.payment_status === "paid") {
        return NextResponse.json({ error: "This registration is already paid." }, { status: 400 });
      }

      const registrationEmail = normalizeEmail(registration.email ?? "");
      if (!registrationEmail) {
        return NextResponse.json(
          { error: "Registration email is missing. Please contact support." },
          { status: 400 }
        );
      }
      if (registrationEmail !== email) {
        return NextResponse.json(
          { error: "Email does not match this registration." },
          { status: 403 }
        );
      }
      if (!registration.tournament_id) {
        return NextResponse.json(
          { error: "Registration is not linked to a tournament yet. Please contact support." },
          { status: 400 }
        );
      }

      const r = await resolveTournamentCheckout(registration.tournament_id, body.payKind);
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      resolved = r;
      resolvedRegistrationId = registration.id;
      checkoutEmail = registrationEmail;
    } else if (body.dropInId) {
      const r = await resolveDropInCheckout(body.dropInId);
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      resolved = r;
    } else if (body.tournamentId) {
      const r = await resolveTournamentCheckout(body.tournamentId, body.payKind);
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      resolved = r;
    } else {
      return NextResponse.json(
        { error: "Provide tournamentId, dropInId, or a valid registrationId + payToken." },
        { status: 400 }
      );
    }

    if (!resolvedRegistrationId) {
      let query = supabaseAdmin
        .from("registrations")
        .select("id")
        .eq("email", checkoutEmail)
        .order("created_at", { ascending: false })
        .limit(1);
      if (resolved.tournamentId) {
        query = query.eq("tournament_id", resolved.tournamentId);
      }
      const { data: registration } = await query.maybeSingle();
      resolvedRegistrationId = registration?.id ?? null;
    }

    const { contact } = await upsertContactByEmail({
      first_name: "",
      last_name: "",
      email: checkoutEmail,
      tags: ["paying"],
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `https://${req.headers.get("host")}`;

    const cancelParams = new URLSearchParams({ cancelled: "true" });
    if (resolvedRegistrationId) cancelParams.set("registrationId", resolvedRegistrationId);
    if (body.payToken) cancelParams.set("payToken", body.payToken);

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: checkoutEmail,
      line_items: resolved.stripePriceId
        ? [{ quantity: 1, price: resolved.stripePriceId }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: resolved.amountCents,
                product_data: {
                  name: resolved.productName,
                  description: resolved.productDescription,
                },
              },
            },
          ],
      metadata: {
        email: checkoutEmail,
        tournament_id: resolved.tournamentId ?? "",
        tournament_name: resolved.tournamentName ?? resolved.productName,
        registration_id: resolvedRegistrationId ?? "",
        drop_in_id: resolved.dropInId ?? "",
        contact_id: contact?.id ?? "",
        pay_kind: resolved.payKind,
      },
      success_url: `${baseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pay?${cancelParams.toString()}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
