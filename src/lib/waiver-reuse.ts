/**
 * May an existing waiver on a contact cover a registration without a new
 * signature? (Stage 1.3, SEC-01.)
 *
 * ## The invariant
 *
 * A matching email address IDENTIFIES a person; it never AUTHORISES reuse of
 * that person's waiver. Before this module, `POST /api/register` marked a new
 * registration signed on the strength of the typed email alone
 * (`backend_audit_v1.md` F-04, `docs/waiver_identity_model.md`). Anyone who
 * knew a returning player's address could register under their waiver.
 *
 * ## The rule
 *
 * Reuse is allowed only when ALL of these hold:
 *
 *   1. the caller's identity is a Supabase Auth session resolved to the very
 *      contact row that holds the waiver (`linkage: "authenticated_contact"`);
 *   2. the registration being covered is that contact's own row
 *      (`registrationContactId` equals `contact.id`, or the row is about to be
 *      created for that contact);
 *   3. the waiver is an ADULT waiver; and
 *   4. it is unexpired and of the requested type (`isContactWaiverValid`).
 *
 * Youth waivers are never reused. The data model has no child identity apart
 * from the contact — a contact is a mailbox plus the first-typed name — so a
 * parent registering a second child, or a stranger who knows the parent's
 * address, is indistinguishable from the parent re-registering the child who
 * was actually signed for. A fresh youth waiver per registration is the only
 * answer the schema can defend; the business question is recorded in
 * `docs/waiver_identity_model.md`.
 *
 * Anonymous callers, resume sessions and the retired HMAC token never qualify:
 * the first proves nothing, the second proves authority over ONE registration
 * rather than identity across a person's history, and the third no longer
 * exists. Registration itself is never refused because reuse was refused — the
 * caller creates the row and the waiver simply stays required.
 *
 * Pure, so the branch table lives in scripts/test-waiver-reuse.ts. Every
 * reuse writer and every display surface that offers reuse calls this and
 * nothing else, so the rule cannot drift between them.
 */
import { isContactWaiverValid } from "@/lib/contacts";
import type { Contact, WaiverType } from "@/lib/types";

/** How the caller is known to us. Only one value can ever unlock reuse. */
export type WaiverReuseLinkage =
  /** A typed email address on an anonymous request. Nothing is proven. */
  | "anonymous_email"
  /** An `hps_resume` session: authority over one registration, not an identity. */
  | "resume_session"
  /** The 90-day HMAC token retired in Stage 1.3. Named so it can never be re-added quietly. */
  | "legacy_token"
  /** Supabase Auth session whose verified email resolved to exactly this contact row. */
  | "authenticated_contact";

/**
 * The slice of a contact the decision reads. `waiver_document_url` is optional
 * so the callers that only decide (signup state, open play, event standing)
 * keep their four-column selects; only the writer that copies a waiver onto a
 * registration needs the document link.
 */
export type WaiverReuseContact = Pick<
  Contact,
  "id" | "waiver_type" | "waiver_signed_at" | "waiver_expires_at"
> & { waiver_document_url?: string | null };

export type WaiverReuseRefusal =
  | "no_contact"
  | "youth_requires_fresh_waiver"
  | "linkage_insufficient"
  | "registration_contact_mismatch"
  | "waiver_missing"
  | "waiver_type_mismatch"
  | "waiver_expired";

export type WaiverReuseDecision =
  | {
      allowed: true;
      /** Copied onto the registration: the date the CONTACT signed, never "now". */
      signedAt: string;
      expiresAt: string;
      documentUrl: string | null;
    }
  | { allowed: false; reason: WaiverReuseRefusal };

export type WaiverReuseInput = {
  contact: WaiverReuseContact | null;
  waiverType: WaiverType;
  linkage: WaiverReuseLinkage;
  /**
   * `registrations.contact_id` of the row the waiver would cover. Omit when the
   * row is about to be INSERTED for `contact` (it will carry `contact.id`). A
   * null here — a legacy row with no contact link — refuses, on purpose: an
   * unknown subject is not the same subject.
   */
  registrationContactId?: string | null;
  now?: number;
};

export function decideWaiverReuse(input: WaiverReuseInput): WaiverReuseDecision {
  const now = input.now ?? Date.now();
  const { contact } = input;

  if (!contact) return refuse("no_contact");

  // Subject before identity: a youth waiver is never reusable, whoever asks.
  if (input.waiverType === "youth") return refuse("youth_requires_fresh_waiver");

  if (input.linkage !== "authenticated_contact") return refuse("linkage_insufficient");

  if (
    input.registrationContactId !== undefined &&
    input.registrationContactId !== contact.id
  ) {
    return refuse("registration_contact_mismatch");
  }

  if (!contact.waiver_signed_at) return refuse("waiver_missing");
  if (contact.waiver_type !== input.waiverType) return refuse("waiver_type_mismatch");
  if (!contact.waiver_expires_at || Number.isNaN(Date.parse(contact.waiver_expires_at))) {
    return refuse("waiver_missing");
  }
  if (Date.parse(contact.waiver_expires_at) <= now) return refuse("waiver_expired");

  // The reasons above are the readable form of this one check; it stays as the
  // final word so the two can never disagree.
  if (!isContactWaiverValid(contact, input.waiverType, now)) return refuse("waiver_expired");

  return {
    allowed: true,
    signedAt: contact.waiver_signed_at,
    expiresAt: contact.waiver_expires_at,
    documentUrl: contact.waiver_document_url ?? null,
  };
}

function refuse(reason: WaiverReuseRefusal): WaiverReuseDecision {
  return { allowed: false, reason };
}

/** Player-facing wording for a refusal, where a screen needs one. */
export function describeWaiverReuseRefusal(reason: WaiverReuseRefusal): string {
  switch (reason) {
    case "youth_requires_fresh_waiver":
      return "Youth waivers are signed once per registration by a parent or guardian.";
    case "waiver_expired":
      return "Your waiver has expired and needs signing again.";
    case "waiver_type_mismatch":
      return "The waiver on file is for a different registration type.";
    case "no_contact":
    case "waiver_missing":
      return "We don't have a signed waiver on file for you yet.";
    case "linkage_insufficient":
    case "registration_contact_mismatch":
      return "Sign in with Google to reuse a waiver on file, or sign a new one.";
  }
}
