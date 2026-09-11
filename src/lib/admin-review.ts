/**
 * Stage 2.3 D — what a review flag means, and how the owner closes one.
 *
 * `registrations.needs_admin_review` is set by seven writers and, until this
 * module, cleared by none: three branches of `finalize_checkout_payment`, two
 * of `record_manual_payment`, the World Cup captain-paid acknowledgement and
 * the signup contact-linking step. Six of them append a fixed English sentence
 * to `registrations.notes`; the seventh (contact linking) appended nothing
 * until Stage 2.3 D. The owner saw a chip that said "Needs review" and a
 * dialog that admitted it did not know why.
 *
 * The model, deliberately built on the columns that already exist:
 *
 *   - The boolean is the one fact the filter reads: true means "a person has
 *     to look". It stays that way. Every existing writer keeps writing it.
 *   - `notes` is the ledger. The sentences the writers already append are the
 *     historical *why*; this module recognises each one by its exact wording
 *     (the SQL suites pin those literals, so they cannot drift silently) and
 *     says what the owner should do about it. Resolutions are appended as one
 *     more line, `Review resolved <ISO time> — <what the owner did>`, written by
 *     the route with a plain append rather than `append_note_line`, so its
 *     substring dedupe never swallows one. Nothing is ever removed from notes.
 *   - Safety is not read from notes at all. Whether a condition is *still*
 *     unsafe is recomputed from the rows themselves — card payments, live
 *     receipts, the People records that match — every time the flag is shown
 *     and again, server-side, when the owner tries to resolve it. A flag with
 *     no note (the ~24 legacy production rows, any writer that predates this)
 *     therefore still gets a truthful answer: here is what is wrong right now,
 *     or nothing is.
 *
 * What this buys and what it costs. It needs no migration and no second
 * writer of anything: the Stripe settlement path, the offline-receipt path
 * and the waiver computation are untouched. The cost is that when the same
 * SQL-written cause recurs after a resolution, `append_note_line` finds the
 * identical earlier sentence and appends nothing — the flag goes up again but
 * notes gain no new line. `reviewView` reports that honestly as "flagged
 * again" and leans on the live check to say why; the money rows carry their
 * own timestamps. The alternative — a review table with one row per
 * occurrence — is a better ledger and a worse trade for a one-owner site that
 * cannot repair production's migration ledger yet.
 */

export type ReviewCode =
  | "duplicate_contact"
  | "captain_paid_claim"
  | "stripe_unvalidated"
  | "stripe_paid_after_cancel"
  | "stripe_paid_on_waived_or_refunded"
  | "offline_double_payment"
  | "offline_after_cancel"
  | "unknown";

export type ReviewReason = {
  code: ReviewCode;
  /** One sentence in the owner's words. */
  text: string;
  /** What closes it, in the owner's words. */
  action: string;
  /** The raw line from notes, when `text` is a rewording of it. */
  detail?: string;
};

export type ReviewResolution = {
  /** ISO timestamp, as written into the line. */
  at: string;
  /** What the owner said they did. */
  text: string;
  /** Conditions that were still unsafe when the owner resolved anyway. */
  despite: string[];
};

export type ReviewView = {
  /** Mirrors `needs_admin_review`. */
  open: boolean;
  /**
   * Explanations written when the flag was raised, after the most recent
   * resolution. Empty on an open flag means either "flagged before reasons
   * were recorded" or "flagged again by a cause whose identical sentence was
   * not re-appended" — `flaggedAgain` tells the two apart.
   */
  reasons: ReviewReason[];
  /** What is unsafe right now, recomputed from the data, not from notes. */
  live: ReviewReason[];
  /** Every resolution so far, oldest first. */
  history: ReviewResolution[];
  /** Explanations that belong to earlier, already-resolved flags. */
  earlier: ReviewReason[];
  flaggedAgain: boolean;
};

/**
 * The facts a live check needs. Gathered by the server from `registrations`,
 * `payments`, `manual_payments` and `contacts`; never from notes.
 */
