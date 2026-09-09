/**
 * Production `DocusealWebhookStore` and the route's dependency wiring.
 *
 * The claim goes through `claim_docuseal_webhook_event` (migration
 * 20260909130000_docuseal_webhook_events.sql) so two deliveries of one event
 * can never both write. Every method throws on a database error; the handler
 * turns that into a 500 so DocuSeal retries, never into "recorded".
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordSignedWaiver, templateIdFor } from "@/lib/waiver-capture";
import type {
  ClaimEventResult,
  DocusealWebhookDeps,
  DocusealWebhookStore,
  WebhookRegistrationRow,
} from "@/lib/docuseal-webhook";

const ROW_SELECT = "id, contact_id, waiver_type, docuseal_submission_id";

type Row = {
  id: string;
  contact_id: string | null;
  waiver_type: string | null;
  docuseal_submission_id: number | null;
};

function toRow(r: Row): WebhookRegistrationRow {
  return {
    id: r.id,
    contactId: r.contact_id ?? null,
    waiverType: r.waiver_type ?? null,
    docusealSubmissionId: r.docuseal_submission_id ?? null,
  };
}

export class SupabaseDocusealWebhookStore implements DocusealWebhookStore {
  async loadRegistration(id: string): Promise<WebhookRegistrationRow | null> {
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .select(ROW_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`load registration: ${error.message}`);
    return data ? toRow(data as Row) : null;
  }

  async findRegistrationsBySubmission(submissionId: number): Promise<WebhookRegistrationRow[]> {
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .select(ROW_SELECT)
      .eq("docuseal_submission_id", submissionId)
      .limit(5);
    if (error) throw new Error(`find by submission: ${error.message}`);
    return ((data ?? []) as Row[]).map(toRow);
  }

  async claimEvent(input: {
    eventKey: string;
    eventType: string;
    submitterId: number;
    submissionId: number;
    registrationId: string;
    staleAfterSeconds: number;
  }): Promise<ClaimEventResult> {
    const { data, error } = await supabaseAdmin.rpc("claim_docuseal_webhook_event", {
      p_event_key: input.eventKey,
      p_event_type: input.eventType,
      p_submitter_id: input.submitterId,
      p_submission_id: input.submissionId,
      p_registration_id: input.registrationId,
      p_stale_after_seconds: input.staleAfterSeconds,
    });
    if (error) throw new Error(`claim_docuseal_webhook_event: ${error.message}`);
    const row = (data ?? {}) as { status?: string; previous_outcome?: string | null };
    switch (row.status) {
      case "claimed":
      case "reclaimed":
      case "duplicate":
      case "in_flight":
        return { status: row.status, previousOutcome: row.previous_outcome ?? null };
      default:
        throw new Error(`claim_docuseal_webhook_event: unexpected status ${String(row.status)}`);
    }
  }

  async recordSignedWaiver(input: Parameters<typeof recordSignedWaiver>[0]) {
    return recordSignedWaiver(input);
  }

  async finishEvent(input: {
    eventKey: string;
    processed: boolean;
    outcome: string;
    detail: string | null;
  }): Promise<void> {
    const patch: Record<string, unknown> = { outcome: input.outcome, detail: input.detail };
    if (input.processed) patch.processed_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("docuseal_webhook_events")
      .update(patch)
      .eq("event_key", input.eventKey);
    if (error) throw new Error(`finish event: ${error.message}`);
  }
}

let _store: SupabaseDocusealWebhookStore | null = null;
let testOverride: DocusealWebhookDeps | null = null;

/** Test-only injection so scripts can drive the real route module. Refused in production builds. */
export function setDocusealWebhookDepsForTests(deps: DocusealWebhookDeps | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setDocusealWebhookDepsForTests is not available in production.");
  }
  testOverride = deps;
}

export function docusealWebhookDeps(): DocusealWebhookDeps {
  if (testOverride) return testOverride;
  if (!_store) _store = new SupabaseDocusealWebhookStore();
  return {
    secret: process.env.DOCUSEAL_WEBHOOK_SECRET?.trim() || null,
    store: _store,
    templateIds: { adult: templateIdFor("adult"), youth: templateIdFor("youth") },
  };
}
