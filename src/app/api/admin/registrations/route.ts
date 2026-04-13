import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

export async function GET() {

  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .select(
        `id, created_at, registration_type, first_name, last_name, email, phone, dob,
         emergency_name, emergency_phone, waiver_type, waiver_signed, waiver_signed_at,
         waiver_submission_id, waiver_match_key, payment_status,
         docuseal_status, docuseal_submission_id, docuseal_sign_url,
         payments ( id, amount, currency, status, tournament_name, created_at )`
      )
      .order("created_at", { ascending: false });

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
