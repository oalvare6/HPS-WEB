import { handleDocusealWebhook } from "@/lib/docuseal-webhook";
import { docusealWebhookDeps } from "@/lib/docuseal-webhook-store-supabase";

export const dynamic = "force-dynamic";

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

  return Response.json(
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

/**
 * POST /api/docuseal/webhook
 *
 * The contract lives in src/lib/docuseal-webhook.ts (raw body → signature →
 * shape → association → idempotent claim → the one waiver writer → 2xx only
 * after the write). This file only wires production dependencies, and it
 * takes a plain `Request` so the same parsing path runs under test.
 */
export async function POST(request: Request) {
  return handleDocusealWebhook(request, docusealWebhookDeps());
}
