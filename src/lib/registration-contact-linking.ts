import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeEmail, normalizePhone } from "@/lib/contacts";

/**
 * Why this exists (Phase 5):
 *
 * `POST /api/register` already calls `upsertContactByEmail`, which gives the
 * new registration row an email-canonical `contact_id`. That covers the happy
 * path. It does NOT catch the case where the player's *phone number* already
 * belongs to another contact under a different email — that's a likely
 * duplicate, and we want the admin to know about it.
 *
 * This module provides one canonical "find candidate contacts + decide which
 * one wins + flag ambiguity" implementation, used by:
 *   1. The live registration route (post-insert link step).
 *   2. The backfill script (`scripts/backfill-registration-contact-links.ts`).
 *
 * Normalization comes from `src/lib/contacts.ts`. Do not reimplement it here.
 */

export type ContactMatchReason = "email" | "phone" | "both";

export type ContactCandidate = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  reason: ContactMatchReason;
};

export type LinkResolution = {
  /** The contact this registration should point at, or null if no candidates. */
  contactId: string | null;
  /** True when more than one DISTINCT contact matched email or phone. */
  needsAdminReview: boolean;
  /** Match reason for the winning candidate. */
  matchReason: ContactMatchReason | null;
  /** "high" when exactly one distinct candidate; "low" otherwise. */
  confidence: "high" | "low" | null;
};

type CandidateRow = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

function deriveReason(
  candidateEmail: string | null,
  candidatePhone: string | null,
  needleEmail: string,
  needlePhone: string | null
): ContactMatchReason {
  const emailMatch =
    Boolean(needleEmail) &&
    Boolean(candidateEmail) &&
    normalizeEmail(candidateEmail) === needleEmail;
  const phoneMatch =
    Boolean(needlePhone) &&
    Boolean(candidatePhone) &&
    candidatePhone === needlePhone;
  if (emailMatch && phoneMatch) return "both";
  if (emailMatch) return "email";
  return "phone";
}

/**
 * Find every contact whose email matches `normalizeEmail(input.email)` OR
 * whose phone matches `normalizePhone(input.phone)`. Returns candidates
 * sorted by `created_at` DESC so callers can pick "most recent" cheaply.
 *
 * Returns an empty array (not an error) when both email and phone are empty
 * or when the underlying query fails — callers must treat "no candidates"
 * the same way regardless of cause.
 */
export async function findContactCandidates(input: {
  email: string | null | undefined;
  phone: string | null | undefined;
}): Promise<ContactCandidate[]> {
  const email = normalizeEmail(input.email ?? "");
  const phone = normalizePhone(input.phone ?? null);
  if (!email && !phone) return [];

  const orFilters: string[] = [];
  if (email) orFilters.push(`email.eq.${email}`);
  if (phone) orFilters.push(`phone.eq.${phone}`);

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id, email, phone, created_at, updated_at")
    .or(orFilters.join(","))
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[link] candidate query failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as CandidateRow[];
  return rows.map((c) => ({
    id: c.id,
    email: c.email,
    phone: c.phone,
    created_at: c.created_at,
    updated_at: c.updated_at,
    reason: deriveReason(c.email, c.phone, email, phone),
  }));
}

/**
 * Decide which contact a registration should link to, given a candidate list
 * from `findContactCandidates`.
 *
 * Rules:
 *   - 0 candidates -> null link, no review.
 *   - 1 distinct candidate -> use it, confidence high.
 *   - 2+ distinct candidates -> prefer the email-match (email is unique in
 *     `contacts`, so it is the most stable identity). Fall back to the most
 *     recent candidate (candidates are pre-sorted by created_at desc). Flag
 *     for admin review either way.
 */
export function resolveContactLink(candidates: ContactCandidate[]): LinkResolution {
  if (candidates.length === 0) {
    return {
      contactId: null,
      needsAdminReview: false,
      matchReason: null,
      confidence: null,
    };
  }

  const distinctIds = new Set(candidates.map((c) => c.id));
  const needsAdminReview = distinctIds.size > 1;

  const emailMatch = candidates.find(
    (c) => c.reason === "email" || c.reason === "both"
  );
  const winner = emailMatch ?? candidates[0];

  return {
    contactId: winner.id,
    needsAdminReview,
    matchReason: winner.reason,
    confidence: distinctIds.size === 1 ? "high" : "low",
  };
}

/**
 * Post-insert link step used by `POST /api/register`. Safe to call multiple
 * times on the same registration row. Returns the resolution that was applied,
 * or null on database error (the caller logs and continues — failing here
 * must not break the registration flow).
 */
export async function linkRegistrationToContact(input: {
  registrationId: string;
  email: string | null | undefined;
  phone: string | null | undefined;
}): Promise<LinkResolution | null> {
  const candidates = await findContactCandidates({
    email: input.email,
    phone: input.phone,
  });
  const resolution = resolveContactLink(candidates);

  const patch: Record<string, unknown> = {};
  if (resolution.contactId) {
    patch.contact_id = resolution.contactId;
  }
  if (resolution.needsAdminReview) {
    patch.needs_admin_review = true;
  }
  if (Object.keys(patch).length === 0) {
    return resolution;
  }

  const { error } = await supabaseAdmin
    .from("registrations")
    .update(patch)
    .eq("id", input.registrationId);

  if (error) {
    console.error("[link] registration update failed:", error.message);
    return null;
  }
  return resolution;
}
