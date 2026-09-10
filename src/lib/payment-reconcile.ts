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

/* ------------------------------------------------------------------ */
/* Planning: decide what a run may write BEFORE it writes anything      */
/* ------------------------------------------------------------------ */

/**
 * Narrows a run to named records. Analysis still looks at everything — the
 * operator should see the whole picture — but only what is in scope may be
 * written. An empty scope means "everything", which is why the script requires
 * an explicit `--all` for it.
 */
export type ReconcileScope = {
  sessionIds?: string[];
  registrationIds?: string[];
};

/**
 * The safety rails. Every one of these turns a surprise into a refusal instead
 * of a write: the point is that the operator states what they expect to happen,
 * and the run stops if reality disagrees.
 */
export type RepairGuards = {
  scope?: ReconcileScope;
  /** Refuse if the plan would write more rows than this. */
  maxWrites?: number;
  /** Refuse unless the plan writes exactly this many. */
  expectWrites?: number;
  /** Refuse unless every write is one of these kinds. */
  expectKinds?: DiscrepancyKind[];
};

export type RepairPlan = {
  /** Discrepancies this run would repair. */
  writes: Discrepancy[];
  /** In scope, but reported only — a human decides duplicates and refunds. */
  reportedOnly: Discrepancy[];
  /** Repairable, but outside the requested scope. */
  outOfScope: Discrepancy[];
  /** Non-empty means: do not apply. Each entry is a sentence for the operator. */
  refusals: string[];
};

function inScope(d: Discrepancy, scope: ReconcileScope | undefined): boolean {
  const sessions = scope?.sessionIds ?? [];
  const registrations = scope?.registrationIds ?? [];
  if (sessions.length === 0 && registrations.length === 0) return true;
  if (sessions.includes(d.sessionId)) return true;
  return d.registrationId !== null && registrations.includes(d.registrationId);
}

/**
 * Turn a report into an explicit plan. Pure: it decides, it never acts. The
 * script prints the plan and the refusals before anything is applied, so
 * "what would this do?" is answerable without running it.
 */
export function planRepairs(report: ReconcileReport, guards: RepairGuards = {}): RepairPlan {
  const writes: Discrepancy[] = [];
  const reportedOnly: Discrepancy[] = [];
  const outOfScope: Discrepancy[] = [];

  for (const d of report.discrepancies) {
    const scoped = inScope(d, guards.scope);
    if (d.proposal !== "finalize") {
      if (scoped) reportedOnly.push(d);
      continue;
    }
    if (scoped) writes.push(d);
    else outOfScope.push(d);
  }

  const refusals: string[] = [];
  if (guards.maxWrites !== undefined && writes.length > guards.maxWrites) {
    refusals.push(
      `This run would repair ${writes.length} records, more than the limit of ${guards.maxWrites}. Narrow it with --session/--registration, or raise --max-writes deliberately.`
    );
  }
  if (guards.expectWrites !== undefined && writes.length !== guards.expectWrites) {
    refusals.push(
      `Expected to repair exactly ${guards.expectWrites} record(s) but found ${writes.length}. Something has changed since you looked; re-run the dry run and read it before applying.`
    );
  }
  if (guards.expectKinds && guards.expectKinds.length > 0) {
    const unexpected = [...new Set(writes.map((w) => w.kind))].filter((k) => !guards.expectKinds!.includes(k));
    if (unexpected.length > 0) {
      refusals.push(
        `Expected only ${guards.expectKinds.join(", ")} but the plan also contains ${unexpected.join(", ")}. Refusing.`
      );
    }
  }

  return { writes, reportedOnly, outOfScope, refusals };
}

/**
 * Carry out a plan. Refuses outright if the plan carries any refusal, so an
 * unchecked caller cannot skip the guards. Safe to repeat: finalisation is
 * convergent.
 */
export async function applyPlan(
  plan: RepairPlan,
  finalize: (sessionId: string) => Promise<FinalizeOutcome>
): Promise<RepairResult[]> {
  if (plan.refusals.length > 0) {
    throw new Error(`Refusing to apply:\n  - ${plan.refusals.join("\n  - ")}`);
  }
  const results: RepairResult[] = [];
  for (const d of plan.writes) {
    results.push({ sessionId: d.sessionId, kind: d.kind, outcome: await finalize(d.sessionId) });
  }
  for (const d of plan.reportedOnly) {
    results.push({ sessionId: d.sessionId, kind: d.kind, outcome: { status: "skipped", reason: d.proposal } });
  }
  return results;
}

/**
 * Apply every `finalize` proposal in a report, unguarded. Retained for callers
 * that have already decided the scope; the script goes through `planRepairs` +
 * `applyPlan` instead so that a run has to say what it expects to touch.
 */
export async function applyRepairs(
  report: ReconcileReport,
  finalize: (sessionId: string) => Promise<FinalizeOutcome>
): Promise<RepairResult[]> {
  return applyPlan(planRepairs(report), finalize);
}
