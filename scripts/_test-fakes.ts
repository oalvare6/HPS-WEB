/**
 * In-memory doubles for the F-01 / F-02 / Stage 1.3 stores, used by the test
 * scripts.
 *
 * They mirror the SEMANTICS of the database functions in
 * supabase/migrations/20260909120000_*, 20260909120100_* and 20260909130000_*
 * — single-winner token consumption, upsert-on-session-id, convergent
 * registration confirmation, event idempotency, atomic webhook claims,
 * all-or-nothing on failure — so the application logic can be exercised
 * without Postgres. They are not a substitute for running the SQL; see the
 * remediation reports.
 */
import type {
  ConsumeResult,
  CreateSessionResult,
  ResumableRegistration,
  ResumeLinkMessage,
  ResumeLinkSender,
  ResumeStore,
  StoredSession,
} from "../src/lib/resume-access";
import type {
  FinalizeArgs,
  FinalizeDropInRow,
  FinalizeRegistrationRow,
  FinalizeRpcResult,
  FinalizeStore,
} from "../src/lib/payment-finalize";
import type { PricedTournament } from "../src/lib/stripe-checkout";
import type { ResumeRegistrationOps, ResumeSummary } from "../src/lib/resume-routes";
import type { InAppSignatureRequest, WaiverSigningContext } from "../src/lib/waiver-sign-server";
import type { PaymentMethodChoice } from "../src/lib/payment-method";
import type {
  ClaimEventResult,
  DocusealWebhookStore,
  WebhookRegistrationRow,
} from "../src/lib/docuseal-webhook";
import type { RecordSignedWaiverInput, RecordSignedWaiverResult } from "../src/lib/waiver-capture";
import type { AccountIdentity, AccountRegistrationOps } from "../src/lib/account-routes";
import { getWaiverExpiryIso } from "../src/lib/contacts";

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
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  lastUsedAt: number | null;
  /** Null for a session minted directly (post-registration / in-person). */
  accessTokenId: string | null;
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
      createdAt: now,
      expiresAt: now + input.sessionTtlSeconds * 1000,
      revokedAt: null,
      lastUsedAt: null,
      accessTokenId: row.id,
    };
    this.sessions.set(session.tokenHash, session);
    return {
      ok: true,
      sessionId: session.id,
      registrationId: session.registrationId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  /** A plain INSERT into registration_sessions: no token behind it. */
  async createSession(input: {
    registrationId: string;
    tokenHash: string;
    scopes: readonly string[];
    ttlSeconds: number;
  }): Promise<CreateSessionResult> {
    this.maybeFail("createSession");
    if (this.sessions.has(input.tokenHash)) throw new Error("duplicate session hash");
    const now = this.now();
    const session: SessionRow = {
      id: fakeId(),
      registrationId: input.registrationId,
      tokenHash: input.tokenHash,
      scopes: [...input.scopes],
      createdAt: now,
      expiresAt: now + Math.max(60, input.ttlSeconds) * 1000,
      revokedAt: null,
      lastUsedAt: null,
      accessTokenId: null,
    };
    this.sessions.set(session.tokenHash, session);
    return {
      sessionId: session.id,
      createdAt: new Date(session.createdAt).toISOString(),
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
      createdAt: new Date(row.createdAt).toISOString(),
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
  /** Age a session, as if it had been minted `seconds` ago. */
  ageSession(rawSecretHash: string, seconds: number) {
    const row = this.sessions.get(rawSecretHash);
    if (row) row.createdAt -= seconds * 1000;
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
  paymentMethod: string | null;
  cancelledAt: string | null;
  waiverSigned: boolean;
  /** Spies: a resume session must never be able to flip these. */
  cashMarkedPaid: boolean;
  /** Flipped only by an in-app signature request (needs `waiver:sign`). */
  waiverCompletedDirectly: boolean;
  signedName: string | null;
};

export class RecordingOps implements ResumeRegistrationOps {
  registrations = new Map<string, FakeRegistration>();
  calls: { op: string; registrationId: string }[] = [];

  add(id: string, patch: Partial<FakeRegistration> = {}) {
    this.registrations.set(id, {
      id,
      paymentStatus: "pending",
      paymentMethod: null,
      cancelledAt: null,
      waiverSigned: true,
      cashMarkedPaid: false,
      waiverCompletedDirectly: false,
      signedName: null,
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
      paymentMethod: r.paymentMethod,
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

  async setPaymentMethod(registrationId: string, method: PaymentMethodChoice) {
    this.calls.push({ op: "setPaymentMethod", registrationId });
    const r = this.registrations.get(registrationId);
    if (!r) return { status: 404, body: { error: "not found" } };
    if (r.cancelledAt) return { status: 409, body: { error: "cancelled" } };
    if (!r.waiverSigned) return { status: 409, body: { error: "sign first", needsWaiver: true } };
    r.paymentMethod = method;
    return { status: 200, body: { ok: true, method, paymentStatus: r.paymentStatus } };
  }

  async signWaiverInApp(registrationId: string, input: InAppSignatureRequest) {
    this.calls.push({ op: "signWaiverInApp", registrationId });
    const r = this.registrations.get(registrationId);
    if (!r) return { status: 404, body: { error: "not found" } };
    if (r.waiverSigned) return { status: 200, body: { ok: true, alreadySigned: true } };
    if (input.signedName.trim().length < 3 || !input.signedName.includes(" ")) {
      return { status: 400, body: { error: "full name" } };
    }
    r.waiverSigned = true;
    r.waiverCompletedDirectly = true;
    r.signedName = input.signedName;
    return { status: 200, body: { ok: true, signedAt: new Date().toISOString() } };
  }

  async loadWaiverSigningContext(registrationId: string): Promise<WaiverSigningContext | null> {
    const r = this.registrations.get(registrationId);
    if (!r) return null;
    return {
      registrationId,
      contactId: null,
      waiverType: "adult",
      playerName: "Test Player",
      eventTitle: "Community Cup - Fall 2026",
      eventSlug: "community-cup-fall-2026",
      alreadySigned: r.waiverSigned,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Account ops (what a signed-in owner may do)                           */
/* ------------------------------------------------------------------ */

export type FakeOwnedRegistration = FakeRegistration & { contactId: string | null };

export class RecordingAccountOps implements AccountRegistrationOps {
  registrations = new Map<string, FakeOwnedRegistration>();
  calls: { op: string; registrationId: string; contactId?: string }[] = [];

  add(id: string, contactId: string | null, patch: Partial<FakeRegistration> = {}) {
    this.registrations.set(id, {
      id,
      contactId,
      paymentStatus: "pending",
      paymentMethod: null,
      cancelledAt: null,
      waiverSigned: true,
      cashMarkedPaid: false,
      waiverCompletedDirectly: false,
      signedName: null,
      ...patch,
    });
  }

  async loadOwner(registrationId: string) {
    const r = this.registrations.get(registrationId);
    if (!r) return null;
    return { contactId: r.contactId };
  }

  async cancel(registrationId: string) {
    this.calls.push({ op: "cancel", registrationId });
    const r = this.registrations.get(registrationId)!;
    if (r.cancelledAt) return { status: 200, body: { ok: true, alreadyCancelled: true } };
    r.cancelledAt = new Date().toISOString();
    return { status: 200, body: { ok: true, alreadyCancelled: false } };
  }

  async setPaymentMethod(registrationId: string, method: PaymentMethodChoice, identity: AccountIdentity) {
    this.calls.push({ op: "setPaymentMethod", registrationId, contactId: identity.contactId });
    const r = this.registrations.get(registrationId)!;
    if (!r.waiverSigned) return { status: 409, body: { error: "sign first", needsWaiver: true } };
    r.paymentMethod = method;
    return { status: 200, body: { ok: true, method } };
  }

  async startCheckout(registrationId: string, identity: AccountIdentity) {
    this.calls.push({ op: "startCheckout", registrationId, contactId: identity.contactId });
    const r = this.registrations.get(registrationId)!;
    if (r.paymentStatus === "paid") return { ok: false as const, status: 400, error: "paid" };
    return { ok: true as const, url: `https://checkout.stripe.test/${registrationId}` };
  }

  async signWaiverInApp(registrationId: string, input: InAppSignatureRequest) {
    this.calls.push({ op: "signWaiverInApp", registrationId });
    const r = this.registrations.get(registrationId)!;
    if (r.waiverSigned) return { status: 200, body: { ok: true, alreadySigned: true } };
    r.waiverSigned = true;
    r.waiverCompletedDirectly = true;
    r.signedName = input.signedName;
    return { status: 200, body: { ok: true } };
  }
}

/* ------------------------------------------------------------------ */
/* DocuSeal webhook store (mirrors claim_docuseal_webhook_event)          */
/* ------------------------------------------------------------------ */

export type FakeWaiverRow = WebhookRegistrationRow & {
  waiverSigned: boolean;
  waiverSignedAt: string | null;
  waiverExpiresAt: string | null;
  documentUrl: string | null;
  /** Times the row was written — a replay must not add to this. */
  writes: number;
};

type FakeEventRow = {
  eventKey: string;
  eventType: string;
  submitterId: number;
  submissionId: number;
  registrationId: string;
  claimedAt: number;
  processedAt: number | null;
  outcome: string | null;
  detail: string | null;
  attempts: number;
};

export class InMemoryDocusealStore implements DocusealWebhookStore {
  registrations = new Map<string, FakeWaiverRow>();
  contacts = new Map<string, { waiverSignedAt: string | null; waiverExpiresAt: string | null }>();
  events = new Map<string, FakeEventRow>();
  now: () => number = () => Date.now();
  failNextRecord = false;
  failNextClaim = false;
  recordCalls = 0;

  add(row: Partial<FakeWaiverRow> & { id: string }) {
    this.registrations.set(row.id, {
      contactId: null,
      waiverType: "adult",
      docusealSubmissionId: null,
      waiverSigned: false,
      waiverSignedAt: null,
      waiverExpiresAt: null,
      documentUrl: null,
      writes: 0,
      ...row,
    });
  }

  async loadRegistration(id: string) {
    const r = this.registrations.get(id);
    if (!r) return null;
    const { id: rid, contactId, waiverType, docusealSubmissionId } = r;
    return { id: rid, contactId, waiverType, docusealSubmissionId };
  }

  async findRegistrationsBySubmission(submissionId: number) {
    return [...this.registrations.values()]
      .filter((r) => r.docusealSubmissionId === submissionId)
      .map(({ id, contactId, waiverType, docusealSubmissionId }) => ({ id, contactId, waiverType, docusealSubmissionId }));
  }

  async claimEvent(input: {
    eventKey: string;
    eventType: string;
    submitterId: number;
    submissionId: number;
    registrationId: string;
    staleAfterSeconds: number;
  }): Promise<ClaimEventResult> {
    if (this.failNextClaim) {
      this.failNextClaim = false;
      throw new Error("simulated claim failure");
    }
    const now = this.now();
    const existing = this.events.get(input.eventKey);
    if (!existing) {
      this.events.set(input.eventKey, {
        eventKey: input.eventKey,
        eventType: input.eventType,
        submitterId: input.submitterId,
        submissionId: input.submissionId,
        registrationId: input.registrationId,
        claimedAt: now,
        processedAt: null,
        outcome: null,
        detail: null,
        attempts: 1,
      });
      return { status: "claimed" };
    }
    if (existing.processedAt !== null) return { status: "duplicate", previousOutcome: existing.outcome };
    if (existing.claimedAt < now - input.staleAfterSeconds * 1000) {
      existing.claimedAt = now;
      existing.attempts += 1;
      existing.detail = null;
      return { status: "reclaimed" };
    }
    return { status: "in_flight" };
  }

  /** Mirrors recordSignedWaiver: registration first, then contact promotion. */
  async recordSignedWaiver(input: RecordSignedWaiverInput): Promise<RecordSignedWaiverResult> {
    this.recordCalls += 1;
    const signedAt = input.completedAt ?? new Date(this.now()).toISOString();
    const expiresAt = getWaiverExpiryIso(signedAt);
    if (this.failNextRecord) {
      this.failNextRecord = false;
      return { ok: false, signedAt, expiresAt, documentUrl: input.documentUrl ?? null, error: "simulated write failure" };
    }
    const r = this.registrations.get(input.registrationId);
    if (!r) return { ok: false, signedAt, expiresAt, documentUrl: null, error: "no row" };
    r.waiverSigned = true;
    r.waiverSignedAt = signedAt;
    r.waiverExpiresAt = expiresAt;
    if (input.documentUrl) r.documentUrl = input.documentUrl;
    if (input.submissionId != null) r.docusealSubmissionId = Number(input.submissionId);
    r.writes += 1;
    if (input.contactId) {
      this.contacts.set(input.contactId, { waiverSignedAt: signedAt, waiverExpiresAt: expiresAt });
    }
    return { ok: true, signedAt, expiresAt, documentUrl: input.documentUrl ?? null };
  }

  async finishEvent(input: { eventKey: string; processed: boolean; outcome: string; detail: string | null }) {
    const row = this.events.get(input.eventKey);
    if (!row) return;
    row.outcome = input.outcome;
    row.detail = input.detail;
    if (input.processed) row.processedAt = this.now();
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
