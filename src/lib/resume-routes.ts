/**
 * Route handlers for the resume flow, written as plain (Request) => Response
 * functions with injected dependencies so every branch — neutral responses,
 * same-origin refusal, scope checks, cross-registration attempts — runs in
 * scripts/test-resume-routes.ts without Next.js or Postgres. The files under
 * src/app/**\/route.ts are one-line adapters over these.
 *
 * Authorisation, in order, for every state-changing handler:
 *   1. same-origin check on the request headers (CSRF)
 *   2. the resume cookie → server-side session row (authentication)
 *   3. the session's scope list and registration id (authorisation)
 *   4. for `registration:cancel`, session freshness (Stage 1.3 Phase 4)
 * Only then does the handler touch the registration, and only ever the ONE
 * registration the session names.
 *
 * Two kinds of session reach these handlers, and they are the same row shape:
 * one minted by a magic-link exchange (Stage 1.2), and one minted for the
 * browser that has just created the registration (Stage 1.3, replacing the
 * 90-day HMAC token). Only the second kind can ever carry `waiver:sign`.
 */
import { normalizeEmail } from "@/lib/contacts";
import {
  authenticateResumeSession,
  exchangeResumeToken,
  requestResumeLink,
  sessionAllows,
  sessionIsFresh,
  IN_APP_WAIVER_SCOPE,
  RESUME_CANCEL_FRESHNESS_SECONDS,
  RESUME_LINK_NEUTRAL_MESSAGE,
  RESUME_SESSION_TTL_SECONDS,
  type ResumeLinkSender,
  type ResumeScope,
  type ResumeSession,
  type ResumeStore,
} from "@/lib/resume-access";
import {
  readResumeCookieFromHeader,
  serializeResumeCookie,
  serializeResumeCookieClear,
} from "@/lib/resume-session";
import { checkSameOrigin } from "@/lib/same-origin";
import { isPaymentMethodChoice, type PaymentMethodChoice } from "@/lib/payment-method";
import {
  clientIpForSignature,
  parseInAppSignatureBody,
  type InAppSignatureRequest,
  type WaiverSigningContext,
} from "@/lib/waiver-sign-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a successful exchange lands. No token, no id, nothing to bookmark. */
export const RESUME_PAGE_PATH = "/pay/resume";
/** The in-app signing screen for a session that carries `waiver:sign`. */
export const RESUME_WAIVER_PAGE_PATH = "/pay/resume/waiver";

/** What the resume page may show. Deliberately minimal — no phone, dob, emergency contact. */
export type ResumeSummary = {
  eventTitle: string | null;
  eventSlug: string | null;
  paymentStatus: string;
  paymentMethod: string | null;
  waiverSigned: boolean;
  teamName: string | null;
  entryFeeCents: number | null;
  cancelledAt: string | null;
};

