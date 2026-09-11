/**
 * Offline money — cash, Zelle, anything Stripe never saw (Stage 2.3 item A).
 *
 * The shared vocabulary between the route, the admin UI and the tests. The
 * rules themselves live in the database (`record_manual_payment`,
 * `apply_manual_payment_status`), because they must hold for every caller; what
 * is here is the shape and the presentation.
 *
 * `payments` remains the Stripe ledger and nothing in this file touches it.
 */

export const MANUAL_PAYMENT_METHODS = ["cash", "zelle", "other"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

/**
 * A sanity ceiling, not a business limit: $100,000. It exists so a fat-fingered
 * "500000" (meant as $5,000.00 typed without the decimal point) is refused
 * rather than silently recorded and later believed.
 */
export const MAX_MANUAL_PAYMENT_CENTS = 10_000_000;

export function isManualPaymentMethod(v: unknown): v is ManualPaymentMethod {
  return typeof v === "string" && (MANUAL_PAYMENT_METHODS as readonly string[]).includes(v);
}

export type ManualPaymentRow = {
  id: string;
  amount_cents: number;
  currency: string;
  method: ManualPaymentMethod;
  /** The day the money changed hands, not the day it was typed in. */
  received_at: string;
  note: string | null;
  recorded_by: string;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

export type ManualPaymentsPayload = {
  receipts: ManualPaymentRow[];
  /** Live receipts only — voided ones stay listed but do not count. */
  totalCents: number;
};

const METHOD_LABELS: Record<ManualPaymentMethod, string> = {
  cash: "Cash",
  zelle: "Zelle",
  other: "Other",
};

export function manualPaymentMethodLabel(method: string): string {
  return isManualPaymentMethod(method) ? METHOD_LABELS[method] : method;
}

/** Cents to a plain dollar string. No currency symbol — the UI adds it. */
export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * What a receipt list adds up to, ignoring anything voided.
 *
 * Kept as a function rather than inlined so the route, the dialog and the tests
 * cannot drift into three slightly different answers — the habit that had the
 * same person reading "signed" and "pending" on one page.
 */
export function liveTotalCents(receipts: ManualPaymentRow[]): number {
  return receipts.filter((r) => !r.voided_at).reduce((sum, r) => sum + r.amount_cents, 0);
}
