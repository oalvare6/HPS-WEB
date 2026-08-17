import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select(
        `id, created_at, email, amount, currency, tournament_id, tournament_name,
         contact_id, drop_in_id,
         stripe_session_id, stripe_payment_intent_id, status, notes,
         registrations ( first_name, last_name ),
         tournament:tournaments ( id, title, slug ),
         contact:contacts ( id, first_name, last_name, email, tags )`
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Admin payments fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load payments." },
        { status: 500 }
      );
    }

    return NextResponse.json({ payments: data ?? [] });
  } catch (err) {
    console.error("Admin payments error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

// (No PATCH: the bulk "link payments to a tournament" handler had no UI
// caller, and the 2026-08-17 data cleanup re-homed every unlinked payment —
// zero rows with tournament_id NULL remain.)
