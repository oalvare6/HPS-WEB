import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, title, slug, format, recurrence, time_start, time_end, location, entry_fee_cents, drop_in_fee_cents, payments_open, status"
      )
      .eq("payments_open", true)
      .neq("status", "cancelled")
      .order("display_order", { ascending: true })
      .order("start_date", { ascending: true });

    if (error) {
      console.error("Pay options fetch failed:", error.message);
      return NextResponse.json({ error: "Failed to load payment options." }, { status: 500 });
    }

    return NextResponse.json({ tournaments: data ?? [] });
  } catch (err) {
    console.error("Pay options API error:", err);
    return NextResponse.json(
      { error: "Unexpected server error while loading payment options." },
      { status: 500 }
    );
  }
}
