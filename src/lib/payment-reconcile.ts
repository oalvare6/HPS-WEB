/**
 * Offline payment reconciliation (F-02, Phase 4) — the analysis half.
 *
 * Pure over a `ReconcileSource` so it runs identically against Stripe +
 * Supabase (scripts/reconcile-payments.ts) and against fixtures
 * (scripts/test-reconcile-payments.ts). Analysis never mutates; repairs go
 * through `finalizeCheckoutSession`, the same convergent path the webhook
 * uses, and only when the operator explicitly applies them.
 */
import type { CheckoutSessionFacts, FinalizeOutcome } from "@/lib/payment-finalize";

export type LocalPayment = {
  id: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  registration_id: string | null;
  drop_in_id: string | null;
  status: string;
  amount: number; // dollars, as stored
  currency: string;
};

export type LocalRegistration = {
  id: string;
  payment_status: string;
  cancelled_at: string | null;
  tournament_id: string | null;
};

export interface ReconcileSource {
  /** Checkout Sessions Stripe reports as complete AND paid, newest first. */
  listPaidSessions(): Promise<CheckoutSessionFacts[]>;
  loadPaymentsBySessionIds(sessionIds: string[]): Promise<LocalPayment[]>;
  loadRegistrations(ids: string[]): Promise<LocalRegistration[]>;
}

export type DiscrepancyKind =
  | "payment_missing_locally"
  | "registration_pending_with_payment"
  | "registration_paid_payment_inconsistent"
  | "duplicate_local_payment"
  | "payment_unlinked";

export type Discrepancy = {
  kind: DiscrepancyKind;
  sessionId: string;
  paymentId: string | null;
  registrationId: string | null;
  detail: string;
  /** What `--apply` would do. `finalize` = reprocess through finalizeCheckoutSession. */
  proposal: "finalize" | "flag_for_admin" | "none";
};

export type ReconcileReport = {
  sessionsChecked: number;
  consistent: number;
  discrepancies: Discrepancy[];
};

export async function analyzePayments(source: ReconcileSource): Promise<ReconcileReport> {
  const sessions = await source.listPaidSessions();
  const payments = await source.loadPaymentsBySessionIds(sessions.map((s) => s.sessionId));
  const bySession = new Map<string, LocalPayment[]>();
  for (const p of payments) {
    if (!p.stripe_session_id) continue;
    const list = bySession.get(p.stripe_session_id) ?? [];
    list.push(p);
    bySession.set(p.stripe_session_id, list);
  }

  const registrationIds = new Set<string>();
  for (const p of payments) if (p.registration_id) registrationIds.add(p.registration_id);
  for (const s of sessions) {
    const rid = s.metadata.registration_id;
    if (rid) registrationIds.add(rid);
  }
  const registrations = new Map(
    (await source.loadRegistrations([...registrationIds])).map((r) => [r.id, r] as const)
  );

  // Duplicate detection across the whole set: more than one succeeded payment
  // row pointing at the same registration.
  const succeededByRegistration = new Map<string, LocalPayment[]>();
  for (const p of payments) {
    if (p.status !== "succeeded" || !p.registration_id) continue;
    const list = succeededByRegistration.get(p.registration_id) ?? [];
    list.push(p);
    succeededByRegistration.set(p.registration_id, list);
  }

  const discrepancies: Discrepancy[] = [];
  let consistent = 0;

  for (const s of sessions) {
    const local = bySession.get(s.sessionId) ?? [];

    if (local.length === 0) {
      discrepancies.push({
        kind: "payment_missing_locally",
        sessionId: s.sessionId,
        paymentId: null,
        registrationId: s.metadata.registration_id || null,
        detail: `Stripe paid ${s.amountTotal ?? "?"} ${s.currency ?? "?"}; no local payments row`,
        proposal: "finalize",
      });
      continue;
    }

    const payment = local[0];
    const registration = payment.registration_id ? registrations.get(payment.registration_id) ?? null : null;
    const amountCents = Math.round(Number(payment.amount) * 100);

    if (payment.status !== "succeeded" || (s.amountTotal != null && amountCents !== s.amountTotal)) {
      discrepancies.push({
        kind: "registration_paid_payment_inconsistent",
        sessionId: s.sessionId,
        paymentId: payment.id,
        registrationId: payment.registration_id,
        detail: `local payment status=${payment.status} amount=${amountCents}c vs Stripe paid ${s.amountTotal ?? "?"}c`,
        proposal: "flag_for_admin",
      });
      continue;
    }

    if (!payment.registration_id && !payment.drop_in_id) {
      discrepancies.push({
        kind: "payment_unlinked",
        sessionId: s.sessionId,
        paymentId: payment.id,
        registrationId: null,
        detail: "payment row links to no registration or drop-in",
        proposal: s.metadata.registration_id ? "finalize" : "none",
      });
      continue;
    }

    if (registration && (registration.payment_status === "pending" || registration.payment_status === "partial")) {
      discrepancies.push({
        kind: "registration_pending_with_payment",
        sessionId: s.sessionId,
        paymentId: payment.id,
        registrationId: registration.id,
        detail: `succeeded payment ${payment.id} but registration is ${registration.payment_status}${registration.cancelled_at ? " (cancelled)" : ""}`,
        proposal: "finalize",
      });
      continue;
    }

    const dupes = payment.registration_id ? succeededByRegistration.get(payment.registration_id) ?? [] : [];
    if (dupes.length > 1 && dupes[0].id === payment.id) {
      discrepancies.push({
        kind: "duplicate_local_payment",
        sessionId: s.sessionId,
        paymentId: payment.id,
        registrationId: payment.registration_id,
        detail: `${dupes.length} succeeded payments for one registration (${dupes.map((d) => d.stripe_session_id).join(", ")}) — possible double charge`,
        proposal: "flag_for_admin",
      });
      continue;
    }

    consistent += 1;
  }

  return { sessionsChecked: sessions.length, consistent, discrepancies };
}

export type RepairResult = { sessionId: string; kind: DiscrepancyKind; outcome: FinalizeOutcome | { status: "skipped"; reason: string } };

/**
 * Apply the `finalize` proposals. Everything else is reported only — a human
 * decides refunds and duplicates. Safe to repeat: finalisation is convergent.
 */
export async function applyRepairs(
  report: ReconcileReport,
  finalize: (sessionId: string) => Promise<FinalizeOutcome>
): Promise<RepairResult[]> {
  const results: RepairResult[] = [];
  for (const d of report.discrepancies) {
    if (d.proposal !== "finalize") {
      results.push({ sessionId: d.sessionId, kind: d.kind, outcome: { status: "skipped", reason: d.proposal } });
      continue;
    }
    results.push({ sessionId: d.sessionId, kind: d.kind, outcome: await finalize(d.sessionId) });
  }
  return results;
}
