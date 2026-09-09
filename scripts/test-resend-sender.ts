/**
 * Resend adapter: request shape, failure handling, env resolution, no leaks.
 *
 * Run: npx tsx scripts/test-resend-sender.ts
 */
import {
  RESEND_API_URL,
  ResendResumeLinkSender,
  renderResumeLinkEmail,
  resendSenderFromEnv,
} from "../src/lib/email/resend-sender";
import { getResumeLinkSender, setResumeLinkSenderForTests } from "../src/lib/email/resume-link-sender";
import { Harness } from "./_test-fakes";

const t = new Harness();

const message = {
  to: "player@example.com",
  link: "https://www.example.com/pay/resume/exchange?t=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
  eventTitle: "Community Cup - Fall 2026",
  expiresInMinutes: 20,
};

function fakeFetch(status: number, body: unknown = { id: "email_123" }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

async function main() {
  const rendered = renderResumeLinkEmail(message);
  t.check("subject names the event", rendered.subject.includes("Community Cup"));
  t.check("text and html both carry the link", rendered.text.includes(message.link) && rendered.html.includes(message.link));
  t.check("html escapes the event title", renderResumeLinkEmail({ ...message, eventTitle: "<b>x</b>" }).html.includes("&lt;b&gt;x&lt;/b&gt;"));

  {
    const { impl, calls } = fakeFetch(200);
    const sender = new ResendResumeLinkSender({ apiKey: "test-key", from: "HPS <noreply@example.com>", fetchImpl: impl });
    const out = await sender.send(message);
    t.eq("2xx → delivered", out, { delivered: true });
    t.eq("posts to the Resend emails endpoint", calls[0].url, RESEND_API_URL);
    const headers = calls[0].init.headers as Record<string, string>;
    t.eq("bearer auth header", headers.Authorization, "Bearer test-key");
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
    t.eq("from/to/subject set", [body.from, body.to, typeof body.subject], ["HPS <noreply@example.com>", ["player@example.com"], "string"]);
    t.check("no reply_to when not configured", !("reply_to" in body));
  }

  {
    const { impl } = fakeFetch(422, { name: "validation_error", message: "bad from" });
    const sender = new ResendResumeLinkSender({ apiKey: "k", from: "x", fetchImpl: impl });
    const out = await sender.send(message);
    t.eq("4xx → not delivered, coded error, no link in the error", [out.delivered, out.error], [false, "resend_422_validation_error"]);
  }

  {
    const impl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const sender = new ResendResumeLinkSender({ apiKey: "k", from: "x", fetchImpl: impl });
    const out = await sender.send(message);
    t.eq("network error → not delivered", [out.delivered, out.error], [false, "resend_network_TypeError"]);
  }

  const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;
  t.check("env without both vars → null (unconfigured)", resendSenderFromEnv(env({})) === null && resendSenderFromEnv(env({ RESEND_API_KEY: "k" })) === null);
  t.check("env with both vars → Resend sender", resendSenderFromEnv(env({ RESEND_API_KEY: "k", RESUME_EMAIL_FROM: "a <b@c.d>" })) instanceof ResendResumeLinkSender);

  // Without env vars the default sender refuses and never claims delivery.
  delete process.env.RESEND_API_KEY;
  delete process.env.RESUME_EMAIL_FROM;
  setResumeLinkSenderForTests(null);
  const fallback = await getResumeLinkSender().send(message);
  t.eq("unconfigured default → delivered:false with a coded error", fallback, { delivered: false, error: "email_provider_not_configured" });

  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
