/**
 * The resume-session cookie, and the one way to read it on the server.
 *
 * The cookie carries only the raw session secret. No registration id, no
 * email, no claims — the authorisation lives in `registration_sessions`, and
 * the cookie is a pointer to it that only the server can dereference.
 *
 * Path is `/pay/resume`: the resume page and its API routes live under that
 * prefix (`src/app/pay/resume/**`) precisely so nothing else on the site ever
 * receives this cookie. `SameSite=Lax` rather than `Strict` because the
 * cookie is set on the response to a top-level navigation that began in an
 * email client, and Strict cookies are withheld from the very next redirect.
 */
import { cookies } from "next/headers";
import {
  authenticateResumeSession,
  RESUME_SESSION_TTL_SECONDS,
  type ResumeSession,
} from "@/lib/resume-access";
import { getResumeStore } from "@/lib/resume-store-supabase";

export const RESUME_COOKIE_NAME = "hps_resume";
export const RESUME_COOKIE_PATH = "/pay/resume";

export function resumeCookieAttributes(maxAgeSeconds = RESUME_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: RESUME_COOKIE_PATH,
    maxAge: maxAgeSeconds,
  };
}

/** Serialised `Set-Cookie` value, for handlers that build a plain Response. */
export function serializeResumeCookie(value: string, maxAgeSeconds?: number): string {
  const attrs = resumeCookieAttributes(maxAgeSeconds);
  const parts = [
    `${RESUME_COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Path=${attrs.path}`,
    `Max-Age=${attrs.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (attrs.secure) parts.push("Secure");
  return parts.join("; ");
}

export function serializeResumeCookieClear(): string {
  const parts = [`${RESUME_COOKIE_NAME}=`, `Path=${RESUME_COOKIE_PATH}`, "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** Pull the raw cookie value out of a `Cookie` header without a parser dependency. */
export function readResumeCookieFromHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== RESUME_COOKIE_NAME) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/** For Server Components: the current resume session, or null. */
export async function getResumeSessionFromCookies(): Promise<ResumeSession | null> {
  const store = await cookies();
  const raw = store.get(RESUME_COOKIE_NAME)?.value ?? null;
  return authenticateResumeSession(getResumeStore(), raw);
}
