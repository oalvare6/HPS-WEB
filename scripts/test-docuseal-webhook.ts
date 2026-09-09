/**
 * Stage 1.3 SEC-02 — the DocuSeal completion trust boundary. Tests 8–15 of
 * the stage spec, driven through the REAL route module
 * (`src/app/api/docuseal/webhook/route.ts` → `POST(request)`), with real
 * HMAC signatures over the raw request body, an injected in-memory store that
 * mirrors `claim_docuseal_webhook_event`, and an injectable clock.
 *
 * The fixture secret below is a throwaway for this script. It is not, and
 * must never be, a production value.
 *
 * Run: npx tsx scripts/test-docuseal-webhook.ts
 */
import { POST } from "../src/app/api/docuseal/webhook/route";
import { setDocusealWebhookDepsForTests } from "../src/lib/docuseal-webhook-store-supabase";
import {
  DOCUSEAL_CLAIM_STALE_SECONDS,
  DOCUSEAL_SIGNATURE_HEADER,
  DOCUSEAL_SIGNATURE_TOLERANCE_SECONDS,
  parseDocusealPayload,
  signDocusealBody,
  verifyDocusealSignature,
  type DocusealWebhookDeps,
  type DocusealWebhookStore,
} from "../src/lib/docuseal-webhook";
import { Harness, InMemoryDocusealStore } from "./_test-fakes";

const t = new Harness();

const SECRET = "whsec_TEST_ONLY_fixture_secret_not_a_real_value";
const URL_ = "https://www.example.com/api/docuseal/webhook";
const NOW = Date.parse("2026-09-09T12:00:00.000Z");

const REG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REG_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // never started signing
const REG_UNKNOWN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CONTACT_A = "11111111-1111-4111-8111-111111111111";
const CONTACT_B = "22222222-2222-4222-8222-222222222222";
const SUB_A = 5001;
const SUB_B = 5002;
const ADULT_TEMPLATE = 77;
const YOUTH_TEMPLATE = 78;

type Overrides = {
  registrationId?: string | null;
  submissionId?: number;
  submitterId?: number;
  templateId?: number;
  completedAt?: string;
  eventType?: string;
  documentUrl?: string | null;
};

/** A realistic `form.completed` payload in DocuSeal's shape. */
function payload(o: Overrides = {}): string {
  const submissionId = o.submissionId ?? SUB_A;
  const metadata = o.registrationId === null ? {} : { registration_id: o.registrationId ?? REG_A };
  return JSON.stringify({
    event_type: o.eventType ?? "form.completed",
    timestamp: "2026-09-09T11:59:58.000Z",
    data: {
      id: o.submitterId ?? 9001,
      submission_id: submissionId,
      email: "player@example.com",
      slug: "abc123",
      status: "completed",
      completed_at: o.completedAt ?? "2026-09-09T11:59:55.000Z",
      metadata,
      documents: [{ name: "waiver", url: o.documentUrl === undefined ? "https://docuseal.test/d/signed.pdf" : o.documentUrl }],
      template: { id: o.templateId ?? ADULT_TEMPLATE, name: "Adult waiver" },
      submission: { id: submissionId, status: "completed", combined_document_url: null, audit_log_url: null },
    },
  });
}

function deliver(
  rawBody: string,
  opts: { signature?: string | null; tsSeconds?: number; headers?: Record<string, string> } = {}
): Request {
  const ts = opts.tsSeconds ?? Math.floor(NOW / 1000);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "DocuSeal.com Webhook",
    ...(opts.headers ?? {}),
  };
  if (opts.signature !== null) {
    headers[DOCUSEAL_SIGNATURE_HEADER] = opts.signature ?? signDocusealBody(SECRET, rawBody, ts);
  }
  return new Request(URL_, { method: "POST", headers, body: rawBody });
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Counts every store method call, so "nothing consulted" is provable. */
function counting<T extends DocusealWebhookStore>(store: T): { store: T; calls: () => number } {
  let n = 0;
  const proxy = new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          n += 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    },
  });
  return { store: proxy, calls: () => n };
}

