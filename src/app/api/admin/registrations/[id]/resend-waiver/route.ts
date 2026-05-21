import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DocuSealSubmitter = {
  id?: number;
  status?: string;
};

type DocuSealSubmissionResponse = {
  submitters?: DocuSealSubmitter[];
};

/**
 * POST /api/admin/registrations/[id]/resend-waiver
 *
 * Re-sends the DocuSeal invitation email for the registration's existing
 * submission. We do not create a new submission here. Used by the admin
 * Registrations list's "Resend waiver" row action.
 *
 * Strategy: fetch the submission, then PUT each not-yet-completed submitter
 * with `send_email: true` per the DocuSeal "Update a submitter" endpoint.
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "DOCUSEAL_API_KEY is not configured." },
      { status: 503 }
    );
  }

  const { data: registration, error: regErr } = await supabaseAdmin
    .from("registrations")
    .select("id, docuseal_submission_id, docuseal_status")
    .eq("id", id)
    .maybeSingle();

  if (regErr) {
    return NextResponse.json({ error: regErr.message }, { status: 500 });
  }
  if (!registration) {
    return NextResponse.json(
      { error: "Registration not found." },
      { status: 404 }
    );
  }
  if (registration.docuseal_status === "signed") {
    return NextResponse.json(
      { error: "Waiver is already signed; nothing to resend." },
      { status: 400 }
    );
  }
  if (!registration.docuseal_submission_id) {
    return NextResponse.json(
      { error: "This registration has no DocuSeal submission to resend." },
      { status: 400 }
    );
  }

  try {
    const subRes = await fetch(
      `https://api.docuseal.com/submissions/${registration.docuseal_submission_id}`,
      { headers: { "X-Auth-Token": apiKey } }
    );
    if (!subRes.ok) {
      return NextResponse.json(
        { error: `DocuSeal lookup failed (${subRes.status}).` },
        { status: 502 }
      );
    }
    const subBody = (await subRes.json()) as DocuSealSubmissionResponse;
    const submitters: DocuSealSubmitter[] = Array.isArray(subBody.submitters)
      ? subBody.submitters
      : [];
    const pending = submitters.filter(
      (s): s is { id: number; status?: string } =>
        typeof s.id === "number" && s.status !== "completed"
    );
    if (pending.length === 0) {
      return NextResponse.json(
        { error: "No pending submitters on this submission." },
        { status: 400 }
      );
    }

    let resent = 0;
    for (const submitter of pending) {
      const res = await fetch(
        `https://api.docuseal.com/submitters/${submitter.id}`,
        {
          method: "PUT",
          headers: {
            "X-Auth-Token": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ send_email: true }),
        }
      );
      if (res.ok) resent += 1;
    }

    if (resent === 0) {
      return NextResponse.json(
        { error: "DocuSeal refused to resend the notification." },
        { status: 502 }
      );
    }
    return NextResponse.json({ resent });
  } catch (err) {
    console.error("Resend waiver error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