/** The registration-level operations a session may invoke. Implemented over Supabase in resume-ops-supabase.ts. */
export interface ResumeRegistrationOps {
  loadSummary(registrationId: string): Promise<ResumeSummary | null>;
  startCheckout(
    registrationId: string,
    baseUrl: string
  ): Promise<{ ok: true; url: string } | { ok: false; status: number; error: string }>;
  cancel(registrationId: string): Promise<{ status: number; body: Record<string, unknown> }>;
  startWaiver(
    registrationId: string,
    baseUrl: string
  ): Promise<{ ok: true; url: string; mode: "docuseal" | "in_person_only" } | { ok: false; status: number; error: string }>;
  /** Declares card or cash. Never settles anything — see lib/registration-payment-method-server.ts. */
  setPaymentMethod(
    registrationId: string,
    method: PaymentMethodChoice
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  /** Records an in-app typed-name signature. Reachable only with `waiver:sign`. */
  signWaiverInApp(
    registrationId: string,
    input: InAppSignatureRequest
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  loadWaiverSigningContext(registrationId: string): Promise<WaiverSigningContext | null>;
}

export type ResumeRouteDeps = {
  store: ResumeStore;
  sender: ResumeLinkSender;
  ops: ResumeRegistrationOps;
  /** Absolute site origin used for links and redirects, e.g. https://www.example.com */
  baseUrl: string;
  /** Configured public origin for the same-origin check (NEXT_PUBLIC_SITE_URL). */
  siteUrl: string | null;
  now?: () => Date;
};

function json(body: Record<string, unknown>, status = 200, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

function redirect(location: string, headers?: Record<string, string>): Response {
  return new Response(null, { status: 303, headers: { Location: location, ...(headers ?? {}) } });
}

/**
 * Parse a request body by content type. Exported for the account routes, which
 * accept the same shapes. Form bodies are parsed from raw text on purpose:
 * `formData()` returned nothing on Vercel's runtime for the interstitial's
 * urlencoded POST (production, 2026-09-09).
 */
export async function readRequestBody(request: Request): Promise<Record<string, unknown>> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (type.includes("application/json")) {
      const parsed = (await request.json()) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    }
    if (type.includes("application/x-www-form-urlencoded")) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of new URLSearchParams(await request.text())) out[k] = v;
      return out;
    }
    if (type.includes("multipart/form-data")) {
      const form = await request.formData();
      const out: Record<string, unknown> = {};
      form.forEach((v, k) => {
        if (typeof v === "string") out[k] = v;
      });
      return out;
    }
    // Unknown or missing content type: best effort as form-encoded text.
    const text = await request.text();
    if (text) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of new URLSearchParams(text)) out[k] = v;
      return out;
    }
  } catch (err) {
    console.warn("[resume] body parse failed:", err instanceof Error ? err.message : err);
  }
  return {};
}

function clientIp(request: Request): string | null {
  const raw = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  const first = raw?.split(",")[0]?.trim();
  return first || null;
}

/* ------------------------------------------------------------------ */
/* 1. POST /api/pay/eligibility — request a link (neutral)              */
/* ------------------------------------------------------------------ */

const NEUTRAL_BODY = { success: true, message: RESUME_LINK_NEUTRAL_MESSAGE } as const;

/**
 * The one public answer, whatever happened. Structural validation (a
 * well-formed email and a UUID) is the only thing that produces a 400, and
 * that reveals nothing about any registration.
 */
export async function handleResumeLinkRequest(
  request: Request,
  deps: ResumeRouteDeps
): Promise<Response> {
  const body = await readRequestBody(request);
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const tournamentId = typeof body.tournamentId === "string" ? body.tournamentId.trim() : "";

  if (!email || !email.includes("@") || email.length > 254) {
    return json({ error: "A valid email is required." }, 400);
  }
  if (!UUID_RE.test(tournamentId)) {
    return json({ error: "A valid tournamentId is required." }, 400);
  }

  try {
    const outcome = await requestResumeLink(
      { store: deps.store, sender: deps.sender, baseUrl: deps.baseUrl, now: deps.now },
      { email, tournamentId, clientIp: clientIp(request) }
    );
    // Reason is logged for the operator, never returned.
    if (outcome.reason !== "sent" && outcome.reason !== "no_registration") {
      console.info("[resume-link] request not sent:", outcome.reason);
    }
  } catch (err) {
    // Even an infrastructure failure must not change the public answer.
    console.error("[resume-link] request failed:", err instanceof Error ? err.message : err);
  }

  return json({ ...NEUTRAL_BODY }, 200, { "Cache-Control": "no-store" });
}

/* ------------------------------------------------------------------ */
/* 2. POST /pay/resume/api/exchange — one-time token → session cookie   */
/* ------------------------------------------------------------------ */

