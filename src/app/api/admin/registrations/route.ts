import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { waiverStatusFor } from "@/lib/admin-roster";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ContactEmbed = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tags: string[] | null;
  waiver_type: string | null;
  waiver_signed_at: string | null;
  waiver_expires_at: string | null;
  waiver_document_url: string | null;
  waiver_source: string | null;
} | null;

/** PostgREST types an embedded one-to-one join as an array; collapse it. */
function firstOf(value: unknown): ContactEmbed {
  if (Array.isArray(value)) return (value[0] ?? null) as ContactEmbed;
  return (value ?? null) as ContactEmbed;
}

/**
 * GET /api/admin/registrations
 *
 * Cancelled rows are EXCLUDED by default so every admin surface counts the
 * same people the Roster counts — the audit found this route quietly
 * including players who had given up their spot, which made the dashboard's
 * headline number disagree with the roster below it. Pass
 * `include_cancelled=1` for history views that genuinely want everyone.
 *
 * Each row carries `waiver_ok` / `waiver_evidence`, computed by the one
 * shared waiver function (`waiverStatusFor`), so no client screen ever
 * derives waiver state from raw columns again.
 */
export async function GET(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const tournamentIdParam = req.nextUrl.searchParams.get("tournament_id");
  let tournamentFilter: string | null = null;
  if (tournamentIdParam !== null && tournamentIdParam !== "") {
    if (!UUID_RE.test(tournamentIdParam)) {
      return NextResponse.json(
        { error: "Invalid tournament_id." },
        { status: 400 }
      );
    }
    tournamentFilter = tournamentIdParam;
  }
  const includeCancelled =
    req.nextUrl.searchParams.get("include_cancelled") === "1";

  try {
    let query = supabaseAdmin
      .from("registrations")
      .select(
        `id, created_at, tournament_id, contact_id, team_id, team_name, registration_type, first_name, last_name, email, phone, dob,
         emergency_name, emergency_phone, waiver_type, waiver_signed, waiver_signed_at,
         waiver_document_url, payment_status, payment_method, cancelled_at, needs_admin_review,
         docuseal_status, docuseal_submission_id, docuseal_sign_url,
         tournament:tournaments!registrations_tournament_id_fkey ( id, title, slug ),
         contact:contacts ( id, first_name, last_name, email, tags, waiver_type, waiver_signed_at, waiver_expires_at, waiver_document_url, waiver_source ),
         payments ( id, amount, currency, status, tournament_id, tournament_name, created_at )`
      )
      .order("created_at", { ascending: false });

    if (tournamentFilter) {
      query = query.eq("tournament_id", tournamentFilter);
    }
    if (!includeCancelled) {
      query = query.is("cancelled_at", null);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Admin registrations fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load registrations." },
        { status: 500 }
      );
    }

    const registrations = (data ?? []).map((r) => {
      const contact = firstOf(r.contact);
      const waiver = waiverStatusFor({
        contactSignedAt: contact?.waiver_signed_at,
        contactExpiresAt: contact?.waiver_expires_at,
        contactDocumentUrl: contact?.waiver_document_url,
        contactSource: contact?.waiver_source,
        regSignedAt: r.waiver_signed_at,
        regDocumentUrl: r.waiver_document_url,
      });
      return {
        ...r,
        waiver_ok: waiver.ok,
        waiver_evidence: waiver.evidence,
        waiver_expires_at: waiver.expiresAt,
      };
    });

    return NextResponse.json({ registrations });
  } catch (err) {
    console.error("Admin registrations error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
