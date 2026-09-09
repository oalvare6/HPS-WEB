/**
 * The DocuSeal completion trust boundary (Stage 1.3, SEC-02).
 *
 * ## The invariant
 *
 * Only a DocuSeal delivery whose signature verifies may establish signed
 * waiver state through this path, and it may do so for exactly one
 * registration: the one the submission was created for. A registration or
 * resume session may START signing; it never declares signing complete.
 *
 * ## What DocuSeal actually sends (verified against docusealco/docuseal,
 * `lib/send_webhook_request.rb` and `lib/webhook_urls/signatures.rb`)
 *
 *   POST <webhook url>
 *   Content-Type: application/json
 *   User-Agent: DocuSeal.com Webhook
 *   X-Docuseal-Signature: <unix seconds>.<hex HMAC-SHA256(secret, "<unix seconds>.<raw body>")>
 *   (+ any custom "secret" headers the operator configured)
 *
 *   body: {"event_type": "form.completed", "timestamp": ..., "data": {<submitter>}}
 *
 * The secret is the per-webhook `hmac_secret` DocuSeal generates
 * (`whsec_` + 24 random bytes, base64). DocuSeal's own verifier tolerates
 * ±300 s and compares in constant time; so does ours. DocuSeal retries any
 * response ≥ 400 with `2^attempt` minutes of backoff, at most 12 times.
 *
 * ## Order of operations, and why it is this order
 *
 *   1. read the RAW body first — the signature covers those exact bytes
 *   2. secret configured? (503 — nothing is verified without it)
 *   3. signature present, well-formed, fresh, and matching? (401)
 *   4. parse; non-completion events are acknowledged and ignored (200)
 *   5. association: the registration named by the server-set
 *      `metadata.registration_id` must exist and must be linked to THIS
 *      submission id (404 / 409, nothing written)
 *   6. idempotency: claim `form.completed:<submitter id>` (a submitter
 *      completes a form once; retries carry the same id). Already processed →
 *      200 duplicate, nothing written. In flight → 503, retry later.
 *   7. write, through `recordSignedWaiver` — the one writer of waiver state
 *   8. mark the claim processed; answer 200 only after the write committed
 *
 * A local failure after the claim answers 500 so DocuSeal retries; the claim
 * is treated as abandoned after `DOCUSEAL_CLAIM_STALE_SECONDS` and the retry
 * takes it over. Permanently invalid business data (unknown registration,
 * mismatched submission) answers 4xx: DocuSeal's retries are bounded, and a
 * refused delivery showing in ITS log is the alarm this project learned it
 * needs (CLAUDE.md, "the webhook trap").
 *
 * Nothing here talks to the database directly; the store is injected so the
 * whole table runs in scripts/test-docuseal-webhook.ts with real signatures
 * and the real `Request` parsing path.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { documentUrlFrom, type RecordSignedWaiverInput, type RecordSignedWaiverResult } from "@/lib/waiver-capture";

export const DOCUSEAL_SIGNATURE_HEADER = "x-docuseal-signature";
export const DOCUSEAL_SIGNATURE_TOLERANCE_SECONDS = 300;
export const DOCUSEAL_COMPLETION_EVENT = "form.completed";
/** A claim this old with no `processed_at` belongs to a delivery that died mid-flight. */
export const DOCUSEAL_CLAIM_STALE_SECONDS = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ */
/* Signature                                                            */
/* ------------------------------------------------------------------ */

/** Exactly what DocuSeal computes (`WebhookUrls::Signatures.sign`). Tests use it to sign fixtures. */
export function signDocusealBody(secret: string, rawBody: string, timestampSeconds: number): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return `${timestampSeconds}.${digest}`;
}

export type DocusealSignatureVerdict =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

export function verifyDocusealSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = DOCUSEAL_SIGNATURE_TOLERANCE_SECONDS
): DocusealSignatureVerdict {
  if (!header) return { ok: false, reason: "missing" };
  const dot = header.indexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const timestamp = header.slice(0, dot);
  const signature = header.slice(dot + 1);
  if (!/^\d{1,12}$/.test(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) {
    return { ok: false, reason: "malformed" };
  }
  const ts = Number(timestamp);
  if (ts < nowSeconds - toleranceSeconds || ts > nowSeconds + toleranceSeconds) {
    return { ok: false, reason: "stale" };
  }
  // Signed over the timestamp exactly as it appeared in the header.
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "mismatch" };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Payload                                                              */
/* ------------------------------------------------------------------ */

export type DocusealCompletionEvent = {
  eventType: typeof DOCUSEAL_COMPLETION_EVENT;
  /** `data.id` — the submitter. Immutable; the idempotency key. */
  submitterId: number;
  /** `data.submission_id` / `data.submission.id`. */
  submissionId: number;
  /** `data.metadata.registration_id`, set by us when the submission was created. */
  registrationId: string | null;
  submitterEmail: string | null;
  completedAt: string | null;
  documentUrl: string | null;
  /** `data.template.id`, for the adult/youth cross-check. */
  templateId: number | null;
};

export type ParsedDocusealPayload =
  | { kind: "completion"; event: DocusealCompletionEvent }
  | { kind: "ignored"; eventType: string }
  | { kind: "malformed"; reason: string };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asId(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === "string" && /^\d{1,15}$/.test(v)) return Number(v);
  return null;
}

