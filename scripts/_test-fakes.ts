/**
 * In-memory doubles for the F-01 / F-02 stores, used by the test scripts.
 *
 * They mirror the SEMANTICS of the database functions in
 * supabase/migrations/20260909120000_* and 20260909120100_* — single-winner
 * token consumption, upsert-on-session-id, convergent registration
 * confirmation, event idempotency, all-or-nothing on failure — so the
 * application logic can be exercised without Postgres. They are not a
 * substitute for running the SQL; see remediation_stage_1_2_report.md §8.
 */
import type {
  ConsumeResult,
  ResumableRegistration,
  ResumeLinkMessage,
  ResumeLinkSender,
  ResumeStore,
  StoredSession,
} from "../src/lib/resume-access";
import type {
  CheckoutAttemptRow,
  FinalizeArgs,
  FinalizeDropInRow,
  FinalizeRegistrationRow,
  FinalizeRpcResult,
  FinalizeStore,
} from "../src/lib/payment-finalize";
import type { PricedTournament } from "../src/lib/stripe-checkout";
import type { ResumeRegistrationOps, ResumeSummary } from "../src/lib/resume-routes";

/* ------------------------------------------------------------------ */
/* Resume store                                                          */
/* ------------------------------------------------------------------ */

type TokenRow = {
  id: string;
  registrationId: string;
  tokenHash: string;
  purpose: string;
  expiresAt: number;
  consumedAt: number | null;
  revokedAt: number | null;
};

type SessionRow = {
  id: string;
  registrationId: string;
  tokenHash: string;
  scopes: string[];
  expiresAt: number;
  revokedAt: number | null;
  lastUsedAt: number | null;
};

