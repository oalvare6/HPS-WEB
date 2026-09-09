/**
 * What happens to the waiver right after `POST /api/register` inserts a row —
 * and which scopes the registration-bound session it mints should carry.
 *
 * Pure. The route resolves the inputs (does the caller hold a Supabase
 * session for the same contact? is DocuSeal configured?) and asks this; the
 * branch table is in scripts/test-waiver-reuse.ts.
 *
 * The three outcomes:
 *
 *   reuse     — an adult waiver on the caller's OWN authenticated contact is
 *               still valid; copy it onto the row (`decideWaiverReuse` said so).
 *   docuseal  — create a DocuSeal submission and send the browser to sign.
 *   in_app    — DocuSeal is not configured; the browser signs the typed-name
 *               placeholder (A7). Only this outcome grants the session the
 *               `waiver:sign` scope, because only here does a browser request
 *               legitimately complete a waiver.
 *
 * Registration never fails here. A refused reuse is the ordinary case for a
 * new player and simply means "sign it".
 */
import {
  IN_APP_WAIVER_SCOPE,
  RESUME_SCOPES,
  type ResumeScope,
} from "@/lib/resume-access";
import {
  decideWaiverReuse,
  type WaiverReuseContact,
  type WaiverReuseDecision,
  type WaiverReuseLinkage,
  type WaiverReuseRefusal,
} from "@/lib/waiver-reuse";
import type { WaiverType } from "@/lib/types";

export type RegistrationWaiverPlan =
  | {
      mode: "reuse";
      decision: Extract<WaiverReuseDecision, { allowed: true }>;
      scopes: readonly ResumeScope[];
    }
  | { mode: "docuseal"; refusal: WaiverReuseRefusal; scopes: readonly ResumeScope[] }
  | { mode: "in_app"; refusal: WaiverReuseRefusal; scopes: readonly ResumeScope[] };

export type RegistrationWaiverPlanInput = {
  contact: WaiverReuseContact;
  waiverType: WaiverType;
  linkage: WaiverReuseLinkage;
  /**
   * `contact_id` the inserted row actually carries after the post-insert
   * phone/email link step. When it is not `contact.id` the row belongs to
   * somebody else's record and reuse is refused.
   */
  registrationContactId?: string | null;
  docusealConfigured: boolean;
  now?: number;
};

export function planRegistrationWaiver(input: RegistrationWaiverPlanInput): RegistrationWaiverPlan {
  const decision = decideWaiverReuse({
    contact: input.contact,
    waiverType: input.waiverType,
    linkage: input.linkage,
    registrationContactId: input.registrationContactId,
    now: input.now,
  });

  if (decision.allowed) {
    return { mode: "reuse", decision, scopes: RESUME_SCOPES };
  }

  if (input.docusealConfigured) {
    return { mode: "docuseal", refusal: decision.reason, scopes: RESUME_SCOPES };
  }

  return {
    mode: "in_app",
    refusal: decision.reason,
    scopes: [...RESUME_SCOPES, IN_APP_WAIVER_SCOPE],
  };
}
