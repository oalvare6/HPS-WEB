# Remediation Report — Stage 1.3 (SEC-01 · SEC-02 · MGT-01 · cancellation freshness)

**Branch:** `claude/houston-premier-stage-1-3-lewiry`, cut from `main` @ `b54cca1` (which
contains PRs #4–#7, i.e. every Stage 1.2 production fix). The stage brief asked for the name
`claude/hps-remediation-stage-1-3`; the execution harness assigned this session the branch
above and forbids pushing to any other, so the work lives here. Rename on merge if wanted.
**Date:** 2026-09-09. **Commit:** see §2.

**Boundaries honoured.** No production row, constraint, migration, Vercel variable, Supabase
setting, Stripe object, DocuSeal object or waiver record was modified. No secret value was
read, printed, requested or stored — every credential appears in this report only by
environment-variable NAME. Production access was limited to read-only catalog and aggregate
queries (§20). Nothing was deployed or merged. The one new migration exists only on this branch.

---

## 1. Executive result

| Objective | Result |
|---|---|
| **SEC-01** email-only waiver inheritance | **Closed in code.** `POST /api/register` no longer marks a new row signed because the typed email matched a waived contact. Reuse is one pure decision (`decideWaiverReuse`) that allows it only for a Supabase-authenticated caller whose contact *is* the row's contact, for an unexpired **adult** waiver of the requested type. Youth never reuses. Registration never fails because reuse was refused; the waiver simply stays required. Inherited rows no longer copy the contact's DocuSeal submission id. |
| **SEC-02** DocuSeal trust boundary | **Closed in code; needs one migration.** The webhook verifies DocuSeal's real scheme (`X-Docuseal-Signature: <ts>.<hex HMAC-SHA256(secret, "<ts>.<raw body>")>`, ±300 s, constant-time) over the raw request bytes, through the real route handler. It resolves the registration from the server-set `metadata.registration_id`, requires that row to be linked to the delivered submission id and template, claims the event atomically per submitter in a new `docuseal_webhook_events` table, and only then calls the single waiver writer. Replays answer 200 without writing; permanent business errors answer 4xx; local failures answer 5xx so DocuSeal retries (bounded, 12×). |
| **MGT-01** legacy 90-day HMAC token | **Retired entirely.** Generator, verifier, URL builder, the minting script and every route, page and component that accepted a `payToken` are deleted or rewritten. The browser that just created a registration receives the Stage 1.2 server-side `hps_resume` session bound to that one `registration_id` (scopes `registration:read`, `payment:start`, `registration:cancel`, `waiver:start`; `waiver:sign` only for the in-app fallback). Signed-in players act through new owner-guarded `/api/registrations/[id]/*` routes. Old links fail securely and identically whether or not the registration exists; no old token is ever converted into a session. |
| **Phase 4** cancellation freshness | **Implemented.** `registration:cancel` requires a session created within 30 minutes; a stale session keeps every other scope and is told to open a fresh link. |
| Interstitial | `Cache-Control: no-store` confirmed; `Referrer-Policy: strict-origin` added (deliberately not `no-referrer`, §16); no analytics or third-party resource; GET never consumes; final URL carries nothing. |
| Tests | `npx tsc --noEmit` clean · `next lint` clean · `npm run build` exit 0 · **769/769** assertions across 22 scripts (baseline 347 preserved + 422 new). |
| Deployment | **Not done.** One additive migration to apply by hand first (§22–23); runtime smoke test in Preview still required (§19). |

---

## 2. Branch / commit

- Branch: `claude/houston-premier-stage-1-3-lewiry` (see header for the naming note).
- Base: `main` @ `b54cca1` ("Merge claude/resume-smoke-test-log … (#7)").
- Commit: the single commit on top of `b54cca1` pushed with this report (hash in the final summary and in `git log`).
- Untouched: the audit branch, every other branch, `main`.

---

## 3. Files changed

**Created — documentation**
- `docs/waiver_identity_model.md` — Phase 0 trace (current model, reuse rule, failure, target invariant, business questions)
- `remediation_stage_1_3_report.md` (this file)

**Created — migration (NOT applied)**
- `supabase/migrations/20260909130000_docuseal_webhook_events.sql`

**Created — SEC-01**
- `src/lib/waiver-reuse.ts` — `decideWaiverReuse`, the one reuse decision (pure)
- `src/lib/registration-waiver-plan.ts` — `planRegistrationWaiver`: reuse / DocuSeal / in-app, and the session scopes each grants (pure)
- `src/lib/waiver-reuse-server.ts` — `ensureWaiverForAuthenticatedOwner` (converge an owner's unsigned row)

**Created — SEC-02**
- `src/lib/docuseal-webhook.ts` — signature, payload parsing, association, claim, write; `handleDocusealWebhook(Request, deps)`
- `src/lib/docuseal-webhook-store-supabase.ts` — production store over the new table/RPC; test injection

**Created — MGT-01**
- `src/lib/account-routes.ts` — owner-guarded handlers for signed-in players (`(Request, id, deps) => Response`)
- `src/lib/account-ops-supabase.ts` — production wiring for those handlers
- `src/lib/registration-payment-method-server.ts` — declare card/cash (never settles), shared by both surfaces
- `src/lib/waiver-sign-server.ts` — in-app typed-name signature core + signing-screen context, shared by both surfaces
- `src/app/api/registrations/[id]/{payment-method,checkout,waiver-sign}/route.ts`
- `src/app/pay/resume/api/{payment-method,waiver-sign}/route.ts`
- `src/app/pay/resume/waiver/page.tsx` — in-app signing screen for a `waiver:sign` session
- `src/components/register/WaiverSigningScreen.tsx` — shared signing screen

**Created — tests**
- `scripts/test-waiver-reuse.ts` (72) · `scripts/test-docuseal-webhook.ts` (94) · `scripts/test-account-routes.ts` (79) · `scripts/test-legacy-token-retired.ts` (91) · `scripts/test-interstitial.ts` (47)

**Modified**
- `src/app/api/register/route.ts` — no email inheritance; `planRegistrationWaiver`; mints the registration session; clean `next` URLs
- `src/app/api/register/join/route.ts` — `authenticated_contact` linkage; youth/other refusals answer 409 `missing_waiver`; no token
- `src/app/api/docuseal/webhook/route.ts` — one-line adapter over `handleDocusealWebhook`
- `src/app/api/registrations/[id]/cancel/route.ts` — adapter over `handleAccountCancel` (was: token-or-session)
- `src/app/api/admin/registrations/[id]/sign-waiver/route.ts` — in-person in-app fallback mints an `ADMIN_IN_PERSON_SCOPES` session instead of a token
- `src/app/pay/page.tsx` — no token path; owed registrations redirect to `/register`
- `src/app/pay/resume/page.tsx`, `src/app/pay/resume/exchange/page.tsx` — `registered`/`signed` notices; referrer metadata
- `src/app/register/page.tsx` — cards without tokens; `decideWaiverReuse` for prefill flags
- `src/app/register/waiver/[registrationId]/page.tsx` — signed-in owner check instead of a token
- `src/lib/app-signing.ts` — `createPayResumeToken`, `verifyPayResumeToken`, `PAY_RESUME_MS`, `verifyDocusealWebhookSignature` removed; admin cookie functions kept
- `src/lib/pay-eligibility.ts`, `src/lib/pay-eligibility-types.ts` — linkage-aware resolver; no `payToken`; sync guarded by `contact_id`
- `src/lib/signup-state.ts`, `src/lib/open-play-free-entry.ts`, `src/lib/event-standing.ts` — decisions through `decideWaiverReuse`; `contact_id` on snapshots
- `src/lib/resume-access.ts` — `issueRegistrationSession`, `createSession`, `IN_APP_WAIVER_SCOPE`, `ADMIN_IN_PERSON_SCOPES`, `sessionIsFresh`, `RESUME_CANCEL_FRESHNESS_SECONDS`
- `src/lib/resume-routes.ts`, `src/lib/resume-ops-supabase.ts`, `src/lib/resume-store-supabase.ts` — payment-method + waiver-sign handlers; freshness guard; `createSession`
- `src/lib/waiver-capture.ts` — `createInPersonSubmission` accepts `completedRedirectUrl`
- `src/components/pay/PayPageClient.tsx`, `src/components/pay/ResumePanel.tsx`, `src/components/register/{CancelSpotButton,PaymentChoice,QuickJoinCard,RegistrationForm,SignupStatusCards,WaiverSignForm}.tsx` — session/owner surfaces, no tokens
- `next.config.ts` — `RESUME_EXCHANGE_HEADERS` on `/pay/resume/exchange`
- `.env.example` — `ADMIN_SESSION_SECRET` comment (admin cookie only)
- `scripts/_test-fakes.ts` — `createSession`/`ageSession`, `RecordingAccountOps`, `InMemoryDocusealStore`
- `scripts/test-resume-routes.ts` (+39), `scripts/test-open-play-free-entry.ts` (one expectation: youth never reuses)
- `scripts/verify-pay-gate-t4.mjs`, `scripts/verify-world-cup-launch.mjs` — static checks updated for the deleted files
- `CLAUDE.md`, `FOLLOWUPS.md`, `docs/PAY-GATE-ACCEPTANCE.md` (superseded banner)

**Deleted**
- `src/lib/pay-resume-url.ts` · `scripts/_mint-pay-token.ts`
- `src/app/api/registrations/[id]/route.ts` (token-authorised GET)
- `src/app/api/register/payment-intent/route.ts` · `src/app/api/register/captain-paid-ack/route.ts`
- `src/app/api/waiver/sign/route.ts` · `src/app/api/stripe/checkout/route.ts` · `src/app/api/pay/options/route.ts`
- `src/components/pay/PayForm.tsx` · `src/components/pay/EnrolledPanels.tsx`

---

## 4. Migrations created

One, additive, **not applied anywhere yet**:

`supabase/migrations/20260909130000_docuseal_webhook_events.sql`
- table `public.docuseal_webhook_events(event_key text PK, event_type, submitter_id bigint, submission_id bigint, registration_id uuid FK → registrations ON DELETE SET NULL, first_seen_at, claimed_at, processed_at, outcome, detail, attempts ≥ 1)`; two indexes; RLS on with no policies; `anon`/`authenticated` revoked.
- function `public.claim_docuseal_webhook_event(p_event_key text, p_event_type text, p_submitter_id bigint, p_submission_id bigint, p_registration_id uuid, p_stale_after_seconds integer) returns jsonb` — `INSERT … ON CONFLICT DO NOTHING`, then `SELECT … FOR UPDATE`; answers `claimed` / `duplicate` (+ `previous_outcome`) / `reclaimed` (stale unprocessed claim taken over, `attempts + 1`) / `in_flight`. `security invoker`, execute granted to `service_role` only.

Justifying invariant: **one DocuSeal completion writes waiver state at most once, and never concurrently.** DocuSeal retries any ≥ 400 up to 12 times, so duplicates are certain, not hypothetical; a per-submitter key is the strongest immutable identity in the payload (no event uuid exists). The Stage 1.2 `stripe_webhook_events` table has the same shape and purpose for Stripe; a shared table was considered and rejected because the two providers' identities and retry semantics differ and the Stripe table is keyed by Stripe event id.

Nothing existing is altered; no column is dropped; the migration ledger is not touched (§20, §21).

---

## 5. Waiver identity model — before / after

Full trace in `docs/waiver_identity_model.md`. In one table:

| | Before | After |
|---|---|---|
| Waiver subject | `contacts` row, identified by email. No child or guardian identity. | Unchanged (schema out of scope). |
| Who may reuse a contact's waiver | Anyone whose typed email resolved to the contact (`/api/register`); any signed-in player for any unsigned row found by contact **or by email fallback**; display surfaces assumed the same. | Only a Supabase session resolved to the contact that holds the waiver, for a row whose `contact_id` is that contact, adult waiver, unexpired, same type — `decideWaiverReuse`, used by every writer and every display surface. |
| Youth | Reused like adult when the type matched. | **Never reused.** Fresh guardian signature per registration. |
| What an inherited row carries | `waiver_signed_at`, `waiver_document_url`, **and the contact's `docuseal_submission_id`** (one submission on many rows). | `waiver_signed_at` (the contact's date) and `waiver_document_url` only. |
| Expiry | 365 days from signature, respected. | Unchanged, plus "expires exactly now" counts as expired. |

---

## 6. The exact inheritance path removed

`src/app/api/register/route.ts` @ `b54cca1`, lines 234–295: after inserting the row,
`isContactWaiverValid(contact, waiverType)` on the contact returned by
`upsertContactByEmail(payload.email)` → `UPDATE registrations SET waiver_signed = true,
waiver_signed_at = contact.waiver_signed_at, waiver_document_url = …, docuseal_submission_id =
contact.waiver_submission_id, docuseal_status = 'signed'` → response `waiverSkipped: true` with a
90-day `payToken`. The only "identity" consulted was the typed email string.

Two secondary paths with the same assumption were closed at the same time:
- `runPayEligibilityCheck` → `findRegistrationForPayGate` **email fallback** → `syncRegistrationWaiverFromContact` could copy a contact's waiver onto a row linked to a *different* contact (or to none). The sync now refuses unless `registration.contact_id === contact.id`, and the `UPDATE` itself carries `.eq("contact_id", contact.id)`.
- `enrollContactInTournament` (signed-in quick join) wrote the contact's `waiver_submission_id` onto the new row. It no longer does.

---

## 7. Rules that now permit historical waiver reuse

All four hold, in this order (`src/lib/waiver-reuse.ts`):

1. `waiverType === "adult"` (a youth request is refused before anything else);
2. `linkage === "authenticated_contact"` — the caller's Supabase Auth session resolved (by its verified email) to **this** contact row; `/api/register` sets it only when `getCurrentPlayer().contact.id === contact.id`, `/api/register/join` and the signed-in `/pay` render pass it because their email came from the session;
3. the registration being covered is that contact's own row (`registrations.contact_id === contact.id`, or the row is about to be inserted for it). A null `contact_id` refuses;
4. the contact's waiver is present, of the requested type, and `waiver_expires_at > now` — and `isContactWaiverValid` agrees (kept as the final word so the readable reasons and the contacts rule can never diverge).

Residual assumption, stated in the model doc: one Google-verified mailbox = one adult person. That is the strongest linkage the current schema can defend; a resume session (authority over one registration) and the retired token are refused by name.

---

## 8. Rules that force a fresh waiver

Any of: anonymous signup (typed email) · resume-session or legacy-token linkage · youth registration, whoever asks · row linked to another contact or to none · no waiver on the contact · wrong type · expired (≤ now) · unparseable expiry. Each yields `planRegistrationWaiver` mode `docuseal` (DocuSeal configured) or `in_app` (not configured), never an error: the row exists, `waiver_signed = false`, and the browser is sent to sign. The signed-in quick-join (`/api/register/join`) answers 409 `missing_waiver` with the refusal reason and routes to the full form; the `/register` status card shows *needs waiver* instead of *pay*.

---

## 9. DocuSeal webhook trust-boundary assessment

**Before.** `POST /api/docuseal/webhook` verified the signature correctly (same scheme, ±300 s, constant-time — verified against `docusealco/docuseal` `lib/webhook_urls/signatures.rb` and `lib/send_webhook_request.rb`), then resolved the registration **by `docuseal_submission_id` alone with `.single()`**, ignored the server-set `metadata.registration_id`, and wrote through `recordSignedWaiver` with no idempotency ledger. Consequences found: (a) 19 submission ids sit on 40 registrations in production (inherited copies), so `.single()` fails for every one of them; (b) a retry whose payload lacked `completed_at` would have re-stamped `waiver_signed_at = now()` and extended validity by a year; (c) nothing prevented two concurrent deliveries from both writing.

**Other writers of waiver state** (traced, unchanged): the DocuSeal *poll* in `src/lib/waiver-reconcile.ts` reads the submission the row itself is linked to over the authenticated REST API (server-to-server, association-safe by construction) and the in-app signature path, which now sits behind two explicit authorisations (§14). Both still go through the one writer `recordSignedWaiver`. No browser request can declare a DocuSeal waiver complete; a session may only *start* one (`waiver:start`).

---

## 10. Signature verification — implementation and result

`verifyDocusealSignature(rawBody, header, secret, nowSeconds)` in `src/lib/docuseal-webhook.ts`:
- header `x-docuseal-signature` must be `<1–12 digit unix seconds>.<64 hex>`; anything else is `malformed` (401);
- `|ts − now| ≤ 300 s`, else `stale` (401); the boundary is inclusive, matching DocuSeal's verifier;
- HMAC-SHA256 over `"<ts>.<raw body>"` with the timestamp *as it appeared in the header*, compared with `timingSafeEqual` after a length check (`mismatch`, 401);
- the raw body is read with `request.text()` **before** anything else; JSON is parsed only after the signature passes. Test 10 proves the route rejects a signature computed over a semantically identical but byte-different body, and accepts the same JSON when signed over the bytes actually sent;
- secret from `DOCUSEAL_WEBHOOK_SECRET`; empty/whitespace → 503 before the body is looked at. The value is never logged; refusals log only the reason.

The existing implementation was correct in algorithm; it was moved, given an injectable clock and stricter header validation, and is now exercised through the actual route module (`import { POST } from "src/app/api/docuseal/webhook/route"`) rather than a helper.

---

## 11. Idempotency and association protections

**Association (before any claim or write):**
1. `metadata.registration_id` (set by us at submission creation; must be a UUID or it is ignored) → `registrations` row must exist (404 `unknown_registration`);
2. that row's `docuseal_submission_id` must equal the delivered submission id (409 `submission_mismatch`) — a valid event for A can never mark B, and a row that never started a submission cannot be completed by one;
3. delivered `template.id` must match the configured template for the row's waiver type when both are known (409 `template_mismatch`);
4. no metadata (legacy payloads only): resolve by submission id; 0 rows → 404 `unknown_submission`, >1 rows → 409 `ambiguous_submission` (the shared-id rows of §9 are refused rather than guessed).

**Idempotency:** key `form.completed:<data.id>` (the submitter; one submitter completes once, retries carry the same id). `claim_docuseal_webhook_event` is called after association passes, so a refused delivery never poisons a key. `claimed`/`reclaimed` → write; `duplicate` → 200 `{duplicate: true}` with **no** write (a replay carrying a later `completed_at` cannot extend validity — test 13g); `in_flight` → 503. A claim whose write failed is left unprocessed (`outcome = write_failed`) and is `reclaimed` by a retry after 120 s.

**Response contract** (DocuSeal retries ≥ 400 with 2^attempt-minute backoff, 12 attempts max):

| Condition | Status | Written? | DocuSeal |
|---|---|---|---|
| `DOCUSEAL_WEBHOOK_SECRET` unset | 503 | no | retries (bounded); the GET probe reports `ready: false` |
| signature missing / malformed / stale / mismatch | 401 | no | retries, then gives up; shows red in its log (the alarm we want) |
| malformed JSON / missing ids | 400 | no | retries, then gives up |
| non-completion event (`form.viewed`, `form.started`, …) | 200 `ignored` | no | done |
| unknown registration / unknown submission | 404 | no | retries, then gives up |
| submission / template / ambiguous mismatch | 409 | no | retries, then gives up |
| lookup or ledger failure | 500 | no | retries |
| in flight | 503 | no | retries |
| duplicate | 200 `duplicate` | no | done |
| write failure | 500 | no (claim left unprocessed) | retries; reclaim after 120 s |
| recorded | 200 `recorded` | yes | done |

Note for the operator: DocuSeal's dashboard "send test webhook" carries a fixture with no matching registration and now answers **404 by design**. The probe for configuration is `GET /api/docuseal/webhook`.

---

## 12. Legacy HMAC usage map (at `b54cca1`, before removal)

| Role | Location |
|---|---|
| Generator / verifier / TTL | `src/lib/app-signing.ts` — `createPayResumeToken`, `verifyPayResumeToken`, `PAY_RESUME_MS = 90 d`, HMAC domain `pay:v1:` over `base64url({rid, exp})`, key `getAppSigningSecret()` |
| Secret env var NAME | `APP_SIGNING_SECRET`, legacy alias `ADMIN_SESSION_SECRET` (shared with the admin cookie) |
| URL builders | `src/lib/pay-resume-url.ts` — `buildPayResumeUrl/Path` (`/pay?registrationId=…&payToken=…`), `buildWaiverSignPath` (`/register/waiver/[id]?payToken=…`) |
| Minting sites | `api/register/route.ts` (every signup, incl. DocuSeal `completed_redirect_url`) · `api/register/join/route.ts` · `lib/pay-eligibility.ts` (`ready_to_pay` body) · `app/register/page.tsx` (four card props) · `api/admin/registrations/[id]/sign-waiver/route.ts` (in-person) · `scripts/_mint-pay-token.ts` |
| Consumers — privileged | `api/registrations/[id]/route.ts` GET (read summary) · `api/registrations/[id]/cancel` (cancel) · `api/register/payment-intent` (declare card/cash) · `api/stripe/checkout` (create Stripe session; also accepted unauthenticated `tournamentId`/`dropInId`) · `api/waiver/sign` (complete the in-app waiver) · `api/register/captain-paid-ack` · `api/pay/options` (PayForm data) |
| Consumers — pages | `app/pay/page.tsx` (gate bypass → `PayForm`) · `app/register/waiver/[registrationId]/page.tsx` |
| Consumers — components | `PayForm`, `EnrolledPanels`, `PaymentChoice`, `CancelSpotButton`, `WaiverSignForm`, `SignupStatusCards`, `RegistrationForm`, `QuickJoinCard` |
| Docs / emails | DocuSeal `completed_redirect_url` carried the token; docs listed in FOLLOWUPS (historical) |

**What an unexpired token could do before removal:** read the registration summary, declare card or cash, create a Stripe Checkout session, cancel the spot, complete the in-app typed-name waiver, and acknowledge captain payment — for 90 days, for anyone holding the URL (email, SMS, browser history, DocuSeal's redirect log), with no revocation.

---

## 13. Every legacy privileged consumer — removal confirmed

`scripts/test-legacy-token-retired.ts` asserts, on every run: `app-signing.ts` exports only the three admin-cookie functions; no code line in `src/`, `next.config.ts` or any non-test script references `createPayResumeToken`, `verifyPayResumeToken`, `pay:v1`, `PAY_RESUME_MS`, the URL builders, `pay-resume-url` or `payToken`; the ten files above no longer exist; `/pay`, `/register`, `/register/waiver/[id]`, `/api/register`, `/api/register/join` and the admin sign-waiver route import nothing from `app-signing`; and a token in the retired shape presented as cookie, body, query or bearer header is answered 401 by every replacement handler (read, pay, cash, cancel, waiver start, waiver sign) with no store or ops call, identically for an existing and a nonexistent registration. The `app-signing` module is imported only by `lib/admin-auth.ts` and `lib/admin-session.ts`.

`/api/stripe/checkout` deserves a note: besides the token mode it created Stripe sessions for any caller naming a `tournamentId` (the waiver-gate bypass the audit flagged). Its only caller was the deleted `PayForm`; card payment now starts only from `/api/registrations/[id]/checkout` (owner) or `/pay/resume/api/checkout` (session), both behind the waiver gate in `startCheckout`. The admin's drop-in pay link (`api/admin/drop-ins/[id]/pay-link`) creates its own session and is unaffected.

---

## 14. New immediate post-registration flow

```
POST /api/register  (anonymous or signed in; unchanged fields)
  → upsert contact → insert registration (waiver_signed=false) → link contact
  → linkage = authenticated_contact only if getCurrentPlayer().contact.id === contact.id
  → planRegistrationWaiver → reuse | docuseal | in_app
  → issueRegistrationSession(store, { registrationId, scopes })   ← Stage 1.2 primitive
      scopes = RESUME_SCOPES (+ waiver:sign only for in_app)
      row in registration_sessions (access_token_id NULL), cookie hps_resume, HttpOnly,
      SameSite=Lax, Path=/pay/resume, Max-Age 24 h
  → response { next } with Set-Cookie; the browser navigates to:
       reuse    → /pay/resume?registered=1
       in_app   → /pay/resume/waiver          (sign in-app, then /pay/resume)
       docuseal → DocuSeal sign URL; completed_redirect_url = /pay/resume?signed=1
```

No token, id or email is ever in a URL; the registration is whatever the server-side session row says. On `/pay/resume` the session may read, start card checkout, declare cash, start a waiver, cancel (fresh only), sign out. A player who loses the cookie requests a magic link from the pay page (Stage 1.2) — the same session type. The admin's in-person "sign now" fallback mints a one-hour session with `registration:read` + `waiver:sign` on the owner's laptop instead of a 90-day token.

Signed-in players on `/register` use `/api/registrations/[id]/{cancel,payment-method,checkout,waiver-sign}`: UUID → same-origin → Supabase session → `registrations.contact_id === session contact` (a stranger and a missing row get the same 403 body). The registration id in the path is not a secret; ownership is.

---

## 15. Cancellation freshness — implemented

`registration:cancel` on the resume surface requires `now − session.created_at ≤ 1800 s` (`sessionIsFresh`; unparseable `created_at` is stale). A stale session gets 403 `{reason: "stale_session"}` with copy telling the player to request a fresh link; every other scope keeps working for the full 24 h. Re-verification is a new session row from the magic-link flow (tests 29–32). `registration_sessions.created_at` already exists in production (§20). The signed-in `/api/registrations/[id]/cancel` route relies on the live Supabase session and its own ownership check; no separate freshness rule was added there.

---

## 16. Interstitial hardening result

| Item | Result |
|---|---|
| `Cache-Control: no-store` | Present on `/pay/resume/exchange` (`next.config.ts`) and on every exchange response. |
| `Referrer-Policy` | **`strict-origin`, not `no-referrer` — a deliberate deviation.** Per the Fetch standard ("append a request Origin header"), a non-CORS POST from a document whose policy is `no-referrer` is sent with `Origin: null`; the exchange's same-origin check would then refuse the form POST. `strict-origin` strips the token-bearing path and query from every Referer (same-origin included) while keeping `Origin` intact. Set both as a response header and as the page's `metadata.referrer`. |
| Analytics / third-party assets | None. The rendered tree has no `script`/`img`/`iframe`/`link`, no `href`/`src`; the module imports only `next/link`, `looksLikeRawSecret` and the auto-submit component. |
| Token in the final URL | Never: 303 → `/pay/resume`. |
| Auto-submit | Kept (`requestSubmit()`); no-JS button remains. |
| GET consumes? | No — the page imports no store; a token still exchanges after the page rendered it (test 25f). |

---

## 17. Tests

| | Result |
|---|---|
| Baseline preserved | 347/347 at `b54cca1` (17 scripts; the brief's 329 pre-dates PRs #5–#7). One expectation changed on purpose: `test-open-play-free-entry` "youth player checked against youth → free" now expects `waiver_required`. |
| New assertions | **422** — `test-waiver-reuse` 72 · `test-docuseal-webhook` 94 · `test-account-routes` 79 · `test-legacy-token-retired` 91 · `test-interstitial` 47 · `test-resume-routes` +39 |
| Total | **769/769** across 22 scripts (`test-register-phase5.ts` is a live-server script needing `.env.local`; unchanged, not counted, same as before). |
| Spec tests 1–32 | 1–7 `test-waiver-reuse`; 8–15 `test-docuseal-webhook` (through the real route `POST`, real HMAC over raw bytes, injectable clock); 16–24 `test-legacy-token-retired` (+ `test-account-routes`); 25–28 `test-interstitial` (page rendered for real, headers from `next.config.ts`); 29–32 `test-resume-routes`. |
| `npx tsc --noEmit` | clean |
| `npx next lint` | clean |
| `npm run build` | exit 0; all new routes present (`/api/registrations/[id]/{cancel,checkout,payment-method,waiver-sign}`, `/pay/resume/api/{payment-method,waiver-sign}`, `/pay/resume/waiver`) |

---

## 18. Runtime verification performed

None at the browser/runtime level. This session has no `.env.local`, no local Postgres, and no authorised way to create a preview deployment without deploying (which the brief forbids). What was verified beyond unit level: the real route module for the webhook with real signatures and real `Request` bodies; the interstitial page rendered through its actual server component; `next.config.ts` headers read from the real config; and read-only production structure (§20) confirming the Stage 1.2 tables and columns the new code relies on.

---

## 19. Runtime verification still required (deployment prerequisite)

The Stage 1.2 `formData()` incident is the reason this is a prerequisite, not a nicety. In a Preview deployment (Vercel Preview is exempt from the canonical-host redirect; Supabase redirect URLs must include it if sign-in is tested):

1. New anonymous registration on an open event → response carries `Set-Cookie: hps_resume` and `next` → lands on `/pay/resume?registered=1` (or DocuSeal / `/pay/resume/waiver`) with **no token or id in the URL**.
2. On `/pay/resume`: "Pay by card" reaches Stripe Checkout; "I'll pay cash" records `payment_method` without changing `payment_status`; "Cancel" works within 30 minutes and is refused with the fresh-link message after (age a session by editing `created_at` on a Preview database, never production).
3. Sign out → cookie cleared → `/pay/resume` shows the signed-out card.
4. Magic link: request from the pay page → email → interstitial → 303 → `/pay/resume`; re-click the used link → `?link=invalid`, still signed in in the other tab.
5. Legacy link `/pay?registrationId=<real>&payToken=<anything>` and the same with a random UUID → identical outcome (redirect to `/register?tournament=` or the pay page), nothing revealed.
6. Signed in (Google) with a valid adult waiver: confirm on `/register` → row created signed, session cookie set. Signed in as a **youth** contact: confirm → sent to sign, never quick-joined.
7. DocuSeal: with `DOCUSEAL_WEBHOOK_SECRET` set on the Preview and the Preview URL registered as a second webhook in DocuSeal, complete **one test submission created by the Preview app itself** (a fixture registration on a test event, deleted afterwards) → `docuseal_webhook_events` gets one `recorded` row; resend the same event from DocuSeal's log → 200 duplicate, no second write. Do not sign a real waiver; do not create production registrations.
8. `GET /api/docuseal/webhook` → `ready: true`.

---

## 20. Production schema evidence used (read-only, 2026-09-09)

Via the authorised Supabase MCP (`list_tables`, one catalog/aggregate `SELECT`), project `jqkiswwunrnyqjgroqtn`, plus `docs/core_schema_snapshot.sql` from Stage 1.2. No row was read individually; no PII column was selected.

| Fact | Value | Bearing |
|---|---|---|
| `registration_sessions` columns | `id, registration_id, token_hash, scopes[], created_at NOT NULL, expires_at, last_used_at, revoked_at, access_token_id NULL-able` | `createSession` (no token) and `sessionIsFresh` work against the live table; Stage 1.2 migrations are applied |
| `consume_registration_access_token` | present | magic-link flow intact |
| `docuseal_webhook_events` / `claim_docuseal_webhook_event` | **absent** | migration 20260909130000 must be applied before the new webhook code |
| `registrations.docuseal_submission_id` | `integer` | the RPC's `bigint` parameter accepts it; PostgREST `.eq` unaffected |
| `registrations.contact_id` | `uuid`, 2 rows NULL of 144 | those two rows can never reuse a waiver (fail closed) |
| registrations | 144 total, 144 with a submission id, 123 distinct ids, **19 ids shared by 40 rows**, 141 `waiver_signed` | the inherited-copy problem of §9; the legacy no-metadata fallback answers 409 for those 40 rows, the metadata path is unaffected |
| live youth registrations / contacts with a youth waiver | 17 / 13 | the population that now signs per registration |
| contacts with an unexpired waiver | 97; `waiver_source`: docuseal 95, admin_override 2 | adult reuse candidates; the audit's 39 overrides have since been replaced by real documents |
| `waiver_signatures` | 0 rows | in-app signing has never been used in production |
| (event, email) pairs with >1 live registration | 2 | the shared-family-mailbox case behind the youth decision |
| `registration_sessions` rows | 2, none with NULL `access_token_id` | no post-registration sessions exist yet, as expected |

---

## 21. Evidence unavailable

- **DocuSeal dashboard state** (webhook URL host, subscribed events, HMAC enabled, delivery log) — not reachable from this session. The operator's browser agent can confirm these without pasting any value (§26).
- **Whether `DOCUSEAL_WEBHOOK_SECRET` is set in Vercel** — env var *names* only; presence can be confirmed from `GET /api/docuseal/webhook` after deploy.
- **Migration ledger state** — not re-inspected; Stage 1.2's `docs/core_schema_diff.md` §3 stands (apply by hand, no `db push`).
- **Runtime behaviour on Vercel** — §19.
- **Whether any old `payToken` URLs are still circulating** (texts, emails, DocuSeal redirect logs) — unknowable; they fail securely either way.

---

## 22. Deployment prerequisites

1. **Apply `20260909130000_docuseal_webhook_events.sql` by hand** (SQL editor / MCP `apply_migration` by the operator), production, before or with the deploy. Without it every completion answers 500 and DocuSeal retries for its bounded window; nothing is lost but nothing is recorded.
2. **F-00 credential containment** confirmed closed (Stage 1.2 report §11) — unchanged prerequisite.
3. **Preview smoke test** of §19.
4. **DocuSeal webhook** points at `https://www.houstonpremiersoccer.com/api/docuseal/webhook` (www, never apex — CLAUDE.md "webhook trap"), subscribed to `form.completed`, HMAC signing enabled with the same secret as `DOCUSEAL_WEBHOOK_SECRET`.
5. No env var changes are required: `APP_SIGNING_SECRET` / `ADMIN_SESSION_SECRET` still sign the **admin** cookie and must stay; `DOCUSEAL_WEBHOOK_SECRET`, `DOCUSEAL_API_KEY`, the two template ids, Resend and Stripe variables are unchanged.

---

## 23. Ordered deployment procedure

1. Merge this branch (name per header) into `main` — no rebase of anyone else's history.
2. Apply the migration (§22.1). It is safe under the currently deployed code, which never reads the new objects.
3. Deploy. Verify `GET /api/docuseal/webhook` → `ready: true`.
4. Run §19 steps 1, 4, 5, 8 against production with a **cancelled-afterwards** fixture registration on a test event if the Preview run was not possible; do not sign a real waiver.
5. Watch `docuseal_webhook_events` after the first real completion: one row, `outcome = recorded`. A `write_failed` or repeated `attempts > 1` means a local failure; DocuSeal's log will show the matching 500s.
6. Optional cleanup later: cancel any lingering test fixture rows through the admin (Stage 1.2's fixture is still listed in FOLLOWUPS).

Deploy-order tolerance: code-first leaves completions retried (bounded) until the table exists; migration-first is inert. Old DocuSeal submissions created before the deploy still carry a `completed_redirect_url` of the retired shape; after signing, those players land on `/pay?registrationId=…&payToken=…`, which ignores both and routes them to `/register` (open event) or the pay page — safe, slightly less smooth, and self-limiting.

---

## 24. Rollback

Application rollback (redeploy the previous build). Keep the table — old code never reads it and the rows are the delivery audit trail. Be explicit that rolling back **restores** email-only inheritance, the 90-day token acceptance and the `.single()` webhook lookup; it should be a short-lived measure. No data written by the new code needs undoing: inherited rows differ from before only by *not* carrying a copied submission id, and sessions minted post-registration are ordinary `registration_sessions` rows that expire in 24 h.

---

## 25. Remaining security issues outside scope

- **F-00** rotation of the exposed Supabase / Postgres / JWT credentials — operator, unchanged.
- **The $80 record** and Stripe refund/dispute events — Stage 1.2 §15/§16, unchanged.
- **Youth identity.** Until a child/guardian relationship exists (Track B3), every youth registration signs afresh; `docs/waiver_identity_model.md` questions 1–2 are the operator's to answer.
- **Admin-override and imported waivers** are still accepted for adult self-service reuse because the operator vouched for them (D9); question 3.
- **Phone-based relinking** (`linkRegistrationToContact`) can move a row to a contact with a different email; reuse then refuses (contact mismatch) and the row is flagged, but the policy is open (question 4).
- **`registration_sessions` has no sweep** (only `resume_link_requests` is swept); rows are small and expire logically. A periodic delete of `expires_at < now() - 7 days` is a later hygiene item.
- **Historical docs** describing the retired flow remain as history (`docs/PAY-GATE-ACCEPTANCE.md` carries a banner; `HANDOFF-PLAYER-PAY-FLOW.md`, `WORLD-CUP-ACCEPTANCE.md`, `PROJECT-STATUS.md`, session logs untouched).
- `scripts/verify-world-cup-launch.mjs` also expects a component removed by the B6 consolidation before this stage — pre-existing, untouched.

---

## 26. Operator actions after deployment

1. Apply the migration and deploy in the order of §23.
2. **Env vars: nothing to remove.** The HMAC secret (`APP_SIGNING_SECRET`, alias `ADMIN_SESSION_SECRET`) is still required by the admin cookie. Do not delete it. (`.env.example` now says so.)
3. In the DocuSeal console, confirm without copying any value: webhook URL uses the **www** host; `form.completed` is subscribed; HMAC signing is on for that URL; the most recent deliveries after deploy show 200. Expect the console's "test webhook" button to show 404 (§11).
4. Confirm `GET https://www.houstonpremiersoccer.com/api/docuseal/webhook` reports `ready: true`.
5. Decide the business questions in `docs/waiver_identity_model.md` (youth annual reuse, shared mailboxes, override reuse) and record the answers in `docs/REBUILD-PLAN.md`.
6. If any player reports an old texted/emailed pay link "not working": expected — they sign in with Google on `/register` or request a link from the pay page.
