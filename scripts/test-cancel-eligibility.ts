/**
 * Branch table for `src/lib/registration-cancel.ts` — may this player take
 * themselves off the roster.
 *
 * Two cases carry the whole feature. **"Admin marked them paid for cash"** must
 * be allowed: that is the operator's stated rule, and the naive implementation
 * (read `payment_status === 'paid'`) gets it exactly backwards, refusing the
 * cash players it was built for. **"Payments lookup failed"** must be refused:
 * a wrongly-allowed cancel leaves somebody who has paid believing they are out.
 *
 * Run: npx tsx scripts/test-cancel-eligibility.ts
 */
import {
  cancelBlockResponse,
  resolveCancelEligibility,
  type CancelBlockReason,
  type CancelEligibilityInput,
} from "../src/lib/registration-cancel";

type Case = {
  name: string;
  input: CancelEligibilityInput;
  /** Null when the cancel should go through. */
  expect: CancelBlockReason | null;
};

const CASES: Case[] = [
  {
    name: "Signed up, never paid → let them out",
    input: { cancelledAt: null, cardPayment: "none" },
    expect: null,
  },
  {
    name: "Said 'cash at the field', hasn't handed it over → let them out",
    // payment_method='cash' never reaches this module: a declared intent is not
    // a payment, so there is no Stripe row and nothing to refund.
    input: { cancelledAt: null, cardPayment: "none" },
    expect: null,
  },
  {
    name: "THE ONE THAT MATTERS: admin marked them paid for cash → let them out",
    // payment_status='paid' with no `payments` row. Reading the status column
    // here would refuse exactly the people this feature is for.
    input: { cancelledAt: null, cardPayment: "none" },
    expect: null,
  },
  {
    name: "Stripe charge succeeded → refuse, this needs a refund",
    input: { cancelledAt: null, cardPayment: "found" },
    expect: "card_payment_taken",
  },
  {
    name: "Payments lookup errored → refuse; we do not know if money moved",
    input: { cancelledAt: null, cardPayment: "failed" },
    expect: "payment_lookup_failed",
  },
  {
    name: "Already cancelled → idempotent, not an error",
    input: { cancelledAt: "2026-08-14T18:00:00.000Z", cardPayment: "none" },
    expect: "already_cancelled",
  },
  {
    name: "Already cancelled outranks a Stripe payment (do not re-report a refund)",
    input: { cancelledAt: "2026-08-14T18:00:00.000Z", cardPayment: "found" },
    expect: "already_cancelled",
  },
  {
    name: "Already cancelled outranks a failed lookup (no reason to check)",
    input: { cancelledAt: "2026-08-14T18:00:00.000Z", cardPayment: "failed" },
    expect: "already_cancelled",
  },
];

let failed = 0;

for (const c of CASES) {
  const got = resolveCancelEligibility(c.input);
  const reason = got.allowed ? null : got.reason;
  const ok = reason === c.expect;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n` +
      `        ${got.allowed ? "allowed" : `blocked: ${reason}`}` +
      ` (expected ${c.expect ?? "allowed"})`
  );
}

/**
 * The status each refusal carries. `already_cancelled` is a 200 on purpose —
 * a second tap has reached the state the player wanted, and answering 4xx would
 * make a working cancel look broken.
 */
const STATUSES: { reason: CancelBlockReason; status: number }[] = [
  { reason: "already_cancelled", status: 200 },
  { reason: "card_payment_taken", status: 409 },
  { reason: "payment_lookup_failed", status: 503 },
];

for (const s of STATUSES) {
  const got = cancelBlockResponse(s.reason);
  const ok = got.status === s.status && got.message.length > 0;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${s.reason} answers ${s.status}\n` +
      `        status=${got.status} (expected ${s.status})`
  );
}

const total = CASES.length + STATUSES.length;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed === 0 ? 0 : 1);