let counter = 0;
export function fakeId(prefix = "id"): string {
  counter += 1;
  // Deterministic, UUID-shaped so the routes' UUID checks pass.
  const hex = counter.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`.replace(/^00000000/, prefix.length === 8 ? prefix : "00000000");
}

export class InMemoryResumeStore implements ResumeStore {
  tokens = new Map<string, TokenRow>();
  sessions = new Map<string, SessionRow>();
  requests: { emailDigest: string; ipDigest: string | null; at: number }[] = [];
  registrations = new Map<string, ResumableRegistration>();
  now: () => number = () => Date.now();
  /** When set, the next store call throws (infrastructure failure). */
  failNext: string | null = null;
  throttle = { emailCooldownSeconds: 60, emailHourlyMax: 6, ipHourlyMax: 12 };

  private maybeFail(op: string) {
    if (this.failNext === op || this.failNext === "*") {
      this.failNext = null;
      throw new Error(`simulated ${op} failure`);
    }
  }

  async recordLinkRequest(input: { emailDigest: string; ipDigest: string | null }) {
    this.maybeFail("recordLinkRequest");
    const now = this.now();
    const hourAgo = now - 3600_000;
    const forEmail = this.requests.filter((r) => r.emailDigest === input.emailDigest);
    const last = forEmail.length ? Math.max(...forEmail.map((r) => r.at)) : null;
    if (last !== null && last > now - this.throttle.emailCooldownSeconds * 1000) {
      return { allowed: false, reason: "email_cooldown" };
    }
    if (forEmail.filter((r) => r.at > hourAgo).length >= this.throttle.emailHourlyMax) {
      return { allowed: false, reason: "email_hourly" };
    }
    if (
      input.ipDigest &&
      this.requests.filter((r) => r.ipDigest === input.ipDigest && r.at > hourAgo).length >=
        this.throttle.ipHourlyMax
    ) {
      return { allowed: false, reason: "ip_hourly" };
    }
    this.requests.push({ ...input, at: now });
    return { allowed: true };
  }

  async findResumableRegistration(input: { email: string; tournamentId: string }) {
    this.maybeFail("findResumableRegistration");
    for (const r of this.registrations.values()) {
      if (r.email === input.email && r.tournament && (r as ResumableRegistration & { tournamentId?: string }).tournamentId === input.tournamentId) {
        return r;
      }
    }
    return null;
  }

  async createAccessToken(input: {
    registrationId: string;
    tokenHash: string;
    purpose: "resume";
    expiresAt: string;
    requesterIpDigest: string | null;
  }) {
    this.maybeFail("createAccessToken");
    if (this.tokens.has(input.tokenHash)) throw new Error("duplicate token hash");
    this.tokens.set(input.tokenHash, {
      id: fakeId(),
      registrationId: input.registrationId,
      tokenHash: input.tokenHash,
      purpose: input.purpose,
      expiresAt: Date.parse(input.expiresAt),
      consumedAt: null,
      revokedAt: null,
    });
  }

  /** Single-winner semantics: synchronous check-and-set, exactly like the SQL UPDATE. */
  async consumeAccessToken(input: {
    tokenHash: string;
    purpose: "resume";
    sessionTokenHash: string;
    scopes: readonly string[];
    sessionTtlSeconds: number;
  }): Promise<ConsumeResult> {
    this.maybeFail("consumeAccessToken");
    const now = this.now();
    const row = this.tokens.get(input.tokenHash);
    if (
      !row ||
      row.purpose !== input.purpose ||
      row.consumedAt !== null ||
      row.revokedAt !== null ||
      row.expiresAt <= now
    ) {
      return { ok: false, reason: "invalid" };
    }
    row.consumedAt = now;
    const session: SessionRow = {
      id: fakeId(),
      registrationId: row.registrationId,
      tokenHash: input.sessionTokenHash,
      scopes: [...input.scopes],
      expiresAt: now + input.sessionTtlSeconds * 1000,
      revokedAt: null,
      lastUsedAt: null,
    };
    this.sessions.set(session.tokenHash, session);
    return {
      ok: true,
      sessionId: session.id,
      registrationId: session.registrationId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  async findSession(tokenHash: string): Promise<StoredSession | null> {
    this.maybeFail("findSession");
    const row = this.sessions.get(tokenHash);
    if (!row) return null;
    return {
      id: row.id,
      registrationId: row.registrationId,
      scopes: row.scopes,
      expiresAt: new Date(row.expiresAt).toISOString(),
      revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
    };
  }

  async touchSession(sessionId: string) {
    for (const s of this.sessions.values()) if (s.id === sessionId) s.lastUsedAt = this.now();
  }

  async revokeSession(sessionId: string) {
    for (const s of this.sessions.values()) if (s.id === sessionId && !s.revokedAt) s.revokedAt = this.now();
  }

  /* test helpers */
  revokeToken(tokenHash: string) {
    const row = this.tokens.get(tokenHash);
    if (row) row.revokedAt = this.now();
  }
  sessionFor(rawSecretHash: string) {
    return this.sessions.get(rawSecretHash) ?? null;
  }
}

export class CapturingSender implements ResumeLinkSender {
  sent: ResumeLinkMessage[] = [];
  deliver = true;
  async send(message: ResumeLinkMessage) {
    if (!this.deliver) return { delivered: false, error: "simulated" };
    this.sent.push(message);
    return { delivered: true };
  }
  lastToken(): string | null {
    const last = this.sent[this.sent.length - 1];
    if (!last) return null;
    const url = new URL(last.link);
    return url.searchParams.get("t");
  }
}

/* ------------------------------------------------------------------ */
/* Resume ops (what a session may do)                                    */
/* ------------------------------------------------------------------ */

export type FakeRegistration = {
  id: string;
  paymentStatus: string;
  cancelledAt: string | null;
  waiverSigned: boolean;
  /** Spies: a resume session must never be able to flip these. */
  cashMarkedPaid: boolean;
  waiverCompletedDirectly: boolean;
};

export class RecordingOps implements ResumeRegistrationOps {
  registrations = new Map<string, FakeRegistration>();
  calls: { op: string; registrationId: string }[] = [];

  add(id: string, patch: Partial<FakeRegistration> = {}) {
    this.registrations.set(id, {
      id,
      paymentStatus: "pending",
      cancelledAt: null,
      waiverSigned: true,
      cashMarkedPaid: false,
      waiverCompletedDirectly: false,
      ...patch,
    });
  }

  async loadSummary(registrationId: string): Promise<ResumeSummary | null> {
    this.calls.push({ op: "loadSummary", registrationId });
    const r = this.registrations.get(registrationId);
    if (!r) return null;
    return {
      eventTitle: "Community Cup - Fall 2026",
      eventSlug: "community-cup-fall-2026",
      paymentStatus: r.paymentStatus,
      paymentMethod: null,
      waiverSigned: r.waiverSigned,
      teamName: null,
      entryFeeCents: 8000,
      cancelledAt: r.cancelledAt,
    };
  }

  async startCheckout(registrationId: string) {
    this.calls.push({ op: "startCheckout", registrationId });
    const r = this.registrations.get(registrationId);
    if (!r) return { ok: false as const, status: 404, error: "not found" };
    if (r.cancelledAt) return { ok: false as const, status: 409, error: "cancelled" };
    if (r.paymentStatus === "paid") return { ok: false as const, status: 400, error: "paid" };
    return { ok: true as const, url: `https://checkout.stripe.test/${registrationId}` };
  }

  async cancel(registrationId: string) {
    this.calls.push({ op: "cancel", registrationId });
    const r = this.registrations.get(registrationId);
    if (!r) return { status: 404, body: { error: "not found" } };
    if (r.cancelledAt) return { status: 200, body: { ok: true, alreadyCancelled: true } };
    r.cancelledAt = new Date().toISOString();
    return { status: 200, body: { ok: true, alreadyCancelled: false } };
  }

  async startWaiver(registrationId: string) {
    this.calls.push({ op: "startWaiver", registrationId });
    const r = this.registrations.get(registrationId);
    if (!r) return { ok: false as const, status: 404, error: "not found" };
    if (r.waiverSigned) return { ok: false as const, status: 409, error: "signed" };
    // Starting the provider flow does NOT complete it.
    return { ok: true as const, url: `https://docuseal.test/s/${registrationId}`, mode: "docuseal" as const };
  }
}

