/**
 * Registration resume access (F-01).
 *
 * ## The invariant
 *
 * An email address may IDENTIFY a registration internally. Knowing it must
 * never AUTHORISE access to that registration. Authorisation comes only from
 * possession of a secret we generated and delivered to that address:
 *
 *   email typed on /pay
 *     → (throttle) → find the live pending registration for that email + event
 *     → mint a one-time token (≥256 bits), store sha256(token) → email a link
 *   link clicked
 *     → server hashes the token, consumes it atomically, mints a session secret
 *       (≥256 bits), stores sha256(secret), sets an HttpOnly cookie
 *     → every later request is authorised by the SERVER-SIDE session row,
 *       scoped to exactly one registration and an explicit scope list.
 *
 * Nothing in this module talks to the database or the network directly. It is
 * written against `ResumeStore` / `ResumeLinkSender` interfaces so the whole
 * branch table — neutral responses, expiry, single-use, concurrency — can be
 * exercised in scripts/test-resume-access.ts without Postgres. The production
 * implementations live in resume-store-supabase.ts and email/resume-link-sender.ts.
 */
import { createHash, randomBytes } from "crypto";
import { normalizeEmail } from "@/lib/contacts";
import { acceptsPayments, type StatefulTournament } from "@/lib/tournament-state";

/** A magic link is useful for twenty minutes. Long enough to open an inbox. */
export const RESUME_TOKEN_TTL_SECONDS = 20 * 60;
/** A resume session lasts a day: paying, reading the waiver, coming back. */
export const RESUME_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const RESUME_PURPOSE = "resume" as const;

/** Everything a resume session may do. Nothing else — see requireScope(). */
export const RESUME_SCOPES = [
  "registration:read",
  "payment:start",
  "registration:cancel",
  "waiver:start",
] as const;

/**
 * The one scope a magic-link session NEVER carries. It lets a browser record an
 * in-app typed-name signature (the A7 placeholder used when DocuSeal is not
 * configured). It is granted only to the session minted for the browser that
 * just created the registration while DocuSeal is unconfigured, and to the
 * owner's laptop for in-person signing (D8). A resumed session may START a
 * DocuSeal flow; it may not declare a waiver signed.
 */
export const IN_APP_WAIVER_SCOPE = "waiver:sign" as const;

/** What the admin's laptop gets for one in-person in-app signature: read + sign, nothing else. */
export const ADMIN_IN_PERSON_SCOPES = ["registration:read", IN_APP_WAIVER_SCOPE] as const;

export type ResumeScope = (typeof RESUME_SCOPES)[number] | typeof IN_APP_WAIVER_SCOPE;

/**
 * Cancelling is more destructive than reading, paying or starting a waiver, so
 * it needs a session younger than this (Stage 1.3 Phase 4). A session past
 * this age keeps every other scope and is told to verify again for cancel.
 */
export const RESUME_CANCEL_FRESHNESS_SECONDS = 30 * 60;

/**
 * Throttle windows. Defence in depth only — the token is the authorisation.
 * Chosen so a legitimate player is never locked out for longer than one hour
 * even under sustained abuse of their address (see the migration's notes).
 */
export const RESUME_THROTTLE = {
  emailCooldownSeconds: 60,
  emailHourlyMax: 6,
  ipHourlyMax: 12,
} as const;

/** The one public answer. Identical for every input, on purpose. */
export const RESUME_LINK_NEUTRAL_MESSAGE =
  "If an active pending registration exists for that email, a secure link has been sent to it.";

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

