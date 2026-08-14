/**
 * Ask DocuSeal whether a waiver was actually signed, instead of waiting for a
 * webhook to tell us.
 *
 * ## Why this exists
 *
 * The app used to learn about a signature in exactly one way: the DocuSeal
 * webhook. On 2026-08-14 that webhook was found to have **two independent
 * faults, either of which alone would have lost every signature**:
 *
 *  1. It was configured against the **apex domain**, which Vercel 307s to
 *     `www` at the edge. DocuSeal does not follow redirects — it logged the
 *     307 as a successful delivery and dropped the body. 10 of 10 deliveries
 *     in its log were 307s and its "Failed" tab was empty, so from the
 *     sending side everything looked healthy.
 *  2. `DOCUSEAL_WEBHOOK_SECRET` was never set in Vercel, so the endpoint
 *     would have answered 503 to any delivery that did arrive.
 *
 * Seven registrations sat at `docuseal_status='sent'` with players who had
 * genuinely signed — every one of them COMPLETED on DocuSeal's side — and
 * `waiver_document_url` was NULL for all 104 rows ever created.
 *
 * Both faults were configuration, and neither was visible from inside the app.
 * That is the point: **a webhook can fail in ways the receiver cannot detect
 * or fix.** This module removes the dependency instead of trusting it.
 *
 * The player-visible symptom was worse than a missing column. A signer was
 * redirected back to the site, `waiver_signed` was still false, and
 * `resolveSignupState` therefore answered `needs_waiver` — so the site asked
 * them to sign the thing they had just signed. That is the loop the operator
 * reported as "you sign it and your account doesn't update".
 *
 * ## The rule
 *
 * A webhook is a *notification*, never the source of truth. Anywhere the app is
 * about to make a decision from `waiver_signed`, it may ask DocuSeal first.
 * `/api/admin/registrations/[id]/sign-waiver` already worked this way for the
 * owner standing at the field (REBUILD-PLAN §A4, "Done — check"); this brings
 * the same guarantee to the player's own round trip.
 *
 * Setting the webhook secret is still worth doing — it makes the update
 * instant and covers players who close the tab before being redirected — but
 * nothing here depends on it any more.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchSubmissionSnapshot, recordSignedWaiver } from "@/lib/waiver-capture";

export type WaiverReconcileReason =
  /** Our own column already said signed; DocuSeal was not called. */
  | "already_signed"
  /** DocuSeal confirmed it, and we just wrote it down. */
  | "recorded"
  /** DocuSeal has the submission but nobody has completed it yet. */
  | "still_pending"
  /** Nothing was ever sent to DocuSeal for this registration. */
  | "no_submission"
  /** `DOCUSEAL_API_KEY` is absent, so this registration is in-app-signed. */
  | "not_configured"
  | "registration_not_found"
  | "docuseal_unreachable"
  | "write_failed";

export type WaiverReconcileResult = {
  /** Whether the waiver is signed *after* this call. */
  signed: boolean;
  /** True only when this call is what flipped it. Safe to use for logging. */
  changed: boolean;
  reason: WaiverReconcileReason;
  documentUrl: string | null;
  /** The DocuSeal page this player should return to, when one is known. */
  signUrl: string | null;
};

/**
 * DocuSeal sits between a player and the page they are waiting on, so a hung
 * request would hang the render. Six seconds is generous for a single GET and
 * still short enough that a DocuSeal outage degrades to "we could not check"
 * rather than a page that never paints.
 */
const DOCUSEAL_TIMEOUT_MS = 6000;

type ReconcileRow = {
  id: string;
  contact_id: string | null;
  waiver_type: string | null;
  waiver_signed: boolean | null;
  docuseal_submission_id: number | null;
  docuseal_sign_url: string | null;
};

function result(
  partial: Partial<WaiverReconcileResult> & Pick<WaiverReconcileResult, "signed" | "reason">
): WaiverReconcileResult {
  return {
    changed: false,
    documentUrl: null,
    signUrl: null,
    ...partial,
  };
}

export type ReconcilePlan =
  | {
      action: "skip";
      reason: "already_signed" | "no_submission" | "not_configured";
      signed: boolean;
    }
  | { action: "ask_docuseal"; submissionId: number };

