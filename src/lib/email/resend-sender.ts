/**
 * Resend implementation of `ResumeLinkSender`.
 *
 * Talks to Resend's REST API with `fetch` — no SDK dependency. Configured by
 * two environment variables (names only; values live in Vercel):
 *
 *   RESEND_API_KEY      a "Sending access" key scoped to the verified domain
 *   RESUME_EMAIL_FROM   e.g. `Houston Premier Soccer <noreply@houstonpremiersoccer.com>`
 *                       (must be on a domain verified in Resend)
 *
 * The magic link is the only secret in the message. It is never logged here;
 * on failure only Resend's status code and error name are reported.
 */
import type { ResumeLinkMessage, ResumeLinkSender } from "@/lib/resume-access";

export const RESEND_API_URL = "https://api.resend.com/emails";

export type ResendSenderOptions = {
  apiKey: string;
  from: string;
  /** Injected in tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  replyTo?: string | null;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function renderResumeLinkEmail(message: ResumeLinkMessage): {
  subject: string;
  text: string;
  html: string;
} {
  const event = message.eventTitle ?? "your event";
  const subject = `Your Houston Premier Soccer link — ${event}`;
  const minutes = message.expiresInMinutes;

  const text = [
    `Here is your personal link for ${event}:`,
    "",
    message.link,
    "",
    `It works once and expires in ${minutes} minutes. From there you can pay online, sign your waiver, or let us know you're not coming.`,
    "",
    "If you didn't ask for this, you can ignore this email — nothing happens unless the link is opened.",
    "",
    "Houston Premier Soccer",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0f14;color:#e5e7eb;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#22d3ee">Houston Premier Soccer</p>
    <h1 style="margin:0 0 16px;font-size:20px;color:#fff">Your link for ${escapeHtml(event)}</h1>
    <p style="margin:0 0 20px;line-height:1.5;color:#d1d5db">Open it to pay online, sign your waiver, or let us know you're not coming. It works once and expires in ${minutes} minutes.</p>
    <p style="margin:0 0 24px"><a href="${escapeHtml(message.link)}" style="display:inline-block;background:#22d3ee;color:#0b0f14;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px">Open my registration</a></p>
    <p style="margin:0 0 8px;font-size:12px;color:#9ca3af">If the button doesn't work, copy this address into your browser:</p>
    <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#9ca3af">${escapeHtml(message.link)}</p>
    <p style="margin:0;font-size:12px;color:#6b7280">Didn't ask for this? Ignore it — nothing happens unless the link is opened.</p>
  </div>
</body></html>`;

  return { subject, text, html };
}

export class ResendResumeLinkSender implements ResumeLinkSender {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ResendSenderOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async send(message: ResumeLinkMessage): Promise<{ delivered: boolean; error?: string }> {
    const { subject, text, html } = renderResumeLinkEmail(message);
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
          subject,
          text,
          html,
          ...(this.opts.replyTo ? { reply_to: this.opts.replyTo } : {}),
        }),
      });

      if (!res.ok) {
        let name = "unknown";
        try {
          const body = (await res.json()) as { name?: string; message?: string };
          name = body.name ?? body.message ?? name;
        } catch {
          // body not JSON; status is enough
        }
        return { delivered: false, error: `resend_${res.status}_${name}` };
      }
      return { delivered: true };
    } catch (err) {
      return { delivered: false, error: `resend_network_${err instanceof Error ? err.name : "error"}` };
    }
  }
}

/** Build from the environment, or null when Resend is not configured. */
export function resendSenderFromEnv(env: NodeJS.ProcessEnv = process.env): ResendResumeLinkSender | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.RESUME_EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return new ResendResumeLinkSender({
    apiKey,
    from,
    replyTo: env.RESUME_EMAIL_REPLY_TO?.trim() || null,
  });
}