export type ReviewFacts = {
  paymentStatus: string;
  cancelledAt: string | null;
  /** A `payments` row with status 'succeeded' names this registration. */
  cardPaymentSucceeded: boolean;
  /** Sum of un-voided `manual_payments` for this registration. */
  offlineTotalCents: number;
  /**
   * Distinct `contacts` rows whose email or phone matches this registration —
   * `findContactCandidates`, the same rule that raised the flag at signup.
   */
  distinctContactMatches: number;
};

/* ------------------------------------------------------------------ */
/* The sentences the writers append, and what each one asks for        */
/* ------------------------------------------------------------------ */

/**
 * Written by `linkRegistrationToContact` (Stage 2.3 D) when more than one
 * person on file matches the new registration. Before this line existed the
 * flag was raised with no note at all.
 */
export const DUPLICATE_CONTACT_NOTE =
  "More than one person on file matches this email or phone — merge the duplicates in People, or resolve this review if they are different people.";

/** `src/app/api/register/captain-paid-ack/route.ts` — kept verbatim. */
export const CAPTAIN_PAID_NOTE =
  "World Cup: player confirmed captain already paid the $960 team fee. Admin: verify and mark paid.";

const STRIPE_AFTER_CANCEL_NOTE =
  "Stripe payment received AFTER this spot was cancelled — refund decision needed.";
const OFFLINE_DOUBLE_NOTE =
  "Offline payment recorded for a registration that also has a settled Stripe payment — check for a double payment.";
const OFFLINE_AFTER_CANCEL_NOTE =
  "Offline payment recorded AFTER this spot was cancelled — refund decision needed.";
const STRIPE_UNMATCHED_FALLBACK_NOTE =
  "Stripe payment could not be matched to this registration — review.";

const ACTIONS: Record<ReviewCode, string> = {
  duplicate_contact:
    "Merge the duplicate People records, or resolve this review if they really are different people.",
  captain_paid_claim:
    "Confirm with the captain that the team fee covered this player, then set the status to Paid.",
  stripe_unvalidated:
    "Check the payment in Stripe against this event's price. If it is right, set the status to Paid; if not, refund it in Stripe and set the status to Refunded.",
  stripe_paid_after_cancel:
    "Refund the card payment in Stripe, then set the status to Refunded.",
  stripe_paid_on_waived_or_refunded:
    "Decide whether to keep the money (set the status to Paid) or refund it in Stripe (leave it Refunded).",
  offline_double_payment:
    "Void the offline receipt, or refund one of the two payments and set the status to match.",
  offline_after_cancel:
    "Refund the offline payment and void the receipt, or set the status to Refunded.",
  unknown:
    "Check the payments and People records on this screen; if nothing is wrong, mark it reviewed.",
};

const STRIPE_SESSION_LINE = /^Stripe session (\S+): (.+)$/;
const STRIPE_GHOST_LINE =
  /^Stripe session named (registration|drop-in|contact|event) \S+, which no longer exists/;
const STRIPE_ON_STATUS_LINE =
  /^Stripe payment received for a registration marked (waived|refunded) — review\.$/;

const DOLLARS = (cents: string) => `$${(Number(cents) / 100).toFixed(2)}`;

/**
 * `payment-finalize.ts` writes `Stripe session cs_…: <reason code>: <detail>`.
 * The codes are for the log; the owner gets a sentence.
 */
function stripeReasonInWords(reason: string): string {
  let m = /^amount_mismatch: got (\d+), (?:authorised|expected) (\d+)$/.exec(reason);
  if (m) return `The card was charged ${DOLLARS(m[1])} but this event's price was ${DOLLARS(m[2])}.`;
  m = /^currency_mismatch/.exec(reason);
  if (m) return "The card was charged in a currency this site does not price in.";
  if (reason.startsWith("event_mismatch")) return "The card payment was for a different event.";
  if (reason.startsWith("authorization_mismatch"))
    return "The pay link that was used was created for a different registration or event.";
  if (reason.startsWith("no_local_record")) return "There is no local record of the checkout this payment came from.";
  if (reason === "amount_missing") return "Stripe did not report an amount for this payment.";
  if (
    reason.startsWith("event_not_found") ||
    reason.startsWith("pricing_failed") ||
    reason.startsWith("registration_has_no_event")
  )
    return "The event could not be priced when the payment arrived.";
  return `The payment could not be matched to this registration (${reason}).`;
}

