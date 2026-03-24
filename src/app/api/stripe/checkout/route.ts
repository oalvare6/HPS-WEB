import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, tournamentName, amountCents } = body as {
      email: string;
      tournamentName: string;
      amountCents: number;
    };

    if (!email || !tournamentName || !amountCents) {
      return NextResponse.json(
        { error: "email, tournamentName, and amountCents are required." },
        { status: 400 }
      );
    }

    // Look up existing registration so we can link payment later
    const { data: registration } = await supabaseAdmin
      .from("registrations")
      .select("id, first_name, last_name")
      .eq("email", email.toLowerCase().trim())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

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
        registration_id: registration?.id ?? "",
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
