import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyDocusealWebhookSignature } from "@/lib/app-signing";
import { recordSignedWaiver } from "@/lib/waiver-capture";

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

/**
 * Configuration probe. Open it in a browser to see whether this endpoint can
 * actually accept a delivery.
 *
 * This exists because the failure it reports was invisible for a month:
 * `DOCUSEAL_WEBHOOK_SECRET` was never set in Vercel, so every DocuSeal callback
 * got a 503 before its payload was read, and the only trace was a log line on a
 * platform that keeps one hour of logs. Seven players signed waivers that never
 * reached the database. A misconfiguration that silent needs somewhere to say
 * so out loud.
 *
 * Safe to leave public: it returns booleans, never values, and the endpoint
 * fails closed — an unset secret rejects everything rather than accepting it.
 */
export async function GET() {
  const hasSecret = Boolean(process.env.DOCUSEAL_WEBHOOK_SECRET?.trim());
  const hasApiKey = Boolean(process.env.DOCUSEAL_API_KEY?.trim());

  return NextResponse.json(
    {
      endpoint: "docuseal-webhook",
      ready: hasSecret,
      webhookSecretConfigured: hasSecret,
      apiKeyConfigured: hasApiKey,
      note: hasSecret
        ? "Ready to accept DocuSeal deliveries."
        : "DOCUSEAL_WEBHOOK_SECRET is not set — any delivery that reaches this endpoint is rejected with 503. Set it in Vercel, then redeploy.",
      // Says nothing about whether deliveries arrive at all. On 2026-08-14 they
      // did not: DocuSeal was pointed at the apex domain, which Vercel 307s to
      // www at the edge, and DocuSeal does not follow redirects — it logged
      // each 307 as a success. A green light here is necessary, never
      // sufficient. Check the sender's own delivery log too.
      alsoCheck:
        "This endpoint only sees requests that arrive. Confirm the sender's webhook URL uses the www host — an apex URL is 307'd at the edge and never reaches this app.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.DOCUSEAL_WEBHOOK_SECRET?.trim() ?? "";

  if (!secret) {
    console.error("DocuSeal webhook: DOCUSEAL_WEBHOOK_SECRET is not configured.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const sigHeader =
    request.headers.get("x-docuseal-signature") ?? request.headers.get("X-Docuseal-Signature");

  if (!verifyDocusealWebhookSignature(rawBody, sigHeader, secret)) {
    console.error("DocuSeal webhook: invalid or missing signature.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as DocuSealWebhookPayload;

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
      .select("id, contact_id, waiver_type")
      .eq("docuseal_submission_id", submissionId)
      .single();

    if (findErr || !registration) {
      console.error(
        "DocuSeal webhook: registration not found for submission",
        submissionId,
        findErr
      );
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    const documentUrl =
      payload.data.submission?.combined_document_url ??
      payload.data.documents?.[0]?.url ??
      null;

    const result = await recordSignedWaiver({
      registrationId: registration.id,
      contactId: registration.contact_id,
      waiverType: registration.waiver_type,
      submissionId,
      completedAt: payload.data.completed_at,
      documentUrl,
    });

    if (!result.ok) {
      console.error("DocuSeal webhook: failed to update registration", result.error);
      return NextResponse.json({ error: "Failed to update registration" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DocuSeal webhook error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
