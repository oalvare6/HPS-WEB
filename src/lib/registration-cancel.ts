/**
 * Whether a player may take themselves off a roster without asking anybody.
 *
 * ## Why this exists
 *
 * Until now they could not, at all. Every `DELETE` under `src/app/api/` is
 * admin-only, `/me` is a read-only table, and neither status card offered a way
 * out. So a player who signed up in June for a night in August had one option:
 * message the owner, who then had to find them in the admin. The operator's
 * words: *"let me get out if i havent made payment."*
 *
 * ## The rule, and why it is this one
 *
 * Cancel is allowed **unless card money actually moved.** Unpaid, "I'll pay cash
 * at the field", and admin-marked-paid-because-they-handed-over-cash all cancel
 * themselves. A succeeded Stripe charge does not, because giving up the spot
 * then owes the player a refund and that is a decision with money in it — it
 * goes to the owner, who can still remove them from the admin.
 *
 * ## The discriminator is `payments`, not `payment_status`
 *
 * This is the load-bearing detail. `payment_status = 'paid'` is set by *two*
 * different things: the Stripe webhook, and the owner tapping the paid toggle on
 * the Roster after someone hands over a twenty. Reading it would refuse a cancel
 * to exactly the cash players the operator wants to let out. A row in `payments`
 * with `status = 'succeeded'` only ever comes from Stripe, so that is what is
 * asked.
 *
 * ## Fail closed
 *
 * `cardPayment` is a tri-state rather than a boolean on purpose. If the payments
 * lookup errors we do not know whether money moved, and the safe answer is to
 * refuse — a wrongly-refused cancel is a message to the owner, while a wrongly-
 * allowed one is a player who has paid, believes they are out, and is not.
 * Making that a value the module can see is what lets it be tested; a boolean
 * would have pushed the decision into the route where nothing checks it.
 *
 * Pure, so the table can be exercised without a database — see
 * scripts/test-cancel-eligibility.ts.
 */

/** What the caller learned when it looked for a completed card payment. */
export type CardPaymentLookup =
  /** Looked, found nothing. */
  | "none"
  /** Looked, found a succeeded Stripe payment. */
  | "found"
  /** The lookup itself failed. We do not know. */
  | "failed";

export type CancelBlockReason =
  /** Already given up. Not a failure — the caller reports success. */
  | "already_cancelled"
  /** Stripe took money for this spot. Needs a refund decision. */
  | "card_payment_taken"
  /** We could not find out whether money moved. */
  | "payment_lookup_failed";

export type CancelEligibility =
  | { allowed: true }
  | { allowed: false; reason: CancelBlockReason };

export type CancelEligibilityInput = {
  /** `registrations.cancelled_at`. Non-null means they are already out. */
  cancelledAt: string | null;
  cardPayment: CardPaymentLookup;
};

export function resolveCancelEligibility(
  input: CancelEligibilityInput
): CancelEligibility {
  // Checked first so a repeated tap — or a double-submit from a phone at the
  // field — reports the state it already reached rather than a payment error.
  if (input.cancelledAt) {
    return { allowed: false, reason: "already_cancelled" };
  }

  if (input.cardPayment === "failed") {
    return { allowed: false, reason: "payment_lookup_failed" };
  }

  if (input.cardPayment === "found") {
    return { allowed: false, reason: "card_payment_taken" };
  }

  return { allowed: true };
}

/**
 * What to tell the player, and with what HTTP status.
 *
 * Kept beside the rule so the wording cannot drift from the reason, and so the
 * route has no copy of its own to get out of step.
 */
export function cancelBlockResponse(reason: CancelBlockReason): {
  status: number;
  message: string;
} {
  switch (reason) {
    case "already_cancelled":
      // Not an error. The caller returns 200 with this as reassurance.
      return { status: 200, message: "You're already off this list." };
    case "card_payment_taken":
      return {
        status: 409,
        message:
          "You've already paid for this by card, so we can't cancel it here — " +
          "that needs a refund. Message us on WhatsApp and we'll sort it out.",
      };
    case "payment_lookup_failed":
      return {
        status: 503,
        message:
          "We couldn't check your payment just now, so we've left your spot alone. " +
          "Try again in a minute.",
      };
  }
}
