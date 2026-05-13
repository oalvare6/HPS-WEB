import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * Bulk link unmatched payments to a tournament. Useful right after the
 * Phase 0 backfill leaves rows with tournament_id = null.
 *
 * Body: { tournament_id: string, payment_ids: string[] }
 */
export async function PATCH(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as {
      tournament_id?: string;
      payment_ids?: string[];
    };
    const tournamentId = body.tournament_id ?? "";
    const ids = Array.isArray(body.payment_ids) ? body.payment_ids : [];

    if (!UUID_RE.test(tournamentId)) {
      return NextResponse.json(
        { error: "tournament_id is required." },
        { status: 400 }
      );
    }
    const valid = ids.filter((id) => UUID_RE.test(id));
    if (valid.length === 0) {
      return NextResponse.json(
        { error: "payment_ids must be a non-empty array of UUIDs." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("payments")
      .update({ tournament_id: tournamentId })
      .in("id", valid)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ updated: data?.length ?? 0 });
  } catch (err) {
    console.error("Admin payments PATCH error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
