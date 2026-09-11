/**
 * Delivery boundary for admin-composed messages (Stage 2.3 item B).
 *
 * Deliberately the same shape as `resume-link-sender.ts`: a contract, a Resend
 * implementation over `fetch` with no SDK, and a resolution order ending in a
 * loud default. This extends a transport the operator already chose rather than
 * introducing a second way to send mail.
 *
 * Configured by the same credentials as the resume link:
 *
 *   RESEND_API_KEY      a "Sending access" key for the verified domain
 *   RESUME_EMAIL_FROM   the From address; must be on a domain verified in Resend
 *   RESUME_EMAIL_REPLY_TO   optional, and worth setting for these: a player
 *                       replying to a payment reminder should reach a human.
 *
 * ⚠ When those are absent, nothing is sent and every recipient is recorded
 * `failed` with `email_provider_not_configured`. It does NOT pretend to
 * succeed. The Stage 2.2 development launcher strips `RESEND_*` on purpose, so
 * that is the expected behaviour in hps-dev: composing, audience resolution,
 * persistence and idempotency are all exercisable there, and the final network
 * hop is not.
 */

export type AdminEmailMessage = {
  to: string;
  subject: string;
  text: string;
  /** Optional; Resend is happy with text-only and most of these are plain. */
  html?: string;
};

export type AdminEmailResult = {
  delivered: boolean;
  /** Resend's message id, kept so a future bounce webhook can reconcile it. */
  providerId?: string;
  error?: string;
};

export interface AdminEmailSender {
  send(message: AdminEmailMessage): Promise<AdminEmailResult>;
}

export const RESEND_API_URL = "https://api.resend.com/emails";

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c
  );
}

/**
 * Plain text to a simple HTML body, matching the resume link's house style.
 *
 * The operator types plain text — newlines and all — and that text is the
 * message. This only wraps it; it never reflows or reinterprets it, because the
 * preview they approved was the plain text.
 */
export function renderAdminEmailHtml(subject: string, text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;line-height:1.5;color:#d1d5db">${escapeHtml(block).replaceAll("\n", "<br>")}</p>`
    )
    .join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0f14;color:#e5e7eb;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#22d3ee">Houston Premier Soccer</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#fff">${escapeHtml(subject)}</h1>
    ${paragraphs}
  </div>
</body></html>`;
}

export type ResendAdminSenderOptions = {
  apiKey: string;
  from: string;
  replyTo?: string | null;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

export class ResendAdminEmailSender implements AdminEmailSender {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ResendAdminSenderOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async send(message: AdminEmailMessage): Promise<AdminEmailResult> {
    try {
      const res = await this.fetchImpl(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.opts.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html ?? renderAdminEmailHtml(message.subject, message.text),
          ...(this.opts.replyTo ? { reply_to: this.opts.replyTo } : {}),
        }),
      });

      if (!res.ok) {
        let name = "unknown";
        try {
          const body = (await res.json()) as { name?: string; message?: string };
          name = body.name ?? body.message ?? name;
        } catch {
          /* body not JSON; the status is enough */
        }
        return { delivered: false, error: `resend_${res.status}_${name}` };
      }

      let providerId: string | undefined;
      try {
        const body = (await res.json()) as { id?: string };
        providerId = body.id;
      } catch {
        /* accepted, but no id we can reconcile later */
      }
      return { delivered: true, providerId };
    } catch (err) {
      return {
        delivered: false,
        error: `resend_network_${err instanceof Error ? err.name : "error"}`,
      };
    }
  }
}

class UnconfiguredAdminEmailSender implements AdminEmailSender {
  private warned = false;

  async send(message: AdminEmailMessage): Promise<AdminEmailResult> {
    if (!this.warned) {
      this.warned = true;
      console.error(
        "[admin-messages] No email provider is configured; nothing was sent. " +
          "Set RESEND_API_KEY and RESUME_EMAIL_FROM. See src/lib/email/message-sender.ts."
      );
    }
    // Never log the address or the body.
    void message;
    return { delivered: false, error: "email_provider_not_configured" };
  }
}

/** Build from the environment, or null when Resend is not configured. */
export function adminEmailSenderFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ResendAdminEmailSender | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESUME_EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return new ResendAdminEmailSender({
    apiKey,
    from,
    replyTo: env.RESUME_EMAIL_REPLY_TO?.trim() || null,
  });
}

let testOverride: AdminEmailSender | null = null;
let envSender: AdminEmailSender | null | undefined;
const unconfigured = new UnconfiguredAdminEmailSender();

/** Test-only injection. Refused in production builds. */
export function setAdminEmailSenderForTests(sender: AdminEmailSender | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setAdminEmailSenderForTests is not available in production.");
  }
  testOverride = sender;
  envSender = undefined;
}

export function getAdminEmailSender(): AdminEmailSender {
  if (testOverride) return testOverride;
  if (envSender === undefined) envSender = adminEmailSenderFromEnv();
  return envSender ?? unconfigured;
}

/** True when a real provider is configured — the UI warns before sending if not. */
export function adminEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.RESUME_EMAIL_FROM?.trim());
}
