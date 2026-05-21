import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { upsertContactByEmail, normalizeEmail, normalizePhone } from "@/lib/contacts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  try {
    let query = supabaseAdmin
      .from("registrations")
      .select(
        `id, created_at, tournament_id, contact_id, team_id, registration_type, first_name, last_name, email, phone, dob,
         emergency_name, emergency_phone, waiver_type, waiver_signed, waiver_signed_at,
         waiver_submission_id, waiver_match_key, waiver_document_url, payment_status,
         docuseal_status, docuseal_submission_id, docuseal_sign_url,
         tournament:tournaments ( id, title, slug ),
         contact:contacts ( id, first_name, last_name, email, tags, waiver_type, waiver_signed_at, waiver_expires_at ),
         payments ( id, amount, currency, status, tournament_id, tournament_name, created_at )`
      )
      .order("created_at", { ascending: false });

    if (tournamentFilter) {
      query = query.eq("tournament_id", tournamentFilter);
    }

    const { data, error } = await query;

    if (error) {
      // #region agent log
      console.error("Admin registrations fetch error:", error);
      // #endregion
      return NextResponse.json(
        { error: "Failed to load registrations.", _debug: { message: error.message, code: error.code, hint: error.hint, details: error.details } },
        { status: 500 }
      );
    }

    return NextResponse.json({ registrations: data ?? [] });
  } catch (err) {
    console.error("Admin registrations error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

/**
 * Admin-driven manual registration. Skips the public form / DocuSeal flow
 * and inserts a registration row directly with payment_status defaulted to
 * 'pending'. The matching contact is upserted by email.
 */
export async function POST(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const tournamentId =
      typeof body.tournament_id === "string" && UUID_RE.test(body.tournament_id)
        ? body.tournament_id
        : null;
    const type = typeof body.registration_type === "string" ? body.registration_type : "";
    const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
    const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";
    const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
    const phone =
      typeof body.phone === "string" ? body.phone.trim() : "";
    const dob = typeof body.dob === "string" ? body.dob : "";
    const emergencyName =
      typeof body.emergency_name === "string" ? body.emergency_name.trim() : "";
    const emergencyPhone =
      typeof body.emergency_phone === "string" ? body.emergency_phone.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes : null;
    const paymentStatus =
      typeof body.payment_status === "string" ? body.payment_status : "pending";

    if (!tournamentId) {
      return NextResponse.json(
        { error: "tournament_id is required." },
        { status: 400 }
      );
    }
    if (type !== "adult" && type !== "youth") {
      return NextResponse.json(
        { error: "registration_type must be 'adult' or 'youth'." },
        { status: 400 }
      );
    }
    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "first_name, last_name, and email are required." },
        { status: 400 }
      );
    }

    const { contact } = await upsertContactByEmail({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: normalizePhone(phone),
      dob: dob || null,
      tags: ["admin-added", "registered"],
    });

    if (!contact) {
      return NextResponse.json(
        { error: "Failed to upsert contact." },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("registrations")
      .insert({
        tournament_id: tournamentId,
        contact_id: contact.id,
        registration_type: type,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        dob,
        emergency_name: emergencyName,
        emergency_phone: emergencyPhone,
        waiver_type: type,
        waiver_signed: false,
        payment_status: paymentStatus,
        notes,
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Insert failed." },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error("Admin registration POST error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

/**
 * Bulk link unmatched registrations to a tournament. Useful right after the
 * Phase 0 backfill leaves rows with tournament_id = null.
 *
 * Body: { tournament_id: string, registration_ids: string[] }
 */
export async function PATCH(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as {
      tournament_id?: string;
      registration_ids?: string[];
    };
    const tournamentId = body.tournament_id ?? "";
    const ids = Array.isArray(body.registration_ids) ? body.registration_ids : [];

    if (!UUID_RE.test(tournamentId)) {
      return NextResponse.json(
        { error: "tournament_id is required." },
        { status: 400 }
      );
    }
    const valid = ids.filter((id) => UUID_RE.test(id));
    if (valid.length === 0) {
      return NextResponse.json(
        { error: "registration_ids must be a non-empty array of UUIDs." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("registrations")
      .update({ tournament_id: tournamentId })
      .in("id", valid)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ updated: data?.length ?? 0 });
  } catch (err) {
    console.error("Admin registrations PATCH error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
