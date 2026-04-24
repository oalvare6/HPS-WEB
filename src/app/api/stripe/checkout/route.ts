import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, tournamentName, amountCents, registrationId } = body as {
      email: string;
      tournamentName: string;
      amountCents: number;
      registrationId?: string;
    };

    if (!email || !tournamentName || !amountCents) {
      return NextResponse.json(
        { error: "email, tournamentName, and amountCents are required." },
        { status: 400 }
      );
    }

    // Prefer the explicit registrationId from the client (set when the user
    // arrives at /pay via the post-waiver redirect). Fall back to a lookup
    // by email so manual /pay visits still link to the most recent row.
    let resolvedRegistrationId: string | null = null;
    if (registrationId) {
      const { data: byId } = await supabaseAdmin
        .from("registrations")
        .select("id")
        .eq("id", registrationId)
        .maybeSingle();
      resolvedRegistrationId = byId?.id ?? null;
    }

    if (!resolvedRegistrationId) {
      const { data: registration } = await supabaseAdmin
        .from("registrations")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedRegistrationId = registration?.id ?? null;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `https://${req.headers.get("host")}`;

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email.toLowerCase().trim(),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: tournamentName,
              description: "Houston Premier Soccer — Tournament Entry Fee",
            },
          },
        },
      ],
      metadata: {
        email: email.toLowerCase().trim(),
        tournament_name: tournamentName,
        registration_id: resolvedRegistrationId ?? "",
      },
      success_url: `${baseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pay?cancelled=true`,
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
