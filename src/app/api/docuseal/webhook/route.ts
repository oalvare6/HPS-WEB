import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

interface DocuSealWebhookPayload {
  event_type: string;
  timestamp: string;
  data: {
    id: number;
    email: string;
    status: string;
    completed_at: string | null;
    submission: {
      id: number;
      status: string;
      combined_document_url: string | null;
      audit_log_url: string | null;
    };
    documents: Array<{
      name: string;
      url: string;
    }>;
    metadata?: {
      registration_id?: string;
    };
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DocuSealWebhookPayload;

    if (payload.event_type !== "form.completed") {
      return NextResponse.json({ ok: true });
    }

    const submissionId = payload.data.submission?.id;
    if (!submissionId) {
      console.error("DocuSeal webhook: missing submission ID");
      return NextResponse.json({ error: "Missing submission ID" }, { status: 400 });
    }

    const { data: registration, error: findErr } = await supabaseAdmin
      .from("registrations")
      .select("id")
      .eq("docuseal_submission_id", submissionId)
      .single();

    if (findErr || !registration) {
      console.error("DocuSeal webhook: registration not found for submission", submissionId, findErr);
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    const documentUrl =
      payload.data.submission?.combined_document_url ??
      payload.data.documents?.[0]?.url ??
      null;

    const { error: updateErr } = await supabaseAdmin
      .from("registrations")
      .update({
        waiver_signed: true,
        waiver_signed_at: payload.data.completed_at ?? new Date().toISOString(),
        docuseal_status: "signed",
        waiver_document_url: documentUrl,
      })
      .eq("id", registration.id);

    if (updateErr) {
      console.error("DocuSeal webhook: failed to update registration", updateErr);
      return NextResponse.json({ error: "Failed to update registration" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DocuSeal webhook error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
