/**
 * Route handlers for a SIGNED-IN player acting on one of their own
 * registrations — the replacement for the retired 90-day HMAC token on the
 * `/register` status cards (Stage 1.3 Phase 3).
 *
 * Authorisation, in order, for every handler:
 *   1. the id is a UUID (400 — reveals nothing)
 *   2. same-origin check on the request headers (CSRF)
 *   3. a Supabase Auth session, resolved to a contact (401)
 *   4. that contact is the registration's `contact_id` (403; a non-owner learns
 *      nothing about whether the id exists)
 *
 * Only then does the handler act, and only on that one registration. Nothing
 * in the request body or query string ever names the registration or carries a
 * credential: the path has the id, the cookie has the identity. A legacy
 * `payToken` / `token` in a body or query is simply never read.
 *
 * Written as (Request, id, deps) => Response with injected dependencies so the
 * table runs in scripts/test-account-routes.ts without Next.js or Postgres.
 */
import { checkSameOrigin } from "@/lib/same-origin";
import { readRequestBody } from "@/lib/resume-routes";
import { isPaymentMethodChoice, type PaymentMethodChoice } from "@/lib/payment-method";
import {
  clientIpForSignature,
  parseInAppSignatureBody,
  type InAppSignatureRequest,
} from "@/lib/waiver-sign-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Who is calling, from the Supabase session. */
export type AccountIdentity = { contactId: string; email: string };

export type AccountRegistrationOps = {
  /** `contact_id` of the row, or null when the row does not exist. */
  loadOwner(registrationId: string): Promise<{ contactId: string | null } | null>;
  cancel(registrationId: string): Promise<{ status: number; body: Record<string, unknown> }>;
  setPaymentMethod(
    registrationId: string,
    method: PaymentMethodChoice,
    identity: AccountIdentity
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  startCheckout(
    registrationId: string,
    identity: AccountIdentity,
    baseUrl: string
  ): Promise<{ ok: true; url: string } | { ok: false; status: number; error: string }>;
  signWaiverInApp(
    registrationId: string,
    input: InAppSignatureRequest
  ): Promise<{ status: number; body: Record<string, unknown> }>;
};

export type AccountRouteDeps = {
  /** The current Supabase session's contact, or null. */
  identity: () => Promise<AccountIdentity | null>;
  ops: AccountRegistrationOps;
  /** Absolute site origin, e.g. https://www.example.com */
  baseUrl: string;
  /** Configured public origin for the same-origin check (NEXT_PUBLIC_SITE_URL). */
  siteUrl: string | null;
};

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const ACCOUNT_SIGN_IN_MESSAGE =
  "Sign in with Google to manage this signup, or open the link we emailed you.";
export const ACCOUNT_NOT_YOURS_MESSAGE =
  "We couldn't confirm this is your signup. Sign in with the account you registered with, or request a link from the pay page.";

type Guarded =
  | { ok: true; identity: AccountIdentity }
  | { ok: false; response: Response };

async function guard(request: Request, registrationId: string, deps: AccountRouteDeps): Promise<Guarded> {
  if (!UUID_RE.test(registrationId)) {
    return { ok: false, response: json({ error: "Missing registration id." }, 400) };
  }

  const origin = checkSameOrigin(request.headers, deps.siteUrl);
  if (!origin.ok) {
    return { ok: false, response: json({ error: "Cross-origin request refused." }, 403) };
  }

  let identity: AccountIdentity | null;
  try {
    identity = await deps.identity();
  } catch (err) {
    console.error("[account] identity lookup failed:", err instanceof Error ? err.message : err);
    return { ok: false, response: json({ error: "Please try again." }, 500) };
  }
  if (!identity) {
    return { ok: false, response: json({ error: ACCOUNT_SIGN_IN_MESSAGE }, 401) };
  }

  let owner: { contactId: string | null } | null;
  try {
    owner = await deps.ops.loadOwner(registrationId);
  } catch (err) {
    console.error("[account] owner lookup failed:", err instanceof Error ? err.message : err);
    return { ok: false, response: json({ error: "Please try again." }, 500) };
  }
  // Missing row and somebody else's row get the same answer: an authenticated
  // stranger must not be able to enumerate ids.
  if (!owner || !owner.contactId || owner.contactId !== identity.contactId) {
    return { ok: false, response: json({ error: ACCOUNT_NOT_YOURS_MESSAGE }, 403) };
  }

  return { ok: true, identity };
}

/* POST /api/registrations/[id]/cancel */
export async function handleAccountCancel(
  request: Request,
  registrationId: string,
  deps: AccountRouteDeps
): Promise<Response> {
  const g = await guard(request, registrationId, deps);
  if (!g.ok) return g.response;
  const result = await deps.ops.cancel(registrationId);
  return json(result.body, result.status);
}

/* POST /api/registrations/[id]/payment-method  { method: "card" | "cash" } */
export async function handleAccountPaymentMethod(
  request: Request,
  registrationId: string,
  deps: AccountRouteDeps
): Promise<Response> {
  const g = await guard(request, registrationId, deps);
  if (!g.ok) return g.response;

  const body = await readRequestBody(request);
  const method = typeof body.method === "string" ? body.method.trim() : "";
  if (!isPaymentMethodChoice(method)) {
    return json({ error: "Choose card or cash." }, 400);
  }
  const result = await deps.ops.setPaymentMethod(registrationId, method, g.identity);
  return json(result.body, result.status);
}

/* POST /api/registrations/[id]/checkout → { url } */
export async function handleAccountCheckout(
  request: Request,
  registrationId: string,
  deps: AccountRouteDeps
): Promise<Response> {
  const g = await guard(request, registrationId, deps);
  if (!g.ok) return g.response;

  const result = await deps.ops.startCheckout(registrationId, g.identity, deps.baseUrl);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ url: result.url });
}

/* POST /api/registrations/[id]/waiver-sign  { signedName, signerRelationship? } */
export async function handleAccountWaiverSign(
  request: Request,
  registrationId: string,
  deps: AccountRouteDeps
): Promise<Response> {
  const g = await guard(request, registrationId, deps);
  if (!g.ok) return g.response;

  const body = await readRequestBody(request);
  const parsed = parseInAppSignatureBody(body);
  const result = await deps.ops.signWaiverInApp(registrationId, {
    signedName: parsed.signedName,
    signerRelationship: parsed.signerRelationship,
    ip: clientIpForSignature(request.headers),
    userAgent: request.headers.get("user-agent"),
    siteOrigin: deps.baseUrl,
  });
  return json(result.body, result.status);
}
