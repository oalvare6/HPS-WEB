import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { acceptsPayments } from "@/lib/tournament-state";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, title, slug, format, recurrence, time_start, time_end, location, entry_fee_cents, drop_in_fee_cents, payments_open, registration_open, is_draft, status, start_date, end_date"
      )
      .eq("payments_open", true)
      .neq("status", "cancelled")
      .order("display_order", { ascending: true })
      .order("start_date", { ascending: true });

    if (error) {
      console.error("Pay options fetch failed:", error.message);
      return NextResponse.json({ error: "Failed to load payment options." }, { status: 500 });
    }

    // The date backstop can't be expressed as a PostgREST filter (it's timezone
    // aware), so past events are dropped here rather than in the query.
    const tournaments = (data ?? []).filter((t) => acceptsPayments(t));

    return NextResponse.json({ tournaments });
  } catch (err) {
    console.error("Pay options API error:", err);
    return NextResponse.json(
      { error: "Unexpected server error while loading payment options." },
      { status: 500 }
    );
  }
}