export async function handleResumeExchange(
  request: Request,
  deps: ResumeRouteDeps
): Promise<Response> {
  const origin = checkSameOrigin(request.headers, deps.siteUrl);
  if (!origin.ok) {
    return json({ error: "Cross-origin request refused." }, 403);
  }

  const body = await readRequestBody(request);
  const token = typeof body.token === "string" ? body.token.trim() : "";

  let result;
  try {
    result = await exchangeResumeToken(deps.store, token);
  } catch (err) {
    console.error("[resume-exchange] store failure:", err instanceof Error ? err.message : err);
    return json({ error: "We couldn't open your link right now. Please try again." }, 500);
  }

  if (!result.ok) {
    // Token-free diagnostic: enough to tell "the browser sent nothing usable"
    // from "a well-formed token the database does not recognise".
    console.warn("[resume-exchange] refused:", {
      reason: result.reason,
      tokenLength: token.length,
      contentType: request.headers.get("content-type") ?? "none",
    });
    // Leave any existing cookie alone. A refused token says nothing about the
    // session the browser may already hold: a player who clicks an old link a
    // second time while signed in simply lands on their registration page
    // (found in production 2026-09-09 — clearing here signed them out).
    return redirect(`${RESUME_PAGE_PATH}?link=${result.reason === "malformed" ? "malformed" : "invalid"}`, {
      "Cache-Control": "no-store",
    });
  }

  const expiresMs = Date.parse(result.expiresAt);
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const maxAge = Number.isNaN(expiresMs)
    ? RESUME_SESSION_TTL_SECONDS
    : Math.max(60, Math.floor((expiresMs - nowMs) / 1000));

  return redirect(RESUME_PAGE_PATH, {
    "Set-Cookie": serializeResumeCookie(result.sessionSecret, maxAge),
    "Cache-Control": "no-store",
  });
}

/* ------------------------------------------------------------------ */
/* Shared guard for cookie-authenticated, state-changing handlers       */
/* ------------------------------------------------------------------ */

type Guarded =
  | { ok: true; session: ResumeSession }
  | { ok: false; response: Response };

export const STALE_SESSION_REASON = "stale_session";

async function guard(
  request: Request,
  deps: ResumeRouteDeps,
  scope: ResumeScope
): Promise<Guarded> {
  const origin = checkSameOrigin(request.headers, deps.siteUrl);
  if (!origin.ok) {
    return { ok: false, response: json({ error: "Cross-origin request refused." }, 403) };
  }

  const now = (deps.now ?? (() => new Date()))();
  let session: ResumeSession | null;
  try {
    session = await authenticateResumeSession(
      deps.store,
      readResumeCookieFromHeader(request.headers.get("cookie")),
      now
    );
  } catch (err) {
    console.error("[resume] session lookup failed:", err instanceof Error ? err.message : err);
    return { ok: false, response: json({ error: "Please try again." }, 500) };
  }

  if (!session) {
    return {
      ok: false,
      response: json({ error: "Your link has expired. Request a new one from the pay page." }, 401),
    };
  }
  if (!sessionAllows(session, scope, session.registrationId)) {
    return { ok: false, response: json({ error: "This link can't do that." }, 403) };
  }

  // Step-up for the one destructive scope: a 24-hour session may read, pay and
  // start a waiver for its whole life, but cancelling needs a session minted in
  // the last thirty minutes. The player re-verifies through the same magic-link
  // flow; nothing else changes and no cross-registration authority appears.
  if (scope === "registration:cancel" && !sessionIsFresh(session, now, RESUME_CANCEL_FRESHNESS_SECONDS)) {
    return {
      ok: false,
      response: json(
        {
          error:
            "For safety, cancelling needs a link you opened in the last 30 minutes. Request a fresh link from the pay page and try again.",
          reason: STALE_SESSION_REASON,
        },
        403
      ),
    };
  }
  return { ok: true, session };
}

/**
 * Every operation below acts on `session.registrationId` and nothing else.
 * A request body naming a different registration is ignored — the session is
 * the only source of the target — and a session for registration A therefore
 * cannot reach registration B.
 */

