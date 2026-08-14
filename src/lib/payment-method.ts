/**
 * How a player said they intend to settle their entry fee.
 *
 * ## Why this exists
 *
 * Signing up and paying are two different days for most of this business.
 * Players join a roster weeks ahead and several hand over cash at the field on
 * the night. The database already modelled that — `payment_status` has had
 * `'pending'` from the start, and the Roster has always counted who owes what.
 *
 * What was missing was the player's half of the sentence. Every signup path
 * ended on a Stripe form, so the only visible exit was a card payment; anyone
 * not paying that day closed the tab with no idea whether they had a spot. The
 * operator's words: *"it only says pay eighty."*
 *
 * The fix is not a new state. `'pending'` already means "owes us money" and
 * still does. What this adds is **which pending** — a player who has said "cash
 * at the field" is a different thing to the operator than one who has said
 * nothing, because the first is somebody to collect from on the night and the
 * second is somebody to chase.
 *
 * ## Where it is stored
 *
 * `registrations.payment_method`, a column that has existed since the Phase 0
 * schema and was **NULL on all 105 rows** — declared in `types.ts`, written by
 * nothing, read by nothing. So this costs no migration and no new status value,
 * and every existing count on the Roster stays correct without being touched.
 *
 * NULL keeps meaning exactly what it meant before: they have not told us. That
 * is not the same as "card" and must not be rendered as a choice they made.
 */

/** What a player can declare. Stored verbatim in `registrations.payment_method`. */
export type PaymentMethodChoice = "card" | "cash";

export const PAYMENT_METHOD_CHOICES: PaymentMethodChoice[] = ["card", "cash"];

export function isPaymentMethodChoice(v: unknown): v is PaymentMethodChoice {
  return v === "card" || v === "cash";
}

/**
 * True when this player has said they are bringing cash.
 *
 * Deliberately tolerant of the stored string being anything at all: this column
 * predates the two values above and is free text in Postgres, so an unexpected
 * value must read as "no declared intent" rather than throwing on a page render.
 */
export function isPayingCash(method: string | null | undefined): boolean {
  return method === "cash";
}

/**
 * Statuses that mean this person does not owe us money.
 *
 * Kept here next to the payment-method logic because the two are always read
 * together — a cash intent is only worth showing while the fee is outstanding.
 * Mirrors the `SETTLED` set the roster API already applies to its rows.
 */
export function isSettledStatus(status: string | null | undefined): boolean {
  return status === "paid" || status === "waived";
}

/**
 * Whether to tell this player (or the operator) that cash is expected.
 *
 * Once the money is in, how they said they would pay is history — showing "cash
 * at the field" beside a paid player is how somebody gets asked for money twice.
 */
export function showsCashPending(
  method: string | null | undefined,
  status: string | null | undefined
): boolean {
  return isPayingCash(method) && !isSettledStatus(status);
}
