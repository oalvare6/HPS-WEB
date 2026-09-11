/**
 * Stage 2.3 item B — who a message goes to, and what it says.
 *
 * Everything in this file is pure. Audience resolution, rendering and the
 * decision to skip a recipient are the parts that must be identical in the
 * preview the owner approves and the send that follows, so they are decided
 * once, here, and exercised by tests that need neither a database nor Resend.
 *
 * The delivery boundary is `src/lib/email/message-sender.ts`; persistence and
 * idempotency are the database's job (`record_message_batch`).
 *
 * WHY AUDIENCES ARE RESOLVED SERVER-SIDE
 *
 * The Stage 2.1 prototype let the browser pick recipients from a roster it had
 * already loaded. That is fine for a preview and wrong for a send: the list
 * would be whatever the page happened to be showing, which may be minutes stale
 * and filtered by a search box. "Everyone unpaid on this event" has to mean the
 * people who are unpaid when the send happens, computed from the same
 * `isFinanciallySettled` the roster uses — so the server resolves the audience
 * and the browser confirms it.
 */

import { isFinanciallySettled, waiverStatusFor } from "@/lib/admin-roster";

export const MESSAGE_AUDIENCES = [
  "all",
  "unpaid",
  "waiver_missing",
  "team",
  "explicit",
] as const;
export type MessageAudience = (typeof MESSAGE_AUDIENCES)[number];

export function isMessageAudience(v: unknown): v is MessageAudience {
  return typeof v === "string" && (MESSAGE_AUDIENCES as readonly string[]).includes(v);
}

export const AUDIENCE_LABELS: Record<MessageAudience, string> = {
  all: "Everyone on this event",
  unpaid: "Everyone who still owes money",
  waiver_missing: "Everyone missing a waiver",
  team: "One team",
  explicit: "The people I pick",
};

/** The subset of a registration this module needs to decide anything. */
export type MessageCandidate = {
  registrationId: string;
  contactId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  paymentStatus: string;
  teamId: string | null;
  /** Waiver columns, in the shape `waiverStatusFor` already understands. */
  contactSignedAt?: string | null;
  contactExpiresAt?: string | null;
  contactDocumentUrl?: string | null;
  contactSource?: string | null;
  regSignedAt?: string | null;
  regDocumentUrl?: string | null;
};

export type ResolvedRecipient = {
  registrationId: string;
  contactId: string | null;
  name: string;
  email: string;
};

export type SkippedRecipient = {
  registrationId: string;
  name: string;
  /** Shown to the operator, so it has to read as a reason and not a code. */
  reason: string;
};

export type ResolvedAudience = {
  recipients: ResolvedRecipient[];
  skipped: SkippedRecipient[];
};

function fullName(c: MessageCandidate): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

/**
 * A placeholder address invented for a walk-in is not a mailbox. Sending to one
 * would bounce and, worse, would look in the outcome list exactly like a real
 * address that failed.
 */
function isUnsendable(email: string | null): boolean {
  if (!email) return true;
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return true;
  return email.endsWith(".invalid") || email.endsWith("@walk-in.local");
}

function matchesAudience(
  candidate: MessageCandidate,
  audience: MessageAudience,
  options: { teamId?: string | null; registrationIds?: readonly string[] }
): boolean {
  switch (audience) {
    case "all":
      return true;
    case "unpaid":
      return !isFinanciallySettled(candidate.paymentStatus);
    case "waiver_missing":
      return !waiverStatusFor({
        contactSignedAt: candidate.contactSignedAt,
        contactExpiresAt: candidate.contactExpiresAt,
        contactDocumentUrl: candidate.contactDocumentUrl,
        contactSource: candidate.contactSource,
        regSignedAt: candidate.regSignedAt,
        regDocumentUrl: candidate.regDocumentUrl,
      }).ok;
    case "team":
      return Boolean(options.teamId) && candidate.teamId === options.teamId;
    case "explicit":
      return (options.registrationIds ?? []).includes(candidate.registrationId);
  }
}

/**
 * Split the event's live registrations into who will be written to and who will
 * not, with a reason for every exclusion.
 *
 * Nobody is dropped silently. A recipient with no email is *listed as skipped*
 * rather than omitted, because "I messaged the unpaid players" and "I messaged
 * the unpaid players who happen to have an address on file" are different
 * claims, and only one of them is true.
 */