export function parseDocusealPayload(rawBody: string): ParsedDocusealPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { kind: "malformed", reason: "invalid_json" };
  }
  const body = asRecord(parsed);
  if (!body) return { kind: "malformed", reason: "not_an_object" };

  const eventType = body.event_type;
  if (typeof eventType !== "string" || !eventType) {
    return { kind: "malformed", reason: "missing_event_type" };
  }
  if (eventType !== DOCUSEAL_COMPLETION_EVENT) {
    return { kind: "ignored", eventType };
  }

  const data = asRecord(body.data);
  if (!data) return { kind: "malformed", reason: "missing_data" };

  const submitterId = asId(data.id);
  if (submitterId === null) return { kind: "malformed", reason: "missing_submitter_id" };

  const submission = asRecord(data.submission);
  const submissionId = asId(data.submission_id) ?? asId(submission?.id);
  if (submissionId === null) return { kind: "malformed", reason: "missing_submission_id" };

  const metadata = asRecord(data.metadata);
  const rawRegistrationId = metadata?.registration_id;
  const registrationId =
    typeof rawRegistrationId === "string" && UUID_RE.test(rawRegistrationId)
      ? rawRegistrationId.toLowerCase()
      : null;

  const documents = Array.isArray(data.documents)
    ? (data.documents as { name?: string; url?: string }[])
    : undefined;
  const documentUrl = documentUrlFrom({
    combined_document_url:
      typeof submission?.combined_document_url === "string" ? submission.combined_document_url : null,
    documents,
  });

  const template = asRecord(data.template);

  return {
    kind: "completion",
    event: {
      eventType: DOCUSEAL_COMPLETION_EVENT,
      submitterId,
      submissionId,
      registrationId,
      submitterEmail: typeof data.email === "string" ? data.email : null,
      completedAt: typeof data.completed_at === "string" ? data.completed_at : null,
      documentUrl,
      templateId: asId(template?.id),
    },
  };
}

/** The idempotency key: one submitter completes a form exactly once. */
export function docusealEventKey(event: Pick<DocusealCompletionEvent, "eventType" | "submitterId">): string {
  return `${event.eventType}:${event.submitterId}`;
}

/* ------------------------------------------------------------------ */
/* Store contract                                                       */
/* ------------------------------------------------------------------ */

export type WebhookRegistrationRow = {
  id: string;
  contactId: string | null;
  waiverType: string | null;
  docusealSubmissionId: number | null;
};

export type ClaimEventResult = {
  status: "claimed" | "reclaimed" | "duplicate" | "in_flight";
  previousOutcome?: string | null;
};

export interface DocusealWebhookStore {
  loadRegistration(id: string): Promise<WebhookRegistrationRow | null>;
  /** Legacy fallback when a payload carries no `metadata.registration_id`. */
  findRegistrationsBySubmission(submissionId: number): Promise<WebhookRegistrationRow[]>;
  /** MUST be atomic: exactly one delivery can hold an unprocessed claim on a key. */
  claimEvent(input: {
    eventKey: string;
    eventType: string;
    submitterId: number;
    submissionId: number;
    registrationId: string;
    staleAfterSeconds: number;
  }): Promise<ClaimEventResult>;
  recordSignedWaiver(input: RecordSignedWaiverInput): Promise<RecordSignedWaiverResult>;
  /** `processed: true` marks the claim done; `false` leaves it for a retry to take over. */
  finishEvent(input: {
    eventKey: string;
    processed: boolean;
    outcome: string;
    detail: string | null;
  }): Promise<void>;
}

export type DocusealWebhookDeps = {
  /** `DOCUSEAL_WEBHOOK_SECRET`. Null/empty → every delivery is refused. */
  secret: string | null;
  store: DocusealWebhookStore;
  /** Configured template ids per waiver type. A null entry skips the cross-check for that type. */
  templateIds?: { adult: number | null; youth: number | null };
  now?: () => Date;
};

