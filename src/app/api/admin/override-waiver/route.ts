import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { recordSignedWaiver } from "@/lib/waiver-capture";

/**
 * Mark a waiver signed on an admin's word alone — no document behind it.
 *
 * Routed through `recordSignedWaiver` like every other waiver writer (the
 * audit found this route was the one surviving side door, and the one that
 * produced 39 evidence-free waivers). Going through the shared writer also
 * fixes a real bug the old copy had: it overwrote the contact's
 * `waiver_document_url` with the registration's — usually NULL — so
 * overriding someone who HAD a real signed document silently destroyed the
 * link to it. `recordSignedWaiver` only writes the URL when it has one.
 */
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

    const recorded = await recordSignedWaiver({
      registrationId: registration.id,
      contactId: registration.contact_id,
      waiverType: registration.waiver_type,
      submissionId: registration.docuseal_submission_id,
      documentUrl: registration.waiver_document_url,
      source: "admin_override",
    });

    if (!recorded.ok) {
      console.error("Override waiver update error:", recorded.error);
      return NextResponse.json(
        { error: "Failed to update registration." },
        { status: 500 }
      );
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