export function resolveAudience(
  candidates: readonly MessageCandidate[],
  audience: MessageAudience,
  options: { teamId?: string | null; registrationIds?: readonly string[] } = {}
): ResolvedAudience {
  const recipients: ResolvedRecipient[] = [];
  const skipped: SkippedRecipient[] = [];
  const seenEmails = new Set<string>();

  for (const candidate of candidates) {
    if (!matchesAudience(candidate, audience, options)) continue;

    const name = fullName(candidate);
    if (isUnsendable(candidate.email)) {
      skipped.push({ registrationId: candidate.registrationId, name, reason: "No email on file" });
      continue;
    }
    const email = candidate.email!.trim().toLowerCase();

    // One message per address. Somebody registered for two events, or listed
    // twice, should not get the same reminder twice in one send.
    if (seenEmails.has(email)) {
      skipped.push({
        registrationId: candidate.registrationId,
        name,
        reason: "Already included under the same email address",
      });
      continue;
    }
    seenEmails.add(email);
    recipients.push({
      registrationId: candidate.registrationId,
      contactId: candidate.contactId,
      name,
      email,
    });
  }

  return { recipients, skipped };
}

/* ------------------------------------------------------------------ */
/* Templates and rendering                                             */
/* ------------------------------------------------------------------ */

export const MESSAGE_TEMPLATES = {
  payment: {
    label: "Payment reminder",
    subject: "A reminder about your Houston Premier Soccer payment",
    body:
      "Hi {{first_name}},\n\nA quick reminder from Houston Premier Soccer: your payment for {{event}} is still outstanding.\n\nIf you have already paid, just reply to this email and we will check your registration.\n\nThank you!",
  },
  waiver: {
    label: "Waiver reminder",
    subject: "Please sign your Houston Premier Soccer waiver",
    body:
      "Hi {{first_name}},\n\nPlease complete your waiver for {{event}} before you play. Reply to this email if you need help finding it.\n\nThank you!",
  },
  schedule: {
    label: "Game information",
    subject: "Your next Houston Premier Soccer game",
    body:
      "Hi {{first_name}},\n\nHere are the details for the next game in {{event}}:\n\nDate: [add date]\nKickoff: [add time]\nOpponent: [add opponent]\n\nPlease arrive early and check the event page for updates.",
  },
  announcement: {
    label: "Event announcement",
    subject: "An update from Houston Premier Soccer",
    body: "Hi {{first_name}},\n\nAn update about {{event}}:\n\n[Write your announcement here]",
  },
} as const;

export type MessageTemplate = keyof typeof MESSAGE_TEMPLATES;

export function isMessageTemplate(v: unknown): v is MessageTemplate {
  return typeof v === "string" && v in MESSAGE_TEMPLATES;
}

/**
 * The only placeholders that exist. Anything else is left exactly as typed —
 * inventing a value for an unknown token is how a player receives an email
 * addressed to "undefined".
 */
export const MESSAGE_PLACEHOLDERS = ["{{first_name}}", "{{name}}", "{{event}}"] as const;

export function renderMessageBody(
  template: string,
  vars: { firstName: string; name: string; event: string }
): string {
  return template
    .replaceAll("{{first_name}}", vars.firstName)
    .replaceAll("{{name}}", vars.name)
    .replaceAll("{{event}}", vars.event);
}

/** Placeholders the operator left in the text that this renderer will not fill. */
export function unknownPlaceholders(template: string): string[] {
  const found = template.match(/\{\{[a-z_]+\}\}/gi) ?? [];
  const known = new Set<string>(MESSAGE_PLACEHOLDERS);
  return [...new Set(found.filter((f) => !known.has(f)))];
}

export const MAX_MESSAGE_BODY = 5000;
export const MAX_MESSAGE_SUBJECT = 200;
/**
 * A ceiling on one send. Not a provider limit — a blast radius. The owner runs
 * events of a few dozen people; a send addressed to hundreds means the audience
 * was resolved wrongly, and refusing is better than finding out afterwards.
 */
export const MAX_RECIPIENTS_PER_SEND = 200;

export type MessageSendStatus = "queued" | "sent" | "failed" | "skipped";

export type MessageRecipientRow = {
  id: string;
  registration_id: string | null;
  email: string;
  name: string | null;
  status: MessageSendStatus;
  error: string | null;
  provider_id: string | null;
  attempts: number;
  sent_at: string | null;
};

export type MessageBatchRow = {
  id: string;
  template: string | null;
  audience: string;
  subject: string;
  body: string;
  created_by: string;
  created_at: string;
  recipients: MessageRecipientRow[];
};

/** A one-line summary an operator can read at a glance. */
export function describeOutcome(recipients: readonly MessageRecipientRow[]): string {
  const sent = recipients.filter((r) => r.status === "sent").length;
  const failed = recipients.filter((r) => r.status === "failed").length;
  const queued = recipients.filter((r) => r.status === "queued").length;
  const parts = [`${sent} sent`];
  if (failed) parts.push(`${failed} failed`);
  if (queued) parts.push(`${queued} still queued`);
  return parts.join(", ");
}
