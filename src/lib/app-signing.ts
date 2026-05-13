import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Server-only signing secret. In production, set `ADMIN_SESSION_SECRET` to a
 * long random string (32+ bytes). Dev falls back to a deterministic value from
 * admin credentials so local setups work without an extra env var.
 */
export function getAppSigningSecret(): string {
  const explicit = process.env.ADMIN_SESSION_SECRET?.trim();
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET must be set in production.");
  }
  const user = process.env.ADMIN_USER ?? "";
  const pass = process.env.ADMIN_PASSWORD ?? "";
  return createHash("sha256")
    .update(`hps-dev-session|${user}|${pass}`, "utf8")
    .digest("base64url");
}

export function signAdminSessionCookieValue(
  adminUser: string,
  maxAgeSec: number
): string {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = Buffer.from(JSON.stringify({ u: adminUser, exp }), "utf8").toString(
    "base64url"
  );
  const sig = createHmac("sha256", getAppSigningSecret())
    .update(`admin:v1:${payload}`)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAdminSessionCookieValue(
  token: string,
  expectedUser: string
): boolean {
  try {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return false;
    const payloadB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expectedSig = createHmac("sha256", getAppSigningSecret())
      .update(`admin:v1:${payloadB64}`)
      .digest("hex");
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      u?: string;
      exp?: number;
    };
    if (payload.u !== expectedUser) return false;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const PAY_RESUME_MS = 90 * 24 * 60 * 60 * 1000;

export function createPayResumeToken(registrationId: string): string {
  const exp = Date.now() + PAY_RESUME_MS;
  const inner = Buffer.from(JSON.stringify({ rid: registrationId, exp }), "utf8").toString(
    "base64url"
  );
  const sig = createHmac("sha256", getAppSigningSecret())
    .update(`pay:v1:${inner}`)
    .digest("hex");
  return `${inner}.${sig}`;
}

export function verifyPayResumeToken(
  registrationId: string,
  token: string | null | undefined
): boolean {
  if (!token) return false;
  try {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return false;
    const inner = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expectedSig = createHmac("sha256", getAppSigningSecret())
      .update(`pay:v1:${inner}`)
      .digest("hex");
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(inner, "base64url").toString("utf8")) as {
      rid?: string;
      exp?: number;
    };
    if (payload.rid !== registrationId) return false;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

/** DocuSeal: https://www.docuseal.com/resources/use-webhooks */
export function verifyDocusealWebhookSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string
): boolean {
  if (!header) return false;
  const [timestamp, signature] = header.split(".", 2);
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