/* ------------------------------------------------------------------ */
/* Finalize store (mirrors finalize_checkout_payment)                    */
/* ------------------------------------------------------------------ */

export type FakePayment = {
  id: string;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  registration_id: string | null;
  drop_in_id: string | null;
  tournament_id: string | null;
  contact_id: string | null;
  email: string;
  amount: number;
  currency: string;
  status: string;
  notes: string | null;
};

export type FakeFinalizeRegistration = FinalizeRegistrationRow & {
  needs_admin_review: boolean;
  notes: string | null;
  team_name: string | null;
};

function appendNote(existing: string | null, line: string | null): string | null {
  if (!line || !line.trim()) return existing;
  if (existing && existing.includes(line)) return existing;
  if (!existing || !existing.trim()) return line;
  return `${existing.trim()}\n${line}`;
}

export class InMemoryFinalizeStore implements FinalizeStore {
  registrations = new Map<string, FakeFinalizeRegistration>();
  tournaments = new Map<string, PricedTournament>();
  dropIns = new Map<string, FinalizeDropInRow>();
  payments = new Map<string, FakePayment>(); // by session id
  /** What checkout authorised, by session id (Stage 1.4.1). */
  checkoutAttempts = new Map<string, CheckoutAttemptRow>();
  events = new Map<string, { type: string; processed: boolean; outcome: string | null; detail: string | null }>();
  contacts = new Map<string, string>(); // email -> id
  finalizeCalls = 0;
  /** Throw on the next finalize() BEFORE writing anything (transaction rollback). */
  failNextFinalize = false;
  failNextRecordEvent = false;

  async loadRegistration(id: string) {
    return this.registrations.get(id) ?? null;
  }
  async findRegistrationByEmail(email: string, tournamentId: string) {
    for (const r of this.registrations.values()) {
      if (r.email === email && r.tournament_id === tournamentId && !r.cancelled_at) return r;
    }
    return null;
  }
  async loadTournament(id: string) {
    return this.tournaments.get(id) ?? null;
  }
  async loadDropIn(id: string) {
    return this.dropIns.get(id) ?? null;
  }
  async loadCheckoutAttempt(sessionId: string) {
    return this.checkoutAttempts.get(sessionId) ?? null;
  }
  async ensureContactByEmail(email: string) {
    let id = this.contacts.get(email);
    if (!id) {
      id = fakeId();
      this.contacts.set(email, id);
    }
    return id;
  }

