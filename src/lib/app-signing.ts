import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Server-only signing secret for the ADMIN session cookie. In production, set
 * `APP_SIGNING_SECRET` to a long random string (32+ bytes). Dev falls back to
 * a deterministic value from admin credentials so local setups work without
 * an extra env var.
 *
 * `ADMIN_SESSION_SECRET` is accepted as a legacy alias so existing deployments
 * don't break on the rename; if only the legacy name is set we log a one-time
 * warning so the operator can migrate.
 *
 * This secret used to also sign the 90-day "pay-resume" token that authorised
 * a player over one registration. That token was retired in Stage 1.3
 * (2026-09-09): every player capability is now a server-side, hashed,
 * revocable row in `registration_sessions` (src/lib/resume-access.ts). Nothing
 * outside the admin cookie reads this secret any more.
 */
let warnedLegacySecret = false;

export function getAppSigningSecret(): string {
  const explicit = process.env.APP_SIGNING_SECRET?.trim();
  if (explicit) return explicit;
  const legacy = process.env.ADMIN_SESSION_SECRET?.trim();
  if (legacy) {
    if (!warnedLegacySecret) {
      warnedLegacySecret = true;
      console.warn(
        "[app-signing] ADMIN_SESSION_SECRET is deprecated; rename to APP_SIGNING_SECRET."
      );
    }
    return legacy;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SIGNING_SECRET must be set in production.");
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
