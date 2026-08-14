/**
 * The single place a signed waiver gets written down.
 *
 * There used to be three copies of this logic — the DocuSeal webhook,
 * `/api/admin/sync-waivers`, and the waiver-skip branch of `/api/register` —
 * and they had already drifted: **sync-waivers never stored
 * `waiver_document_url` at all.** That is why production has 104 registrations
 * with a DocuSeal submission, 97 marked signed, and zero document links: the
 * PDFs exist in DocuSeal, and the app simply forgot to write down where.
 *
 * A waiver you cannot produce is not a waiver. Everything that learns a waiver
 * was signed now goes through `recordSignedWaiver` so the link is always kept.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getWaiverExpiryIso } from "@/lib/contacts";

const DOCUSEAL_API = "https://api.docuseal.com";

export type DocuSealSubmissionSnapshot = {
  completed: boolean;
  completedAt: string | null;
  /** The signed PDF. Null when DocuSeal has not produced one yet. */
  documentUrl: string | null;
};

type RawSubmitter = {
  id?: number;
  status?: string;
  completed_at?: string | null;
};

type RawSubmission = {
  status?: string;
  completed_at?: string | null;
  combined_document_url?: string | null;
  audit_log_url?: string | null;
  submitters?: RawSubmitter[];
  documents?: { name?: string; url?: string }[];
};

/**
 * Pull the document link out of whichever shape DocuSeal used. The webhook
 * payload and the REST response differ, and a submission can carry either a
 * combined PDF or a per-document list.
 */
export function documentUrlFrom(submission: RawSubmission | null): string | null {
  if (!submission) return null;
  return (
    submission.combined_document_url ??
    submission.documents?.find((d) => d.url)?.url ??
    null
  );
}

/**
 * Read a submission's current state from DocuSeal.
 *
 * `timeoutMs` matters when this is called during a page render — see
 * `src/lib/waiver-reconcile.ts`. Without it a stalled DocuSeal connection would
 * hold the player's page open until the platform's own timeout fired.
 */