function build() {
  const raw = new InMemoryDocusealStore();
  raw.now = () => NOW;
  raw.add({ id: REG_A, contactId: CONTACT_A, waiverType: "adult", docusealSubmissionId: SUB_A });
  raw.add({ id: REG_B, contactId: CONTACT_B, waiverType: "adult", docusealSubmissionId: SUB_B, waiverSigned: true, waiverSignedAt: "2026-08-01T00:00:00.000Z", waiverExpiresAt: "2027-08-01T00:00:00.000Z" });
  raw.add({ id: REG_C, contactId: CONTACT_A, waiverType: "youth", docusealSubmissionId: null });
  const { store, calls } = counting(raw);
  const deps: DocusealWebhookDeps = {
    secret: SECRET,
    store,
    templateIds: { adult: ADULT_TEMPLATE, youth: YOUTH_TEMPLATE },
    now: () => new Date(raw.now()),
  };
  setDocusealWebhookDepsForTests(deps);
  return { raw, deps, calls };
}

function snapshot(raw: InMemoryDocusealStore): string {
  return JSON.stringify([...raw.registrations.values()]);
}

async function main() {
  /* ---------------- Tests 8, 9, 11: authentication ---------------- */
  {
    const { raw, calls } = build();
    const before = snapshot(raw);
    const body = payload();

    const missing = await POST(deliver(body, { signature: null }));
    t.eq("9. missing signature → 401", missing.status, 401);

    const wrongSecret = await POST(deliver(body, { signature: signDocusealBody("whsec_some_other_secret", body, Math.floor(NOW / 1000)) }));
    t.eq("8. signature under another secret → 401", wrongSecret.status, 401);

    const tampered = await POST(deliver(body, { signature: signDocusealBody(SECRET, body.replace(REG_A, REG_B), Math.floor(NOW / 1000)) }));
    t.eq("8b. signature computed over a different body → 401", tampered.status, 401);

    const flipped = signDocusealBody(SECRET, body, Math.floor(NOW / 1000));
    const lastChar = flipped.at(-1) === "0" ? "1" : "0";
    const bitFlip = await POST(deliver(body, { signature: flipped.slice(0, -1) + lastChar }));
    t.eq("8c. one hex digit changed → 401", bitFlip.status, 401);

    const garbage = await POST(deliver(body, { signature: "not-a-signature" }));
    t.eq("8d. malformed header → 401", garbage.status, 401);
    const noDigest = await POST(deliver(body, { signature: `${Math.floor(NOW / 1000)}.` }));
    t.eq("8e. timestamp with no digest → 401", noDigest.status, 401);
    const shortDigest = await POST(deliver(body, { signature: `${Math.floor(NOW / 1000)}.abcd` }));
    t.eq("8f. digest of the wrong length → 401 (no partial compare)", shortDigest.status, 401);

    const stale = await POST(deliver(body, { tsSeconds: Math.floor(NOW / 1000) - DOCUSEAL_SIGNATURE_TOLERANCE_SECONDS - 1 }));
    t.eq("11. correctly signed but 301 s old → 401 (stale)", stale.status, 401);
    const future = await POST(deliver(body, { tsSeconds: Math.floor(NOW / 1000) + DOCUSEAL_SIGNATURE_TOLERANCE_SECONDS + 1 }));
    t.eq("11b. correctly signed but 301 s in the future → 401", future.status, 401);
    const edge = verifyDocusealSignature(body, signDocusealBody(SECRET, body, Math.floor(NOW / 1000) - DOCUSEAL_SIGNATURE_TOLERANCE_SECONDS), SECRET, Math.floor(NOW / 1000));
    t.eq("11c. exactly at the tolerance edge → accepted (matches DocuSeal's own verifier)", edge.ok, true);

    t.eq("8/9/11: no store method was called for any refused delivery", calls(), 0);
    t.eq("8/9/11: no waiver state changed", snapshot(raw), before);
    t.check("refusals say nothing about registrations", !JSON.stringify(await bodyOf(missing)).match(/[0-9a-f]{8}-[0-9a-f]{4}/i));
    t.eq("refusal is no-store", missing.headers.get("cache-control"), "no-store");

    setDocusealWebhookDepsForTests({ secret: null, store: raw });
    const unconfigured = await POST(deliver(body));
    t.eq("no secret configured → 503 (fails closed; DocuSeal retries later)", unconfigured.status, 503);
    setDocusealWebhookDepsForTests({ secret: "   ", store: raw });
    t.eq("whitespace secret counts as unconfigured → 503", (await POST(deliver(body))).status, 503);
    t.eq("unconfigured secret never touched the store", snapshot(raw), before);
  }

  /* ---------------- Test 10: raw-body verification through the route ---------------- */
  {
    const { raw, calls } = build();
    const compact = payload();
    const pretty = JSON.stringify(JSON.parse(compact), null, 2);
    t.check("fixture: pretty and compact bodies are the same JSON, different bytes", pretty !== compact && JSON.stringify(JSON.parse(pretty)) === compact);

    // Signature over the compact bytes, delivered as the pretty bytes: a handler
    // that re-serialised the parsed JSON before verifying would accept this.
    const mismatch = await POST(deliver(pretty, { signature: signDocusealBody(SECRET, compact, Math.floor(NOW / 1000)) }));
    t.eq("10. signature over different bytes of the SAME JSON → 401 (raw bytes are verified, not a reconstruction)", mismatch.status, 401);
    t.eq("10b. ...and the store was never consulted", calls(), 0);

    // The same JSON signed over the bytes actually sent is fine.
    const ok = await POST(deliver(pretty));
    t.eq("10c. pretty-printed body signed over its own bytes → 200 through the real route", ok.status, 200);
    t.eq("10d. ...and the waiver is recorded", raw.registrations.get(REG_A)!.waiverSigned, true);

    // Trailing whitespace is part of the signed bytes too.
    const raw2 = build();
    const body = payload();
    const trailing = await POST(deliver(`${body}\n`, { signature: signDocusealBody(SECRET, body, Math.floor(NOW / 1000)) }));
    t.eq("10e. one extra byte after the JSON → 401", trailing.status, 401);
    t.eq("10f. nothing written", raw2.raw.registrations.get(REG_A)!.writes, 0);
  }

  /* ---------------- Test 12: only the intended registration ---------------- */
  {
    const { raw } = build();
    const beforeB = JSON.stringify(raw.registrations.get(REG_B));
    const beforeC = JSON.stringify(raw.registrations.get(REG_C));

    const res = await POST(deliver(payload()));
    const body = await bodyOf(res);
    t.eq("12. valid delivery → 200", res.status, 200);
    t.eq("12b. outcome recorded for registration A", body.outcome === "recorded" && body.registrationId === REG_A, true);
    const a = raw.registrations.get(REG_A)!;
    t.eq("12c. A is signed", a.waiverSigned, true);
    t.eq("12d. signed date is DocuSeal's completed_at, not 'now'", a.waiverSignedAt, "2026-09-09T11:59:55.000Z");
    t.eq("12e. document link stored", a.documentUrl, "https://docuseal.test/d/signed.pdf");
    t.eq("12f. contact promoted", raw.contacts.get(CONTACT_A)?.waiverSignedAt, "2026-09-09T11:59:55.000Z");
    t.eq("12g. B untouched", JSON.stringify(raw.registrations.get(REG_B)), beforeB);
    t.eq("12h. C untouched", JSON.stringify(raw.registrations.get(REG_C)), beforeC);
    t.eq("12i. exactly one write", a.writes, 1);
    const event = raw.events.get("form.completed:9001");
    t.check("12j. the event ledger holds one processed row for this submitter", event !== undefined && event.processedAt !== null && event.outcome === "recorded");
  }

  /* ---------------- Test 13: duplicates ---------------- */
  {
    const { raw } = build();
    const first = await POST(deliver(payload()));
    t.eq("13. first delivery → 200 recorded", (await bodyOf(first)).outcome, "recorded");
    const after = snapshot(raw);

    const replay = await POST(deliver(payload()));
    const replayBody = await bodyOf(replay);
    t.eq("13b. identical retry → 200 (DocuSeal must stop retrying)", replay.status, 200);
    t.eq("13c. ...flagged duplicate", replayBody.duplicate, true);
    t.eq("13d. no second write", raw.registrations.get(REG_A)!.writes, 1);
    t.eq("13e. state byte-identical after the replay", snapshot(raw), after);

    // A replay that claims a later completion must not extend validity.
    const later = await POST(deliver(payload({ completedAt: "2026-12-25T00:00:00.000Z" })));
    t.eq("13f. replay with a later completed_at → 200 duplicate", (await bodyOf(later)).duplicate, true);
    t.eq("13g. ...signed date unchanged (validity not extended)", raw.registrations.get(REG_A)!.waiverSignedAt, "2026-09-09T11:59:55.000Z");
    t.eq("13h. ...contact expiry unchanged", raw.contacts.get(CONTACT_A)?.waiverExpiresAt, raw.registrations.get(REG_A)!.waiverExpiresAt);
    t.eq("13i. still one ledger row", raw.events.size, 1);

    // Concurrent duplicate while the first is mid-flight → 503, no write.
    const { raw: raw2 } = build();
    await raw2.claimEvent({ eventKey: "form.completed:9001", eventType: "form.completed", submitterId: 9001, submissionId: SUB_A, registrationId: REG_A, staleAfterSeconds: DOCUSEAL_CLAIM_STALE_SECONDS });
    const inFlight = await POST(deliver(payload()));
    t.eq("13j. delivery while another is in flight → 503 (retry later, no write)", inFlight.status, 503);
    t.eq("13k. ...nothing written", raw2.registrations.get(REG_A)!.writes, 0);

    // The stale claim is taken over by the retry.
    raw2.now = () => NOW + (DOCUSEAL_CLAIM_STALE_SECONDS + 1) * 1000;
    const reclaimed = await POST(deliver(payload(), { tsSeconds: Math.floor(raw2.now() / 1000) }));
    t.eq("13l. after the stale window the retry takes the claim → 200 recorded", (await bodyOf(reclaimed)).outcome, "recorded");
    t.eq("13m. ...one write", raw2.registrations.get(REG_A)!.writes, 1);
    t.eq("13n. ...attempts counted", raw2.events.get("form.completed:9001")?.attempts, 2);
  }

  /* ---------------- Test 14: association ---------------- */
  {
    const { raw } = build();
    const before = snapshot(raw);

    // Metadata names B, but the submission is A's.
    const crossed = await POST(deliver(payload({ registrationId: REG_B, submissionId: SUB_A })));
    t.eq("14. valid signature, metadata names another registration → 409 submission_mismatch", crossed.status, 409);
    t.eq("14b. ...reason", (await bodyOf(crossed)).reason, "submission_mismatch");

    // Metadata names C (never started a submission) with A's submission id.
    const never = await POST(deliver(payload({ registrationId: REG_C, submissionId: SUB_A })));
    t.eq("14c. registration with no submission on file → 409", never.status, 409);

    // Metadata names A but with a submission id A is not linked to.
    const wrongSub = await POST(deliver(payload({ registrationId: REG_A, submissionId: 999 })));
    t.eq("14d. registration named, but a submission it is not linked to → 409", wrongSub.status, 409);

    // Metadata names a registration that does not exist.
    const unknownReg = await POST(deliver(payload({ registrationId: REG_UNKNOWN })));
    t.eq("14e. unknown registration id → 404", unknownReg.status, 404);

    // Adult registration, youth template delivered.
    const template = await POST(deliver(payload({ templateId: YOUTH_TEMPLATE })));
    t.eq("14f. template does not match the registration's waiver type → 409 template_mismatch", template.status, 409);
    t.eq("14g. ...reason", (await bodyOf(template)).reason, "template_mismatch");

    t.eq("14h. nothing written by any mismatched delivery", snapshot(raw), before);
    t.eq("14i. no ledger row claimed for a refused association (no poisoned key)", raw.events.size, 0);
    t.eq("14j. B still signed with its original date", raw.registrations.get(REG_B)!.waiverSignedAt, "2026-08-01T00:00:00.000Z");

    // The legitimate delivery for A still works afterwards.
    t.eq("14k. the correct delivery for A → 200 recorded", (await bodyOf(await POST(deliver(payload())))).outcome, "recorded");
  }

  /* ---------------- Test 15: unknown submission ---------------- */
  {
    const { raw } = build();
    const before = snapshot(raw);

    const noMeta = await POST(deliver(payload({ registrationId: null, submissionId: 424242 })));
    t.eq("15. no metadata, unknown submission → 404 unknown_submission", noMeta.status, 404);
    t.eq("15b. ...reason", (await bodyOf(noMeta)).reason, "unknown_submission");
    t.eq("15c. unknown submission changed nothing (B stays signed, A stays unsigned)", snapshot(raw), before);
    t.eq("15d. no ledger row for an unknown submission", raw.events.size, 0);

    // Legacy fallback: no metadata, submission known → resolved by submission id.
    const legacy = await POST(deliver(payload({ registrationId: null, submissionId: SUB_A })));
    t.eq("15e. no metadata but the submission is linked to exactly one row → 200 recorded", (await bodyOf(legacy)).outcome, "recorded");
    t.eq("15f. ...for A", raw.registrations.get(REG_A)!.waiverSigned, true);
    t.eq("15g. ...B untouched by the fallback", raw.registrations.get(REG_B)!.waiverSignedAt, "2026-08-01T00:00:00.000Z");

    // Ambiguous: the same submission id on two rows → refused, nothing written.
    const { raw: raw2 } = build();
    raw2.registrations.get(REG_C)!.docusealSubmissionId = SUB_A;
    const ambiguous = await POST(deliver(payload({ registrationId: null, submissionId: SUB_A })));
    t.eq("15h. one submission linked to two registrations → 409 ambiguous_submission", ambiguous.status, 409);
    t.eq("15i. ...neither row written", raw2.registrations.get(REG_A)!.writes + raw2.registrations.get(REG_C)!.writes, 0);
  }

  /* ---------------- Shape, ignored events, failure contract ---------------- */
  {
    const { raw } = build();
    const before = snapshot(raw);

    const notJson = await POST(deliver("{not json"));
    t.eq("malformed JSON with a valid signature → 400 (never retried forever)", notJson.status, 400);
    const noType = await POST(deliver(JSON.stringify({ data: {} })));
    t.eq("missing event_type → 400", noType.status, 400);
    const noSubmitter = await POST(deliver(JSON.stringify({ event_type: "form.completed", data: { submission_id: SUB_A } })));
    t.eq("missing submitter id → 400", noSubmitter.status, 400);
    const viewed = await POST(deliver(payload({ eventType: "form.viewed" })));
    t.eq("form.viewed → 200 acknowledged and ignored", viewed.status, 200);
    t.eq("...flagged ignored", (await bodyOf(viewed)).ignored, "form.viewed");
    const started = await POST(deliver(payload({ eventType: "form.started" })));
    t.eq("form.started → 200 ignored", started.status, 200);
    t.eq("no state changed by shape failures or ignored events", snapshot(raw), before);

    // Write failure → 500 so DocuSeal retries; the claim is left unprocessed.
    raw.failNextRecord = true;
    const failed = await POST(deliver(payload()));
    t.eq("database write failure → 500 (DocuSeal retries)", failed.status, 500);
    t.eq("...claim not marked processed", raw.events.get("form.completed:9001")?.processedAt, null);
    t.eq("...outcome noted", raw.events.get("form.completed:9001")?.outcome, "write_failed");
    t.eq("...nothing recorded", raw.registrations.get(REG_A)!.writes, 0);
    // The immediate retry finds the claim in flight (not stale yet) → 503.
    t.eq("immediate retry inside the stale window → 503", (await POST(deliver(payload()))).status, 503);
    raw.now = () => NOW + (DOCUSEAL_CLAIM_STALE_SECONDS + 5) * 1000;
    const retry = await POST(deliver(payload(), { tsSeconds: Math.floor(raw.now() / 1000) }));
    t.eq("retry after the stale window → 200 recorded", (await bodyOf(retry)).outcome, "recorded");
    t.eq("...exactly one write in the end", raw.registrations.get(REG_A)!.writes, 1);

    // Claim failure → 500, nothing written.
    const { raw: raw2 } = build();
    raw2.failNextClaim = true;
    t.eq("ledger unavailable → 500", (await POST(deliver(payload()))).status, 500);
    t.eq("...nothing written without a claim", raw2.registrations.get(REG_A)!.writes, 0);
  }

  /* ---------------- Parser details ---------------- */
  {
    const p = parseDocusealPayload(payload());
    t.eq("parser: completion event", p.kind, "completion");
    if (p.kind === "completion") {
      t.eq("parser: submitter id = data.id", p.event.submitterId, 9001);
      t.eq("parser: submission id", p.event.submissionId, SUB_A);
      t.eq("parser: registration id from server-set metadata", p.event.registrationId, REG_A);
      t.eq("parser: template id", p.event.templateId, ADULT_TEMPLATE);
    }
    const noSubmissionField = JSON.parse(payload()) as { data: Record<string, unknown> };
    delete noSubmissionField.data.submission_id;
    const p2 = parseDocusealPayload(JSON.stringify(noSubmissionField));
    t.eq("parser: falls back to data.submission.id", p2.kind === "completion" ? p2.event.submissionId : null, SUB_A);
    const badMeta = parseDocusealPayload(payload({ registrationId: "not-a-uuid" }));
    t.eq("parser: non-UUID metadata registration id is ignored, not trusted", badMeta.kind === "completion" ? badMeta.event.registrationId : "x", null);
    const upper = parseDocusealPayload(payload({ registrationId: REG_A.toUpperCase() }));
    t.eq("parser: UUID normalised to lower case", upper.kind === "completion" ? upper.event.registrationId : "x", REG_A);
    t.eq("parser: array body → malformed", parseDocusealPayload("[]").kind, "malformed");
    t.eq("parser: string id accepted", (parseDocusealPayload(payload().replace('"id":9001', '"id":"9001"')) as { event?: { submitterId: number } }).event?.submitterId, 9001);
  }

  setDocusealWebhookDepsForTests(null);
  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