  async finalize(args: FinalizeArgs): Promise<FinalizeRpcResult> {
    this.finalizeCalls += 1;
    if (this.failNextFinalize) {
      this.failNextFinalize = false;
      throw new Error("simulated database failure");
    }
    if (args.event_id) {
      const prev = this.events.get(args.event_id);
      if (prev?.processed) {
        return { outcome: "duplicate_event", previous_outcome: prev.outcome, payment_inserted: false, registration_updated: false, drop_in_updated: false };
      }
      this.events.set(args.event_id, { type: args.event_type, processed: false, outcome: null, detail: null });
    }

    let payment = this.payments.get(args.session_id);
    let inserted = false;
    if (!payment) {
      payment = {
        id: fakeId(),
        stripe_session_id: args.session_id,
        stripe_payment_intent_id: args.payment_intent_id,
        registration_id: args.registration_id,
        drop_in_id: args.drop_in_id,
        tournament_id: args.tournament_id,
        contact_id: args.contact_id,
        email: args.email,
        amount: args.amount_cents / 100,
        currency: args.currency,
        status: "succeeded",
        notes: args.review_note,
      };
      // Business uniqueness on payment intent as well (partial unique index).
      for (const p of this.payments.values()) {
        if (args.payment_intent_id && p.stripe_payment_intent_id === args.payment_intent_id) {
          throw new Error("duplicate key value violates unique constraint payments_stripe_payment_intent_unique_idx");
        }
      }
      this.payments.set(args.session_id, payment);
      inserted = true;
    } else {
      payment.registration_id = payment.registration_id ?? args.registration_id;
      payment.drop_in_id = payment.drop_in_id ?? args.drop_in_id;
      payment.tournament_id = payment.tournament_id ?? args.tournament_id;
      payment.contact_id = payment.contact_id ?? args.contact_id;
      payment.stripe_payment_intent_id = payment.stripe_payment_intent_id ?? args.payment_intent_id;
      if (payment.status === "pending") payment.status = "succeeded";
      payment.notes = appendNote(payment.notes, args.review_note);
    }

    let registrationUpdated = false;
    let registrationStatus: string | null = null;
    if (args.registration_id) {
      const reg = this.registrations.get(args.registration_id);
      if (reg) {
        registrationStatus = reg.payment_status;
        if (args.confirm) {
          if (reg.payment_status === "pending" || reg.payment_status === "partial") {
            reg.payment_status = "paid";
            reg.team_name = args.team_name ?? reg.team_name;
            reg.notes = appendNote(reg.notes, args.notes_line);
            if (reg.cancelled_at) {
              reg.notes = appendNote(reg.notes, "Stripe payment received AFTER this spot was cancelled — refund decision needed.");
              reg.needs_admin_review = true;
            }
            registrationUpdated = true;
            registrationStatus = "paid";
          } else if (reg.payment_status === "paid") {
            // idempotent
          } else {
            reg.needs_admin_review = true;
            reg.notes = appendNote(reg.notes, `Stripe payment received for a registration marked ${reg.payment_status} — review.`);
          }
        } else {
          reg.needs_admin_review = true;
          reg.notes = appendNote(reg.notes, args.review_note ?? "Stripe payment could not be matched to this registration — review.");
        }
      }
    }

    let dropInUpdated = false;
    if (args.drop_in_id && args.confirm) {
      const d = this.dropIns.get(args.drop_in_id);
      if (d && d.payment_status === "pending") {
        d.payment_status = "paid";
        dropInUpdated = true;
      }
    }

    const outcome = args.confirm ? "finalized" : "recorded_needs_review";
    if (args.event_id) {
      this.events.set(args.event_id, { type: args.event_type, processed: true, outcome, detail: args.review_note });
    }
    return {
      outcome,
      payment_id: payment.id,
      payment_inserted: inserted,
      registration_updated: registrationUpdated,
      registration_status: registrationStatus,
      drop_in_updated: dropInUpdated,
    };
  }

  async recordEvent(input: { eventId: string; type: string; objectId: string | null; outcome: string; detail: string | null }) {
    if (this.failNextRecordEvent) {
      this.failNextRecordEvent = false;
      throw new Error("simulated database failure");
    }
    const prev = this.events.get(input.eventId);
    if (!prev) this.events.set(input.eventId, { type: input.type, processed: true, outcome: input.outcome, detail: input.detail });
  }

  snapshot(): string {
    return JSON.stringify({
      registrations: [...this.registrations.values()],
      payments: [...this.payments.values()],
      dropIns: [...this.dropIns.values()],
      events: [...this.events.entries()],
    });
  }
}

/* ------------------------------------------------------------------ */
/* Tiny assertion harness matching the repo's script style               */
/* ------------------------------------------------------------------ */

export class Harness {
  passed = 0;
  failed = 0;
  check(name: string, ok: boolean, detail?: string) {
    if (ok) this.passed += 1;
    else this.failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `\n        ${detail}` : ""}`);
  }
  eq<T>(name: string, got: T, want: T) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    this.check(name, ok, ok ? undefined : `got ${JSON.stringify(got)} expected ${JSON.stringify(want)}`);
  }
  done(): never {
    const total = this.passed + this.failed;
    console.log(`\n${this.passed}/${total} passed`);
    process.exit(this.failed === 0 ? 0 : 1);
  }
}