/** 32 bytes of CSPRNG output, base64url — 256 bits of entropy. */
export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** What we store. sha256 of the raw secret, hex. */
export function hashSecret(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Throttle key. Not reversible; the email itself is not stored again. */
export function digestEmail(email: string): string {
  return createHash("sha256").update(`resume-email|${normalizeEmail(email)}`, "utf8").digest("hex");
}

export function digestIp(ip: string | null | undefined): string | null {
  const trimmed = ip?.trim();
  if (!trimmed) return null;
  return createHash("sha256").update(`resume-ip|${trimmed}`, "utf8").digest("hex");
}

/** Raw secrets are base64url of 32 bytes: 43 chars, no padding. */
const RAW_SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

export function looksLikeRawSecret(value: unknown): value is string {
  return typeof value === "string" && RAW_SECRET_RE.test(value);
}

/* ------------------------------------------------------------------ */
/* Store contract                                                       */
/* ------------------------------------------------------------------ */

export type ResumableRegistration = {
  id: string;
  email: string;
  tournamentTitle: string | null;
  /** The event's state columns, so the calendar backstop can be applied. */
  tournament: StatefulTournament | null;
};

export type ConsumeResult =
  | { ok: true; sessionId: string; registrationId: string; expiresAt: string }
  | { ok: false; reason: "invalid" };

export type StoredSession = {
  id: string;
  registrationId: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type CreateSessionResult = {
  sessionId: string;
  createdAt: string;
  expiresAt: string;
};

export interface ResumeStore {
  /** Atomic throttle check + record. Returns whether this request may proceed. */
  recordLinkRequest(input: {
    emailDigest: string;
    ipDigest: string | null;
  }): Promise<{ allowed: boolean; reason?: string }>;

  /**
   * The live registration this email holds on this event that still owes
   * money, with the event's state columns. Null when there is nothing to resume.
   */
  findResumableRegistration(input: {
    email: string;
    tournamentId: string;
  }): Promise<ResumableRegistration | null>;

  createAccessToken(input: {
    registrationId: string;
    tokenHash: string;
    purpose: typeof RESUME_PURPOSE;
    expiresAt: string;
    requesterIpDigest: string | null;
  }): Promise<void>;

  /** MUST be atomic: exactly one caller can ever succeed for one token hash. */
  consumeAccessToken(input: {
    tokenHash: string;
    purpose: typeof RESUME_PURPOSE;
    sessionTokenHash: string;
    scopes: readonly string[];
    sessionTtlSeconds: number;
  }): Promise<ConsumeResult>;

  /**
   * Mint a session directly, with no magic-link token behind it. Used for the
   * browser that has just CREATED a registration (Stage 1.3 Phase 3) and for
   * the owner's in-person signing laptop. The row is identical to one created
   * by `consumeAccessToken`, minus `access_token_id`.
   */
  createSession(input: {
    registrationId: string;
    tokenHash: string;
    scopes: readonly string[];
    ttlSeconds: number;
  }): Promise<CreateSessionResult>;

  findSession(tokenHash: string): Promise<StoredSession | null>;
  touchSession(sessionId: string): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
}

export type ResumeLinkMessage = {
  to: string;
  link: string;
  eventTitle: string | null;
  expiresInMinutes: number;
};

export interface ResumeLinkSender {
  send(message: ResumeLinkMessage): Promise<{ delivered: boolean; error?: string }>;
}

/* ------------------------------------------------------------------ */
/* 1. Request a link                                                    */
/* ------------------------------------------------------------------ */

export type RequestResumeLinkDeps = {
  store: ResumeStore;
  sender: ResumeLinkSender;
  /** Absolute site origin the link is built on, e.g. https://www.example.com */
  baseUrl: string;
  now?: () => Date;
};

export type RequestResumeLinkInput = {
  email: string;
  tournamentId: string;
  clientIp: string | null;
};

/**
 * Internal outcome, for logging and tests ONLY. The HTTP layer must never
 * surface `sent`/`reason` — every caller receives the same neutral body.
 */
export type RequestResumeLinkOutcome = {
  sent: boolean;
  reason:
    | "sent"
    | "throttled"
    | "no_registration"
    | "event_not_accepting_payments"
    | "delivery_failed";
};

export function buildResumeExchangePath(rawToken: string): string {
  return `/pay/resume/exchange?t=${encodeURIComponent(rawToken)}`;
}

export async function requestResumeLink(
  deps: RequestResumeLinkDeps,
  input: RequestResumeLinkInput
): Promise<RequestResumeLinkOutcome> {
  const now = deps.now ?? (() => new Date());
  const email = normalizeEmail(input.email);

  // Throttle first, before any lookup, so a flood never reaches the tables
  // that hold people. The record is keyed by digests, never plaintext.
  const gate = await deps.store.recordLinkRequest({
    emailDigest: digestEmail(email),
    ipDigest: digestIp(input.clientIp),
  });
  if (!gate.allowed) {
    return { sent: false, reason: "throttled" };
  }

  const registration = await deps.store.findResumableRegistration({
    email,
    tournamentId: input.tournamentId,
  });

  if (!registration) {
    // Burn roughly the same CPU a real issue would, so "no such registration"
    // is not a measurably faster reply than "link sent". Best effort — the
    // email send itself is the dominant cost and cannot be equalised.
    hashSecret(generateSecret());
    return { sent: false, reason: "no_registration" };
  }

  if (!registration.tournament || !acceptsPayments(registration.tournament, now())) {
    hashSecret(generateSecret());
    return { sent: false, reason: "event_not_accepting_payments" };
  }

  const raw = generateSecret();
  const expiresAt = new Date(now().getTime() + RESUME_TOKEN_TTL_SECONDS * 1000);

  await deps.store.createAccessToken({
    registrationId: registration.id,
    tokenHash: hashSecret(raw),
    purpose: RESUME_PURPOSE,
    expiresAt: expiresAt.toISOString(),
    requesterIpDigest: digestIp(input.clientIp),
  });

  const origin = deps.baseUrl.replace(/\/$/, "");
  const delivery = await deps.sender.send({
    to: registration.email,
    link: `${origin}${buildResumeExchangePath(raw)}`,
    eventTitle: registration.tournamentTitle,
    expiresInMinutes: Math.round(RESUME_TOKEN_TTL_SECONDS / 60),
  });

  if (!delivery.delivered) {
    console.error(
      "[resume-link] delivery failed:",
      delivery.error ?? "unknown",
      "— the token was issued and will expire unused."
    );
    return { sent: false, reason: "delivery_failed" };
  }

  return { sent: true, reason: "sent" };
}

/* ------------------------------------------------------------------ */
/* 2. Exchange the one-time token for a session                          */
/* ------------------------------------------------------------------ */

export type ExchangeResult =
  | {
      ok: true;
      /** Raw session secret. Goes into the cookie and nowhere else. */
      sessionSecret: string;
      sessionId: string;
      registrationId: string;
      expiresAt: string;
    }
  | { ok: false; reason: "malformed" | "invalid" };

export async function exchangeResumeToken(
  store: ResumeStore,
  rawToken: unknown
): Promise<ExchangeResult> {
  if (!looksLikeRawSecret(rawToken)) {
    return { ok: false, reason: "malformed" };
  }

  // The session secret is generated BEFORE the consume so the store can write
  // token-consumption and session-creation in one transaction.
  const sessionSecret = generateSecret();

  const consumed = await store.consumeAccessToken({
    tokenHash: hashSecret(rawToken),
    purpose: RESUME_PURPOSE,
    sessionTokenHash: hashSecret(sessionSecret),
    scopes: RESUME_SCOPES,
    sessionTtlSeconds: RESUME_SESSION_TTL_SECONDS,
  });

  if (!consumed.ok) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    sessionSecret,
    sessionId: consumed.sessionId,
    registrationId: consumed.registrationId,
    expiresAt: consumed.expiresAt,
  };
}

/* ------------------------------------------------------------------ */
/* 2b. Mint a session for a registration the caller has just created    */
/* ------------------------------------------------------------------ */

export type IssuedRegistrationSession = {
  /** Raw session secret. Goes into the cookie and nowhere else. */
  sessionSecret: string;
  sessionId: string;
  registrationId: string;
  expiresAt: string;
  /** Seconds until expiry, for the cookie's Max-Age. */
  maxAgeSeconds: number;
};

/**
 * The immediate post-registration authority (Stage 1.3, replacing the 90-day
 * HMAC token). The browser has just successfully created THIS registration, so
 * the server may hand it a session scoped to exactly that row — the same
 * server-side, hashed, revocable session a magic link produces, with the same
 * scope model. Never wider: a caller passes only scopes from `ResumeScope`,
 * and `IN_APP_WAIVER_SCOPE` only when DocuSeal is unconfigured.
 *
 * Nothing about the submitted email is consulted here; the binding is the
 * immutable `registrationId` the caller just inserted.
 */
export async function issueRegistrationSession(
  store: ResumeStore,
  input: {
    registrationId: string;
    scopes: readonly ResumeScope[];
    ttlSeconds?: number;
    now?: () => Date;
  }
): Promise<IssuedRegistrationSession> {
  const ttl = input.ttlSeconds ?? RESUME_SESSION_TTL_SECONDS;
  const sessionSecret = generateSecret();
  const created = await store.createSession({
    registrationId: input.registrationId,
    tokenHash: hashSecret(sessionSecret),
    scopes: input.scopes,
    ttlSeconds: ttl,
  });
  const nowMs = (input.now ?? (() => new Date()))().getTime();
  const expiresMs = Date.parse(created.expiresAt);
  const maxAgeSeconds = Number.isNaN(expiresMs)
    ? ttl
    : Math.max(60, Math.floor((expiresMs - nowMs) / 1000));
  return {
    sessionSecret,
    sessionId: created.sessionId,
    registrationId: input.registrationId,
    expiresAt: created.expiresAt,
    maxAgeSeconds,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Authenticate a request by its session cookie                      */
/* ------------------------------------------------------------------ */

export type ResumeSession = {
  sessionId: string;
  registrationId: string;
  scopes: ReadonlySet<string>;
  /** When the session was minted — the freshness clock for destructive scopes. */
  createdAt: string;
};

export async function authenticateResumeSession(
  store: ResumeStore,
  rawCookieValue: unknown,
  now: Date = new Date()
): Promise<ResumeSession | null> {
  if (!looksLikeRawSecret(rawCookieValue)) return null;

  const row = await store.findSession(hashSecret(rawCookieValue));
  if (!row) return null;
  if (row.revokedAt) return null;

  const expiresMs = Date.parse(row.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= now.getTime()) return null;

  // Best-effort activity stamp; a failure here must not fail the request.
  try {
    await store.touchSession(row.id);
  } catch (err) {
    console.warn("[resume-session] touch failed:", err);
  }

  return {
    sessionId: row.id,
    registrationId: row.registrationId,
    scopes: new Set(row.scopes),
    createdAt: row.createdAt,
  };
}

/** True when the session may perform `scope` on `registrationId`. */
export function sessionAllows(
  session: ResumeSession | null,
  scope: ResumeScope,
  registrationId: string
): session is ResumeSession {
  if (!session) return false;
  if (session.registrationId !== registrationId) return false;
  return session.scopes.has(scope);
}

/**
 * Step-up for `registration:cancel`: the session must have been minted within
 * the last `maxAgeSeconds`. An unparseable `createdAt` is treated as stale —
 * fail closed on the destructive action, never open.
 */
export function sessionIsFresh(
  session: Pick<ResumeSession, "createdAt">,
  now: Date = new Date(),
  maxAgeSeconds: number = RESUME_CANCEL_FRESHNESS_SECONDS
): boolean {
  const createdMs = Date.parse(session.createdAt);
  if (Number.isNaN(createdMs)) return false;
  return now.getTime() - createdMs <= maxAgeSeconds * 1000;
}
