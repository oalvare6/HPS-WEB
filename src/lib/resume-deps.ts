/**
 * Wires the resume handlers to production dependencies. Route files call
 * `resumeDeps(request)` and hand the result to the handler in
 * src/lib/resume-routes.ts.
 */
import { getResumeLinkSender } from "@/lib/email/resume-link-sender";
import { getResumeOps } from "@/lib/resume-ops-supabase";
import { getResumeStore } from "@/lib/resume-store-supabase";
import type { ResumeRouteDeps } from "@/lib/resume-routes";

export function siteBaseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return `https://${host}`;
}

export function resumeDeps(request: Request): ResumeRouteDeps {
  return {
    store: getResumeStore(),
    sender: getResumeLinkSender(),
    ops: getResumeOps(),
    baseUrl: siteBaseUrl(request),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  };
}
