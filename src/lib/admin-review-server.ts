import { supabaseAdmin } from "@/lib/supabase-admin";
import { findContactCandidates } from "@/lib/registration-contact-linking";
import {
  reviewView,
  type ReviewFacts,
  type ReviewRecord,
  type ReviewStore,
  type ReviewView,
} from "@/lib/admin-review";

/**
 * The server half of Stage 2.3 D: gather the facts `liveConditions` reads,
 * from the rows that hold them. Used by the roster GET (for every flagged row
 * on the list, in three batched queries) and by the resolve route (for one).
 * Nothing here reads notes for safety; see admin-review.ts.
 */

export type ReviewSubject = {
  id: string;
  email: string | null;
  phone: string | null;
  payment_status: string;
  cancelled_at: string | null;
};

const EMPTY_FACTS = (s: ReviewSubject): ReviewFacts => ({
  paymentStatus: s.payment_status,
  cancelledAt: s.cancelled_at,
  cardPaymentSucceeded: false,
  offlineTotalCents: 0,
  distinctContactMatches: 0,
});

/**
 * Facts for several registrations at once. The card and receipt questions are
 * one `in (...)` query each; the People question runs the same candidate
 * search that raised the flag, once per subject — there are only ever a
 * handful of flagged rows on a roster.
 */
export async function reviewFactsFor(subjects: ReviewSubject[]): Promise<Map<string, ReviewFacts>> {
  const out = new Map<string, ReviewFacts>();
  if (subjects.length === 0) return out;
  const ids = subjects.map((s) => s.id);

  const [cardRes, offlineRes] = await Promise.all([
    supabaseAdmin
      .from("payments")
      .select("registration_id")
      .in("registration_id", ids)
      .eq("status", "succeeded"),
    supabaseAdmin
      .from("manual_payments")
      .select("registration_id, amount_cents")
      .in("registration_id", ids)
      .is("voided_at", null),
  ]);
  if (cardRes.error) throw new Error(`payments lookup failed: ${cardRes.error.message}`);
  if (offlineRes.error) throw new Error(`manual_payments lookup failed: ${offlineRes.error.message}`);

  const card = new Set<string>();
  for (const p of (cardRes.data ?? []) as { registration_id: string | null }[]) {
    if (p.registration_id) card.add(p.registration_id);
  }
  const offline = new Map<string, number>();
  for (const m of (offlineRes.data ?? []) as { registration_id: string; amount_cents: number }[]) {
    offline.set(m.registration_id, (offline.get(m.registration_id) ?? 0) + (m.amount_cents ?? 0));
  }

  const matches = await Promise.all(
    subjects.map(async (s) => {
      const candidates = await findContactCandidates({ email: s.email, phone: s.phone });
      return new Set(candidates.map((c) => c.id)).size;
    })
  );

  subjects.forEach((s, i) => {
    out.set(s.id, {
      ...EMPTY_FACTS(s),
      cardPaymentSucceeded: card.has(s.id),
      offlineTotalCents: offline.get(s.id) ?? 0,
      distinctContactMatches: matches[i],
    });
  });
  return out;
}

/**
 * The view for one row of a list. Only flagged rows pay for the live check;
 * an unflagged row's view is just its history, if it has any.
 */
export function reviewViewFor(
  row: { id: string; needs_admin_review: boolean | null; notes: string | null } & ReviewSubject,
  facts: Map<string, ReviewFacts>
): ReviewView {
  return reviewView({
    needsReview: row.needs_admin_review === true,
    notes: row.notes,
    facts: facts.get(row.id) ?? EMPTY_FACTS(row),
  });
}

/** `ReviewStore` over Supabase, for the resolve route. */
export const supabaseReviewStore: ReviewStore = {
  async load(registrationId: string): Promise<ReviewRecord | null> {
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .select("id, email, phone, payment_status, cancelled_at, notes, needs_admin_review")
      .eq("id", registrationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const subject = data as ReviewSubject & { notes: string | null; needs_admin_review: boolean | null };
    const facts = await reviewFactsFor([subject]);
    return {
      needsReview: subject.needs_admin_review === true,
      notes: subject.notes,
      facts: facts.get(subject.id) ?? EMPTY_FACTS(subject),
    };
  },

  async clear(registrationId, expect, next): Promise<boolean> {
    // Compare-and-swap on the two columns this decision was made against: if
    // a writer raised the flag again or appended a note in between, nothing
    // matches, nothing is cleared, and the owner is told to look again.
    let query = supabaseAdmin
      .from("registrations")
      .update({ needs_admin_review: false, notes: next.notes })
      .eq("id", registrationId)
      .eq("needs_admin_review", true);
    query = expect.notes === null ? query.is("notes", null) : query.eq("notes", expect.notes);
    const { data, error } = await query.select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length === 1;
  },
};
