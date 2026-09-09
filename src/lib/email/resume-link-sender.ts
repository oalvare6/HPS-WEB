/**
 * Delivery boundary for the resume magic link.
 *
 * The repository had no transactional email provider: the only mail this app
 * ever sent went through Supabase Auth's own templates (magic-link and
 * invite), which cannot carry an arbitrary application link. The operator
 * chose Resend (2026-09-09); `resend-sender.ts` implements the contract over
 * Resend's REST API with no SDK dependency, and is selected automatically when
 * `RESEND_API_KEY` and `RESUME_EMAIL_FROM` are set.
 *
 * ⚠ Deployment prerequisite: those two variables must be set in Vercel (and
 * the From domain verified in Resend) before the logged-out /pay flow works in
 * production. Until then link requests are recorded, tokens are issued and
 * expire unused, and the public response stays neutral — but no email leaves.
 *
 * There is deliberately NO development fallback that returns the raw token
 * from the API. Tests capture tokens through `setResumeLinkSenderForTests`.
 */
import type { ResumeLinkMessage, ResumeLinkSender } from "@/lib/resume-access";
import { resendSenderFromEnv } from "@/lib/email/resend-sender";

export type { ResumeLinkMessage, ResumeLinkSender };

class UnconfiguredResumeLinkSender implements ResumeLinkSender {
  private warned = false;

  async send(message: ResumeLinkMessage): Promise<{ delivered: boolean; error?: string }> {
    if (!this.warned) {
      this.warned = true;
      console.error(
        "[resume-link] No email provider is configured. Resume links cannot be delivered. " +
          "See src/lib/email/resume-link-sender.ts and remediation_stage_1_2_report.md §12."
      );
    }
    // Log only the event shape, never the link or the address.
    void message;
    return { delivered: false, error: "email_provider_not_configured" };
  }
}

let configured: ResumeLinkSender | null = null;
let testOverride: ResumeLinkSender | null = null;

/** Register a real provider at startup (e.g. from an instrumentation hook). */
export function configureResumeLinkSender(sender: ResumeLinkSender): void {
  configured = sender;
}

/** Test-only injection. Refused in production builds. */
export function setResumeLinkSenderForTests(sender: ResumeLinkSender | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setResumeLinkSenderForTests is not available in production.");
  }
  testOverride = sender;
}

const unconfigured = new UnconfiguredResumeLinkSender();
let envSender: ResumeLinkSender | null | undefined;

/**
 * Resolution order: test override → explicitly configured sender → Resend
 * from the environment (`RESEND_API_KEY` + `RESUME_EMAIL_FROM`) → the loud
 * unconfigured default.
 */
export function getResumeLinkSender(): ResumeLinkSender {
  if (testOverride) return testOverride;
  if (configured) return configured;
  if (envSender === undefined) envSender = resendSenderFromEnv();
  return envSender ?? unconfigured;
}