/**
 * Whether this registration is worth a DocuSeal round trip, and why not when
 * it isn't. Pure so the branch table can be checked without a database or a
 * network — see scripts/test-waiver-reconcile.ts.
 *
 * **Order is the substance here.**
 *
 * - `already_signed` outranks everything. A signed row must never trigger an
 *   API call: this runs on page render, so a signed player revisiting their
 *   status would otherwise bill a DocuSeal request on every page view.
 * - `no_submission` is checked *before* the API key, because a registration
 *   with no submission was signed in the app (or not started). Reporting that
 *   as "DocuSeal not configured" would send an operator hunting a config bug
 *   that isn't there.
 */
export function planWaiverReconcile(
  row: {
    waiver_signed: boolean | null;
    docuseal_submission_id: number | null;
  },
  apiKeyPresent: boolean
): ReconcilePlan {
  if (row.waiver_signed) {
    return { action: "skip", reason: "already_signed", signed: true };
  }
  if (row.docuseal_submission_id == null) {
    return { action: "skip", reason: "no_submission", signed: false };
  }
  if (!apiKeyPresent) {
    return { action: "skip", reason: "not_configured", signed: false };
  }
  return { action: "ask_docuseal", submissionId: row.docuseal_submission_id };
}

/**
 * Bring one registration's waiver state in line with DocuSeal.
 *
 * Never throws and never rejects: every caller is a page render or a hot admin
 * path, and a waiver check failing is not a reason to show a player an error.
 * A failure returns `signed: false` with a reason, which is the same answer the
 * caller would have reached on its own.
 */
export async function reconcileWaiverForRegistration(
  registrationId: string
): Promise<WaiverReconcileResult> {
  const apiKey = process.env.DOCUSEAL_API_KEY?.trim();

  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select(
      "id, contact_id, waiver_type, waiver_signed, docuseal_submission_id, docuseal_sign_url"
    )
    .eq("id", registrationId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("[waiver-reconcile] lookup failed:", error.message);
    }
    return result({ signed: false, reason: "registration_not_found" });
  }

  const row = data as ReconcileRow;
  const plan = planWaiverReconcile(row, Boolean(apiKey));

  if (plan.action === "skip") {
    return result({
      signed: plan.signed,
      reason: plan.reason,
      signUrl: row.docuseal_sign_url,
    });
  }

  let snapshot: Awaited<ReturnType<typeof fetchSubmissionSnapshot>> = null;
  try {
    snapshot = await fetchSubmissionSnapshot(plan.submissionId, apiKey!, {
      timeoutMs: DOCUSEAL_TIMEOUT_MS,
    });
  } catch (err) {
    console.error("[waiver-reconcile] DocuSeal request failed:", err);
    return result({
      signed: false,
      reason: "docuseal_unreachable",
      signUrl: row.docuseal_sign_url,
    });
  }

  if (!snapshot) {
    return result({
      signed: false,
      reason: "docuseal_unreachable",
      signUrl: row.docuseal_sign_url,
    });
  }

  if (!snapshot.completed) {
    return result({
      signed: false,
      reason: "still_pending",
      signUrl: row.docuseal_sign_url,
    });
  }

  const recorded = await recordSignedWaiver({
    registrationId: row.id,
    contactId: row.contact_id,
    waiverType: row.waiver_type,
    submissionId: plan.submissionId,
    completedAt: snapshot.completedAt,
    documentUrl: snapshot.documentUrl,
  });

  if (!recorded.ok) {
    console.error("[waiver-reconcile] write failed:", recorded.error);
    return result({
      signed: false,
      reason: "write_failed",
      signUrl: row.docuseal_sign_url,
    });
  }

  console.info(
    `[waiver-reconcile] recovered a signature the webhook never delivered: registration ${row.id}, submission ${plan.submissionId}`
  );

  return {
    signed: true,
    changed: true,
    reason: "recorded",
    documentUrl: recorded.documentUrl,
    signUrl: row.docuseal_sign_url,
  };
}

/**
 * Cheap pre-filter for render paths: only worth calling DocuSeal when our own
 * row is unsigned. Callers that already hold the registration should use this
 * so an ordinary page load costs nothing extra.
 */
export async function reconcileIfUnsigned(
  registration: { id: string; waiver_signed: boolean } | null
): Promise<WaiverReconcileResult | null> {
  if (!registration || registration.waiver_signed) return null;
  return reconcileWaiverForRegistration(registration.id);
}