/** Recognise one line of notes. Null for anything that is not a review line. */
export function reasonFromNoteLine(line: string): ReviewReason | null {
  const s = line.trim();
  if (!s) return null;
  if (s === DUPLICATE_CONTACT_NOTE) {
    return { code: "duplicate_contact", text: "More than one person on file matched this email or phone at signup.", action: ACTIONS.duplicate_contact, detail: s };
  }
  if (s === CAPTAIN_PAID_NOTE) {
    return { code: "captain_paid_claim", text: "The player said their captain had already paid the $960 team fee.", action: ACTIONS.captain_paid_claim, detail: s };
  }
  if (s === STRIPE_AFTER_CANCEL_NOTE) {
    return { code: "stripe_paid_after_cancel", text: "A card payment arrived after this spot was cancelled.", action: ACTIONS.stripe_paid_after_cancel, detail: s };
  }
  let m = STRIPE_ON_STATUS_LINE.exec(s);
  if (m) {
    return {
      code: "stripe_paid_on_waived_or_refunded",
      text: `A card payment arrived for a spot already marked ${m[1] === "waived" ? "Waived" : "Refunded"}.`,
      action: ACTIONS.stripe_paid_on_waived_or_refunded,
      detail: s,
    };
  }
  m = STRIPE_SESSION_LINE.exec(s);
  if (m) {
    return { code: "stripe_unvalidated", text: stripeReasonInWords(m[2]), action: ACTIONS.stripe_unvalidated, detail: s };
  }
  m = STRIPE_GHOST_LINE.exec(s);
  if (m) {
    const what = m[1] === "drop-in" ? "guest spot" : m[1];
    return {
      code: "stripe_unvalidated",
      text: `The card payment named a ${what} that no longer exists; the money was recorded without it.`,
      action: ACTIONS.stripe_unvalidated,
      detail: s,
    };
  }
  if (s === STRIPE_UNMATCHED_FALLBACK_NOTE) {
    return { code: "stripe_unvalidated", text: "A card payment could not be matched to this registration.", action: ACTIONS.stripe_unvalidated, detail: s };
  }
  if (s === OFFLINE_DOUBLE_NOTE) {
    return { code: "offline_double_payment", text: "An offline payment was recorded on top of a settled card payment.", action: ACTIONS.offline_double_payment, detail: s };
  }
  if (s === OFFLINE_AFTER_CANCEL_NOTE) {
    return { code: "offline_after_cancel", text: "An offline payment was recorded after this spot was cancelled.", action: ACTIONS.offline_after_cancel, detail: s };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Resolution lines                                                     */
/* ------------------------------------------------------------------ */

export const RESOLUTION_PREFIX = "Review resolved ";
const RESOLUTION_LINE =
  /^Review resolved (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)(?: despite: (.+?))? — (.*)$/;
const DESPITE_SEPARATOR = "; ";

export const RESOLUTION_MAX_LENGTH = 500;
export const DEFAULT_RESOLUTION_TEXT = "Reviewed; nothing further needed.";

/** The line the route appends. `despite` is what was still unsafe at the time. */
export function resolutionLine(now: Date, text: string, despite: ReviewReason[]): string {
  const body = (text.trim() || DEFAULT_RESOLUTION_TEXT).replace(/\s*\r?\n\s*/g, " ");
  const stamp = now.toISOString();
  const still = despite.map((d) => d.text.replace(/[;—]/g, ",")).join(DESPITE_SEPARATOR);
  return still
    ? `${RESOLUTION_PREFIX}${stamp} despite: ${still} — ${body}`
    : `${RESOLUTION_PREFIX}${stamp} — ${body}`;
}

export function resolutionFromNoteLine(line: string): ReviewResolution | null {
  const m = RESOLUTION_LINE.exec(line.trim());
  if (!m) return null;
  return { at: m[1], text: m[3], despite: m[2] ? m[2].split(DESPITE_SEPARATOR) : [] };
}

/* ------------------------------------------------------------------ */
/* Reading notes                                                        */
/* ------------------------------------------------------------------ */

export type ParsedReviewNotes = {
  /** Reason lines after the last resolution. */
  current: ReviewReason[];
  /** Reason lines before it. */
  earlier: ReviewReason[];
  history: ReviewResolution[];
};

/**
 * Notes are append-only, so line order is time order. Everything after the
 * last resolution line is the explanation for the flag as it stands; anything
 * before belongs to a flag that was already closed. Lines that are not review
 * lines — "Walk-in added from the roster screen.", price-drift notes, the
 * owner's own text — are ignored, not shown.
 */
export function parseReviewNotes(notes: string | null | undefined): ParsedReviewNotes {
  const current: ReviewReason[] = [];
  const earlier: ReviewReason[] = [];
  const history: ReviewResolution[] = [];
  for (const line of (notes ?? "").split(/\r?\n/)) {
    const resolution = resolutionFromNoteLine(line);
    if (resolution) {
      history.push(resolution);
      earlier.push(...current.splice(0));
      continue;
    }
    const reason = reasonFromNoteLine(line);
    if (reason) current.push(reason);
  }
  return { current, earlier, history };
}

/* ------------------------------------------------------------------ */
/* The live check                                                       */
/* ------------------------------------------------------------------ */

const STATUS_WORDS: Record<string, string> = {
  pending: "Pending",
  partial: "Partially paid",
  paid: "Paid",
  waived: "Waived",
  refunded: "Refunded",
};
const statusWord = (s: string) => STATUS_WORDS[s] ?? s;

/**
 * What is unsafe about this registration right now. Read from the rows, so it
 * is the same answer whether or not anybody wrote a note, and it goes away by
 * itself once the owner has done the thing — voided the receipt, merged the
 * duplicates, set the status — without anybody having to remember to clear a
 * flag. `captainClaimOpen` is the one input that does come from notes: the
 * claim is a statement, not a row, so the note is the only record of it.
 */
export function liveConditions(
  facts: ReviewFacts,
  options: { captainClaimOpen?: boolean } = {}
): ReviewReason[] {
  const out: ReviewReason[] = [];
  const status = facts.paymentStatus;
  const money = facts.cardPaymentSucceeded || facts.offlineTotalCents > 0;

  if (facts.cancelledAt && money && status !== "refunded") {
    if (facts.cardPaymentSucceeded) {
      out.push({
        code: "stripe_paid_after_cancel",
        text: `This spot is cancelled, a card payment is on record, and the status is ${statusWord(status)} rather than Refunded.`,
        action: ACTIONS.stripe_paid_after_cancel,
      });
    }
    if (facts.offlineTotalCents > 0) {
      out.push({
        code: "offline_after_cancel",
        text: `This spot is cancelled, an offline receipt is still live, and the status is ${statusWord(status)} rather than Refunded.`,
        action: ACTIONS.offline_after_cancel,
      });
    }
  }
  if (facts.cardPaymentSucceeded && status === "waived") {
    out.push({
      code: "stripe_paid_on_waived_or_refunded",
      text: "A card payment is on record but the status is Waived.",
      action: ACTIONS.stripe_paid_on_waived_or_refunded,
    });
  }
  if (facts.cardPaymentSucceeded && (status === "pending" || status === "partial")) {
    out.push({
      code: "stripe_unvalidated",
      text: `A card payment is on record but the status is still ${statusWord(status)}.`,
      action: ACTIONS.stripe_unvalidated,
    });
  }
  if (facts.cardPaymentSucceeded && facts.offlineTotalCents > 0 && status !== "refunded") {
    out.push({
      code: "offline_double_payment",
      text: "Both a card payment and a live offline receipt are on record.",
      action: ACTIONS.offline_double_payment,
    });
  }
  if (facts.distinctContactMatches > 1) {
    out.push({
      code: "duplicate_contact",
      text: `${facts.distinctContactMatches} People records still match this email or phone.`,
      action: ACTIONS.duplicate_contact,
    });
  }
  if (options.captainClaimOpen && !["paid", "waived", "refunded"].includes(status)) {
    out.push({
      code: "captain_paid_claim",
      text: `The captain-paid claim has not been confirmed: the status is still ${statusWord(status)}.`,
      action: ACTIONS.captain_paid_claim,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The view the admin renders                                           */
/* ------------------------------------------------------------------ */

export const LEGACY_REASON: ReviewReason = {
  code: "unknown",
  text: "Flagged before reasons were recorded.",
  action: ACTIONS.unknown,
};

export function reviewView(input: {
  needsReview: boolean;
  notes: string | null | undefined;
  facts: ReviewFacts;
}): ReviewView {
  const parsed = parseReviewNotes(input.notes);
  const captainClaimOpen = parsed.current.some((r) => r.code === "captain_paid_claim");
  const live = input.needsReview ? liveConditions(input.facts, { captainClaimOpen }) : [];
  return {
    open: input.needsReview,
    reasons: parsed.current,
    live,
    history: parsed.history,
    earlier: parsed.earlier,
    flaggedAgain: input.needsReview && parsed.current.length === 0 && parsed.history.length > 0,
  };
}

/** True when there is something to show — an open flag, or a past one. */
export function hasReviewContent(view: ReviewView): boolean {
  return view.open || view.history.length > 0 || view.earlier.length > 0;
}

/* ------------------------------------------------------------------ */
/* Resolving                                                            */
/* ------------------------------------------------------------------ */

export type ReviewRecord = {
  needsReview: boolean;
  notes: string | null;
  facts: ReviewFacts;
};

/**
 * The two database touches the resolve route needs, behind an interface so
 * the rule can be exercised without Postgres (scripts/test-admin-review.ts).
 */
export type ReviewStore = {
  load(registrationId: string): Promise<ReviewRecord | null>;
  /**
   * Clear the flag and append the line, but only if the row still has the
   * flag and the notes this decision was made against. Returns false when
   * nothing matched — something wrote to the row in between.
   */
  clear(registrationId: string, expect: { notes: string | null }, next: { notes: string }): Promise<boolean>;
};

export type ResolveInput = {
  registrationId: string;
  /** What the owner did. Optional unless `acknowledge` is set. */
  resolution: string;
  /** "I know it still looks wrong; I handled it outside the app." */
  acknowledge: boolean;
  now: Date;
};

export type ResolveResult =
  | { ok: true; view: ReviewView; line: string }
  | {
      ok: false;
      status: 400 | 404 | 409;
      code: "not_found" | "not_flagged" | "still_unsafe" | "note_required" | "too_long" | "changed";
      error: string;
      live?: ReviewReason[];
    };

/** Append without `append_note_line`'s dedupe: a resolution is never a repeat. */
export function appendNoteLine(existing: string | null, line: string): string {
  const base = (existing ?? "").trim();
  return base ? `${base}\n${line}` : line;
}

/**
 * Close a review. Refuses while anything is still unsafe unless the owner says
 * in so many words that they dealt with it, in which case the line records
 * both what was still wrong and what they said — the flag is cleared, the
 * evidence is not.
 */
export async function resolveReview(store: ReviewStore, input: ResolveInput): Promise<ResolveResult> {
  const resolution = input.resolution.trim();
  if (resolution.length > RESOLUTION_MAX_LENGTH) {
    return { ok: false, status: 400, code: "too_long", error: `Keep the note under ${RESOLUTION_MAX_LENGTH} characters.` };
  }

  const record = await store.load(input.registrationId);
  if (!record) return { ok: false, status: 404, code: "not_found", error: "That registration does not exist." };
  if (!record.needsReview) {
    return { ok: false, status: 409, code: "not_flagged", error: "This registration is not flagged for review." };
  }

  const before = reviewView({ needsReview: true, notes: record.notes, facts: record.facts });
  if (before.live.length > 0) {
    if (!input.acknowledge) {
      return {
        ok: false,
        status: 409,
        code: "still_unsafe",
        error: "Something still needs doing before this can be resolved.",
        live: before.live,
      };
    }
    if (!resolution) {
      return {
        ok: false,
        status: 400,
        code: "note_required",
        error: "Say what you did about it — that note is the only record.",
        live: before.live,
      };
    }
  }

  const line = resolutionLine(input.now, resolution, before.live);
  const next = appendNoteLine(record.notes, line);
  const cleared = await store.clear(input.registrationId, { notes: record.notes }, { notes: next });
  if (!cleared) {
    return {
      ok: false,
      status: 409,
      code: "changed",
      error: "This registration changed while you were looking at it. Reload and try again.",
    };
  }
  return { ok: true, view: reviewView({ needsReview: false, notes: next, facts: record.facts }), line };
}
