/**
 * Server side of Stage 2.3 item B: load who could be messaged, and do the
 * sending.
 *
 * The pure decisions live in `admin-messages.ts`; this is the part that touches
 * the database and the provider.
 */

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  MAX_RECIPIENTS_PER_SEND,
  renderMessageBody,
  resolveAudience,
  type MessageAudience,
  type MessageCandidate,
  type ResolvedAudience,
  type ResolvedRecipient,
} from "@/lib/admin-messages";
import { getAdminEmailSender } from "@/lib/email/message-sender";

type RegistrationRow = {
  id: string;
  contact_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  payment_status: string;
  team_id: string | null;
  waiver_signed_at: string | null;
  waiver_document_url: string | null;
  contacts: {
    waiver_signed_at: string | null;
    waiver_expires_at: string | null;
    waiver_document_url: string | null;
    waiver_source: string | null;
  } | null;
};

/**
 * Everyone holding a live spot on this event, in the shape the audience rules
 * understand.
 *
 * Only `contacts` is embedded. `registrations` has two foreign keys to
 * `tournaments` (tournament_id and free_entry_tournament_id) and PostgREST will
 * not choose between them, so an unqualified `tournaments(...)` embed here would
 * answer PGRST201 at runtime while passing tsc and build. The event is already
 * known from the caller, so there is nothing to embed.
 */
export async function loadMessageCandidates(
  tournamentId: string
): Promise<{ ok: true; candidates: MessageCandidate[] } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select(
      "id, contact_id, first_name, last_name, email, payment_status, team_id, " +
        "waiver_signed_at, waiver_document_url, " +
        "contacts(waiver_signed_at, waiver_expires_at, waiver_document_url, waiver_source)"
    )
    .eq("tournament_id", tournamentId)
    .is("cancelled_at", null)
    .order("last_name", { ascending: true });

  if (error) {
    console.error("[admin-messages] candidate load failed:", error.message);
    return { ok: false, error: "Could not load the people on this event." };
  }

  const rows = (data ?? []) as unknown as RegistrationRow[];
  return {
    ok: true,
    candidates: rows.map((r) => ({
      registrationId: r.id,
      contactId: r.contact_id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      paymentStatus: r.payment_status,
      teamId: r.team_id,
      contactSignedAt: r.contacts?.waiver_signed_at ?? null,
      contactExpiresAt: r.contacts?.waiver_expires_at ?? null,
      contactDocumentUrl: r.contacts?.waiver_document_url ?? null,
      contactSource: r.contacts?.waiver_source ?? null,
      regSignedAt: r.waiver_signed_at,
      regDocumentUrl: r.waiver_document_url,
    })),
  };
}

export async function resolveForEvent(
  tournamentId: string,
  audience: MessageAudience,
  options: { teamId?: string | null; registrationIds?: readonly string[] }
): Promise<{ ok: true; resolved: ResolvedAudience } | { ok: false; error: string }> {
  const loaded = await loadMessageCandidates(tournamentId);
  if (!loaded.ok) return loaded;
  return { ok: true, resolved: resolveAudience(loaded.candidates, audience, options) };
}

export type DeliveryOutcome = {
  sent: number;
  failed: number;
  /** Set when nothing could be sent because no provider is configured. */
  unconfigured: boolean;
};

/**
 * Send one batch's queued rows, one address at a time, recording each outcome
 * as it happens.
 *
 * Sequential on purpose. The volumes are a few dozen; sending in parallel buys
 * nothing an operator would notice and makes a provider rate-limit look like a
 * random scatter of failures. Recording after each send also means a crash
 * halfway leaves a truthful record rather than an unknown one — the rows that
 * went are 'sent', the rest are still 'queued' and a retry picks them up.
 */
export async function deliverBatch(
  batchId: string,
  eventTitle: string,
  subject: string,
  bodyTemplate: string
): Promise<DeliveryOutcome> {
  const sender = getAdminEmailSender();

  const { data, error } = await supabaseAdmin
    .from("message_recipients")
    .select("id, email, name, status")
    .eq("batch_id", batchId)
    .in("status", ["queued", "failed"]);

  if (error) {
    console.error("[admin-messages] could not load queued recipients:", error.message);
    return { sent: 0, failed: 0, unconfigured: false };
  }

  const rows = (data ?? []) as Array<{
    id: string;
    email: string;
    name: string | null;
    status: string;
  }>;

  let sent = 0;
  let failed = 0;
  let unconfigured = false;

  for (const row of rows) {
    const name = row.name ?? "";
    const firstName = name.split(" ")[0] || "there";
    const text = renderMessageBody(bodyTemplate, {
      firstName,
      name: name || "there",
      event: eventTitle,
    });

    const result = await sender.send({ to: row.email, subject, text });
    if (result.error === "email_provider_not_configured") unconfigured = true;
    if (result.delivered) sent += 1;
    else failed += 1;

    const { error: markError } = await supabaseAdmin.rpc("mark_message_sent", {
      p: {
        id: row.id,
        status: result.delivered ? "sent" : "failed",
        provider_id: result.providerId ?? null,
        error: result.error ?? null,
      },
    });
    if (markError) {
      // The mail may well have gone. Say so loudly rather than let the record
      // and reality drift apart silently.
      console.error(
        `[admin-messages] recipient ${row.id} was ${result.delivered ? "SENT" : "attempted"} but its outcome could not be recorded:`,
        markError.message
      );
    }
  }

  return { sent, failed, unconfigured };
}

/** Guard shared by the preview and the send. */
export function tooManyRecipients(recipients: readonly ResolvedRecipient[]): boolean {
  return recipients.length > MAX_RECIPIENTS_PER_SEND;
}
