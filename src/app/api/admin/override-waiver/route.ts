import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { getWaiverExpiryIso } from "@/lib/contacts";

export async function POST(request: Request) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = (await request.json()) as { registrationId?: string };

    if (!body.registrationId) {
      return NextResponse.json(
        { error: "registrationId is required." },
        { status: 400 }
      );
    }

    const { data: registration, error: registrationErr } = await supabaseAdmin
      .from("registrations")
      .select("id, contact_id, waiver_type, waiver_document_url, docuseal_submission_id")
      .eq("id", body.registrationId)
      .maybeSingle();

    if (registrationErr || !registration) {
      return NextResponse.json(
        { error: "Registration not found." },
        { status: 404 }
      );
    }

    const signedAt = new Date().toISOString();
    const expiresAt = getWaiverExpiryIso(signedAt);

    const { error } = await supabaseAdmin
      .from("registrations")
      .update({
        waiver_signed: true,
        waiver_signed_at: signedAt,
        docuseal_status: "signed",
      })
      .eq("id", registration.id);

    if (error) {
      console.error("Override waiver update error:", error);
      return NextResponse.json(
        { error: "Failed to update registration." },
        { status: 500 }
      );
    }

    if (registration.contact_id) {
      const { error: contactErr } = await supabaseAdmin
        .from("contacts")
        .update({
          waiver_type: registration.waiver_type,
          waiver_signed_at: signedAt,
          waiver_expires_at: expiresAt,
          waiver_document_url: registration.waiver_document_url,
          waiver_submission_id: registration.docuseal_submission_id,
          waiver_source: "admin_override",
        })
        .eq("id", registration.contact_id);
      if (contactErr) {
        console.warn("Override waiver: contact canonical update failed:", contactErr.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Override waiver error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
