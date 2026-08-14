import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyPayResumeToken } from "@/lib/app-signing";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Missing registration id." }, { status: 400 });
  }

  const token = request.nextUrl.searchParams.get("token");
  if (!verifyPayResumeToken(id, token)) {
    return NextResponse.json(
      { error: "Invalid or expired link. Open the pay link from your waiver confirmation, or enter your details below." },
      { status: 403 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select(
      "email, first_name, payment_status, tournament_id, tournament:tournaments!registrations_tournament_id_fkey ( id, slug, title, entry_fee_cents, drop_in_fee_cents )"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("registrations lookup failed:", error);
    return NextResponse.json(
      { error: "Failed to load registration." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  }

  const tournament = Array.isArray(data.tournament) ? data.tournament[0] : data.tournament;

  return NextResponse.json({
    email: data.email,
    firstName: data.first_name,
    paymentStatus: data.payment_status,
    tournamentId: data.tournament_id,
    tournamentTitle: tournament?.title ?? null,
    tournamentSlug: tournament?.slug ?? null,
    tournamentEntryFeeCents: tournament?.entry_fee_cents ?? null,
    tournamentDropInFeeCents: tournament?.drop_in_fee_cents ?? null,
  });
}
