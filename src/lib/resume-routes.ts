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
 * Only then does the handler touch the registration, and only ever the ONE
 * registration the session names.
 */
import { normalizeEmail } from "@/lib/contacts";
import {
  authenticateResumeSession,
  exchangeResumeToken,
  requestResumeLink,
  sessionAllows,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a successful exchange lands. No token, no id, nothing to bookmark. */
export const RESUME_PAGE_PATH = "/pay/resume";

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
    registrationId: string
  ): Promise<{ ok: true; url: string; mode: "docuseal" | "in_person_only" } | { ok: false; status: number; error: string }>;
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

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (type.includes("application/json")) {
      const parsed = (await request.json()) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    }
    if (type.includes("application/x-www-form-urlencoded")) {
      // Parse the raw text ourselves: URLSearchParams has no runtime quirks,
      // whereas formData() has differed between runtimes for this content type.
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
  const body = await readBody(request);
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

  const body = await readBody(request);
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

async function guard(
  request: Request,
  deps: ResumeRouteDeps,
  scope: ResumeScope
): Promise<Guarded> {
  const origin = checkSameOrigin(request.headers, deps.siteUrl);
  if (!origin.ok) {
    return { ok: false, response: json({ error: "Cross-origin request refused." }, 403) };
  }

  let session: ResumeSession | null;
  try {
    session = await authenticateResumeSession(
      deps.store,
      readResumeCookieFromHeader(request.headers.get("cookie")),
      (deps.now ?? (() => new Date()))()
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

  const result = await deps.ops.startWaiver(g.session.registrationId);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ url: result.url, mode: result.mode });
}

/* ------------------------------------------------------------------ */
/* 6. POST /pay/resume/api/sign-out — revoke the session                */
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