export async function fetchSubmissionSnapshot(
  submissionId: number | string,
  apiKey: string,
  opts?: { timeoutMs?: number }
): Promise<DocuSealSubmissionSnapshot | null> {
  const res = await fetch(`${DOCUSEAL_API}/submissions/${submissionId}`, {
    headers: { "X-Auth-Token": apiKey },
    ...(opts?.timeoutMs
      ? { signal: AbortSignal.timeout(opts.timeoutMs) }
      : {}),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as RawSubmission;
  const submitters = Array.isArray(body.submitters) ? body.submitters : [];
  const done = submitters.find((s) => s.status === "completed");
  const completed = Boolean(done) || body.status === "completed";
  return {
    completed,
    completedAt: done?.completed_at ?? body.completed_at ?? null,
    documentUrl: documentUrlFrom(body),
  };
}

export type RecordSignedWaiverInput = {
  registrationId: string;
  contactId: string | null;
  waiverType: string | null;
  submissionId: number | string | null;
  /** When DocuSeal says it was signed. Defaults to now. */
  completedAt?: string | null;
  documentUrl?: string | null;
  /**
   * How we learned about the signature. Must be one of the values allowed by
   * `contacts_waiver_source_check` — see
   * supabase/migrations/20260812210000_create_waiver_signatures.sql.
   */
  source?: "docuseal" | "in_app";
};

export type RecordSignedWaiverResult = {
  ok: boolean;
  signedAt: string;
  expiresAt: string | null;
  documentUrl: string | null;
  error?: string;
};

/**
 * Mark a waiver signed on the registration and promote it to the contact, so a
 * returning player never signs twice (D5's "waiver good through <date>").
 *
 * The document link is written in the same statement as the signed flag rather
 * than a best-effort follow-up — if we know the URL, it is not optional.
 */
export async function recordSignedWaiver(
  input: RecordSignedWaiverInput
): Promise<RecordSignedWaiverResult> {
  const signedAt = input.completedAt ?? new Date().toISOString();
  const expiresAt = getWaiverExpiryIso(signedAt);
  const documentUrl = input.documentUrl ?? null;

  const registrationPatch: Record<string, unknown> = {
    waiver_signed: true,
    waiver_signed_at: signedAt,
    docuseal_status: "signed",
  };
  if (documentUrl) registrationPatch.waiver_document_url = documentUrl;
  if (input.submissionId != null) {
    registrationPatch.docuseal_submission_id = input.submissionId;
  }

  const { error: regErr } = await supabaseAdmin
    .from("registrations")
    .update(registrationPatch)
    .eq("id", input.registrationId);

  if (regErr) {
    return {
      ok: false,
      signedAt,
      expiresAt,
      documentUrl,
      error: regErr.message,
    };
  }

  if (input.contactId) {
    const contactPatch: Record<string, unknown> = {
      waiver_signed_at: signedAt,
      waiver_expires_at: expiresAt,
      waiver_source: input.source ?? "docuseal",
    };
    if (input.waiverType) contactPatch.waiver_type = input.waiverType;
    if (documentUrl) contactPatch.waiver_document_url = documentUrl;
    if (input.submissionId != null) {
      contactPatch.waiver_submission_id = input.submissionId;
    }

    const { error: contactErr } = await supabaseAdmin
      .from("contacts")
      .update(contactPatch)
      .eq("id", input.contactId);
    if (contactErr) {
      // The registration is already correct; a stale contact is recoverable.
      console.warn(
        "[waiver-capture] contact promotion failed:",
        contactErr.message
      );
    }
  }

  return { ok: true, signedAt, expiresAt, documentUrl };
}

/**
 * Is DocuSeal actually usable right now? All four vars are empty strings in
 * `.env.local` (REBUILD-PLAN §A4), so every DocuSeal path is unreachable
 * locally. Rather than failing at the field, callers use this to fall back to
 * in-app signing — the placeholder that keeps players able to sign at all.
 */
export function isDocuSealConfigured(waiverType: string): boolean {
  const key = process.env.DOCUSEAL_API_KEY?.trim();
  return Boolean(key) && templateIdFor(waiverType) !== null;
}

export type RecordInAppSignatureInput = {
  registrationId: string;
  contactId: string | null;
  waiverType: "adult" | "youth";
  /** Exactly what the signer typed. Stored verbatim. */
  signedName: string;
  signerRelationship?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  waiverVersion: string;
  /** Absolute site origin, so the stored document URL is a real link. */
  siteOrigin: string;
};

export type RecordInAppSignatureResult =
  | { ok: true; signatureId: string; signedAt: string; expiresAt: string | null; documentUrl: string }
  | { ok: false; error: string };

/**
 * Write down an in-app waiver signature, then reuse `recordSignedWaiver` for the
 * registration + contact side so in-app and DocuSeal converge on one code path.
 *
 * The signature row is inserted *first* and deliberately: if the registration
 * update then fails, we are left with a recorded signature and an unmarked
 * registration, which an operator can see and fix. The reverse order would give
 * us a registration claiming a waiver that no row backs up — the exact state
 * production is already in for 104 rows, and not one we are going to recreate.
 */
export async function recordInAppSignature(
  input: RecordInAppSignatureInput
): Promise<RecordInAppSignatureResult> {
  const signedAt = new Date().toISOString();

  const { data: signature, error: sigErr } = await supabaseAdmin
    .from("waiver_signatures")
    .insert({
      registration_id: input.registrationId,
      contact_id: input.contactId,
      waiver_type: input.waiverType,
      signed_name: input.signedName,
      signed_at: signedAt,
      signer_relationship: input.signerRelationship ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      waiver_version: input.waiverVersion,
    })
    .select("id")
    .single();

  if (sigErr || !signature) {
    console.error("[waiver-capture] signature insert failed:", sigErr?.message);
    return {
      ok: false,
      error:
        "We couldn't record your signature. Please try again, or ask us to sign you in at the field.",
    };
  }

  const documentUrl = `${input.siteOrigin.replace(/\/$/, "")}/waiver/${signature.id}`;

  const recorded = await recordSignedWaiver({
    registrationId: input.registrationId,
    contactId: input.contactId,
    waiverType: input.waiverType,
    submissionId: null,
    completedAt: signedAt,
    documentUrl,
    source: "in_app",
  });

  if (!recorded.ok) {
    return {
      ok: false,
      error: "We recorded your signature but couldn't finish your registration. Please contact us.",
    };
  }

  return {
    ok: true,
    signatureId: signature.id,
    signedAt: recorded.signedAt,
    expiresAt: recorded.expiresAt,
    documentUrl,
  };
}

/** Template id for a waiver type, from env. */
export function templateIdFor(waiverType: string): number | null {
  const raw =
    waiverType === "youth"
      ? process.env.DOCUSEAL_YOUTH_TEMPLATE_ID
      : process.env.DOCUSEAL_ADULT_TEMPLATE_ID;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Create a submission the signer completes **on the screen in front of them**
 * (D8), rather than via an emailed link. `send_email: false` is the whole
 * point: the player is standing at the field, not checking their inbox.
 */
export async function createInPersonSubmission(opts: {
  apiKey: string;
  templateId: number;
  email: string;
  name: string;
  metadata: Record<string, string>;
}): Promise<{ submissionId: number | null; signUrl: string | null; embedSrc: string | null }> {
  const res = await fetch(`${DOCUSEAL_API}/submissions`, {
    method: "POST",
    headers: {
      "X-Auth-Token": opts.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_id: opts.templateId,
      send_email: false,
      submitters: [
        {
          role: "First Party",
          email: opts.email,
          name: opts.name,
          metadata: opts.metadata,
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error("[waiver-capture] DocuSeal create failed:", await res.text());
    return { submissionId: null, signUrl: null, embedSrc: null };
  }

  const body = await res.json();
  const submitter = Array.isArray(body) ? body[0] : body.submitters?.[0];
  const submissionId = submitter?.submission_id ?? body.id ?? null;
  const slug = submitter?.slug ?? null;
  return {
    submissionId,
    signUrl: slug ? `https://docuseal.com/s/${slug}` : (submitter?.embed_src ?? null),
    embedSrc: submitter?.embed_src ?? (slug ? `https://docuseal.com/s/${slug}` : null),
  };
}