/* ------------------------------------------------------------------ */
/* Handler                                                              */
/* ------------------------------------------------------------------ */

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleDocusealWebhook(
  request: Request,
  deps: DocusealWebhookDeps
): Promise<Response> {
  // 1. Raw bytes first. Anything that parses the body before this point would
  //    verify a reconstruction, not what DocuSeal signed.
  const rawBody = await request.text();
  const now = (deps.now ?? (() => new Date()))();

  // 2. Configuration.
  const secret = deps.secret?.trim() ?? "";
  if (!secret) {
    console.error("DocuSeal webhook: DOCUSEAL_WEBHOOK_SECRET is not configured.");
    return json({ error: "Webhook not configured." }, 503);
  }

  // 3. Authentication.
  const verdict = verifyDocusealSignature(
    rawBody,
    request.headers.get(DOCUSEAL_SIGNATURE_HEADER),
    secret,
    Math.floor(now.getTime() / 1000)
  );
  if (!verdict.ok) {
    console.error("DocuSeal webhook: signature refused:", verdict.reason);
    return json({ error: "Invalid signature." }, 401);
  }

  // 4. Shape.
  const parsed = parseDocusealPayload(rawBody);
  if (parsed.kind === "malformed") {
    console.error("DocuSeal webhook: malformed payload:", parsed.reason);
    return json({ error: "Malformed payload.", reason: parsed.reason }, 400);
  }
  if (parsed.kind === "ignored") {
    return json({ ok: true, ignored: parsed.eventType });
  }
  const { event } = parsed;

  // 5. Association. The registration must be the one the submission was
  //    created for, AND must still be linked to this submission.
  let registration: WebhookRegistrationRow | null = null;
  try {
    if (event.registrationId) {
      registration = await deps.store.loadRegistration(event.registrationId);
      if (!registration) {
        console.warn("DocuSeal webhook: unknown registration", {
          registrationId: event.registrationId,
          submissionId: event.submissionId,
        });
        return json({ error: "Unknown registration.", reason: "unknown_registration" }, 404);
      }
    } else {
      const matches = await deps.store.findRegistrationsBySubmission(event.submissionId);
      if (matches.length === 0) {
        console.warn("DocuSeal webhook: unknown submission", { submissionId: event.submissionId });
        return json({ error: "Unknown submission.", reason: "unknown_submission" }, 404);
      }
      if (matches.length > 1) {
        console.warn("DocuSeal webhook: submission linked to several registrations", {
          submissionId: event.submissionId,
          count: matches.length,
        });
        return json({ error: "Ambiguous submission.", reason: "ambiguous_submission" }, 409);
      }
      registration = matches[0];
    }
  } catch (err) {
    console.error("DocuSeal webhook: lookup failed:", err instanceof Error ? err.message : err);
    return json({ error: "Lookup failed; retry." }, 500);
  }

  if (registration.docusealSubmissionId !== event.submissionId) {
    console.warn("DocuSeal webhook: submission does not match the registration's", {
      registrationId: registration.id,
      linked: registration.docusealSubmissionId,
      delivered: event.submissionId,
    });
    return json({ error: "Submission mismatch.", reason: "submission_mismatch" }, 409);
  }

  const expectedTemplate =
    registration.waiverType === "youth" ? deps.templateIds?.youth : deps.templateIds?.adult;
  if (expectedTemplate && event.templateId && expectedTemplate !== event.templateId) {
    console.warn("DocuSeal webhook: template does not match the registration's waiver type", {
      registrationId: registration.id,
      waiverType: registration.waiverType,
      templateId: event.templateId,
    });
    return json({ error: "Template mismatch.", reason: "template_mismatch" }, 409);
  }

  // 6. Idempotency.
  const eventKey = docusealEventKey(event);
  let claim: ClaimEventResult;
  try {
    claim = await deps.store.claimEvent({
      eventKey,
      eventType: event.eventType,
      submitterId: event.submitterId,
      submissionId: event.submissionId,
      registrationId: registration.id,
      staleAfterSeconds: DOCUSEAL_CLAIM_STALE_SECONDS,
    });
  } catch (err) {
    console.error("DocuSeal webhook: claim failed:", err instanceof Error ? err.message : err);
    return json({ error: "Could not record event; retry." }, 500);
  }

  if (claim.status === "duplicate") {
    return json({ ok: true, duplicate: true, outcome: claim.previousOutcome ?? "recorded" });
  }
  if (claim.status === "in_flight") {
    return json({ error: "Delivery already being processed; retry." }, 503);
  }

  // 7. Write — the single writer of waiver state.
  const recorded = await deps.store.recordSignedWaiver({
    registrationId: registration.id,
    contactId: registration.contactId,
    waiverType: registration.waiverType,
    submissionId: event.submissionId,
    completedAt: event.completedAt,
    documentUrl: event.documentUrl,
    source: "docuseal",
  });

  if (!recorded.ok) {
    console.error("DocuSeal webhook: failed to record signature", {
      registrationId: registration.id,
      error: recorded.error,
    });
    try {
      await deps.store.finishEvent({
        eventKey,
        processed: false,
        outcome: "write_failed",
        detail: recorded.error ?? null,
      });
    } catch (err) {
      console.error("DocuSeal webhook: could not note the failure:", err instanceof Error ? err.message : err);
    }
    return json({ error: "Failed to record signature; retry." }, 500);
  }

  // 8. Done. A failure to stamp the claim is logged only: the signature is
  //    recorded, and a later retry converges on the same values.
  try {
    await deps.store.finishEvent({ eventKey, processed: true, outcome: "recorded", detail: null });
  } catch (err) {
    console.error("DocuSeal webhook: could not mark event processed:", err instanceof Error ? err.message : err);
  }

  console.info("DocuSeal webhook: signature recorded", {
    registrationId: registration.id,
    submissionId: event.submissionId,
    reclaimed: claim.status === "reclaimed",
  });
  return json({ ok: true, outcome: "recorded", registrationId: registration.id });
}