/* ------------------------------------------------------------------ */
/* 3. POST /pay/resume/api/checkout                                     */
/* ------------------------------------------------------------------ */

export async function handleResumeCheckout(request: Request, deps: ResumeRouteDeps): Promise<Response> {
  const g = await guard(request, deps, "payment:start");
  if (!g.ok) return g.response;

  const result = await deps.ops.startCheckout(g.session.registrationId, deps.baseUrl);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ url: result.url });
}

/* ------------------------------------------------------------------ */
/* 4. POST /pay/resume/api/cancel                                       */
/* ------------------------------------------------------------------ */

export async function handleResumeCancel(request: Request, deps: ResumeRouteDeps): Promise<Response> {
  const g = await guard(request, deps, "registration:cancel");
  if (!g.ok) return g.response;

  const result = await deps.ops.cancel(g.session.registrationId);
  return json(result.body, result.status);
}

/* ------------------------------------------------------------------ */
/* 5. POST /pay/resume/api/waiver — START the provider flow, never sign */
/* ------------------------------------------------------------------ */

export async function handleResumeWaiverStart(request: Request, deps: ResumeRouteDeps): Promise<Response> {
  const g = await guard(request, deps, "waiver:start");
  if (!g.ok) return g.response;

  const result = await deps.ops.startWaiver(g.session.registrationId, deps.baseUrl);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ url: result.url, mode: result.mode });
}

/* ------------------------------------------------------------------ */
/* 6. POST /pay/resume/api/payment-method — declare card or cash        */
/* ------------------------------------------------------------------ */

export async function handleResumePaymentMethod(request: Request, deps: ResumeRouteDeps): Promise<Response> {
  const g = await guard(request, deps, "payment:start");
  if (!g.ok) return g.response;

  const body = await readRequestBody(request);
  const method = typeof body.method === "string" ? body.method.trim() : "";
  if (!isPaymentMethodChoice(method)) {
    return json({ error: "Choose card or cash." }, 400);
  }

  const result = await deps.ops.setPaymentMethod(g.session.registrationId, method);
  return json(result.body, result.status);
}

/* ------------------------------------------------------------------ */
/* 7. POST /pay/resume/api/waiver-sign — in-app signature (waiver:sign) */
/* ------------------------------------------------------------------ */

export async function handleResumeWaiverSign(request: Request, deps: ResumeRouteDeps): Promise<Response> {
  const g = await guard(request, deps, IN_APP_WAIVER_SCOPE);
  if (!g.ok) return g.response;

  const body = await readRequestBody(request);
  const parsed = parseInAppSignatureBody(body);

  const result = await deps.ops.signWaiverInApp(g.session.registrationId, {
    signedName: parsed.signedName,
    signerRelationship: parsed.signerRelationship,
    ip: clientIpForSignature(request.headers),
    userAgent: request.headers.get("user-agent"),
    siteOrigin: deps.baseUrl,
  });
  return json(result.body, result.status);
}

/* ------------------------------------------------------------------ */
/* 8. POST /pay/resume/api/sign-out — revoke the session                */
/* ------------------------------------------------------------------ */

export async function handleResumeSignOut(request: Request, deps: ResumeRouteDeps): Promise<Response> {
  const origin = checkSameOrigin(request.headers, deps.siteUrl);
  if (!origin.ok) {
    return json({ error: "Cross-origin request refused." }, 403);
  }
  try {
    const session = await authenticateResumeSession(
      deps.store,
      readResumeCookieFromHeader(request.headers.get("cookie")),
      (deps.now ?? (() => new Date()))()
    );
    if (session) await deps.store.revokeSession(session.sessionId);
  } catch (err) {
    console.warn("[resume] sign-out revoke failed:", err instanceof Error ? err.message : err);
  }
  return redirect(`${RESUME_PAGE_PATH}?signed_out=1`, {
    "Set-Cookie": serializeResumeCookieClear(),
    "Cache-Control": "no-store",
  });
}
