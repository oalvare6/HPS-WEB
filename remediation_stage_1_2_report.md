# Remediation Report — Stage 1.2 (F-01 + F-02)

**Branch:** `claude/hps-remediation-stage-1-2` (audit branch `claude/houston-premier-soccer-audit-elm2ae` @ `7d872ec` untouched).
**Date:** 2026-09-09. **Scope:** `backend_audit_v1.md` F-01 (email-based capability issuance) and F-02 (Stripe payment / registration divergence), preceded by a read-only credential plan and a read-only schema reconciliation.

**Boundaries honoured:** no production row, constraint, migration, Vercel variable, Supabase setting, Stripe object or waiver record was modified. No secret value was inspected, printed or stored. Nothing was deployed or merged. The two new migrations exist only on this branch.

---

## 1. Executive result

| Item | Result |
|---|---|
| F-01 | **Closed in code.** `POST /api/pay/eligibility` no longer returns a token, id, name, status or existence signal; every caller receives the same neutral body. Access to a registration by a signed-out player now requires a one-time, 20-minute, hashed magic-link token delivered to the registered email, exchanged atomically for a server-side, hashed, 24-hour session scoped to exactly one registration and four explicit scopes. Cookie-authenticated state changes require same-origin proof. |
| F-02 | **Closed in code.** Settlement is one database transaction (`finalize_checkout_payment`) keyed by Stripe event id (delivery idempotency) and Checkout Session id (business uniqueness). Amount, currency and event association are re-derived from server-side rows and compared with the verified Stripe object before a registration is confirmed. Replays converge; the known "payment row exists, registration pending" shape is repaired by reprocessing; a local database failure is answered 5xx so Stripe retries. |
| Phase 0 | `credential_containment_plan.md` written (read-only; nothing rotated). |
| Phase 1 | `docs/core_schema_snapshot.sql` + `docs/core_schema_diff.md` written from live read-only introspection; the F-02 record verified and documented, not touched. |
| Phase 4 | `scripts/reconcile-payments.ts` (dry-run by default; `--apply` + `HPS_RECONCILE_APPLY=1` required to write; not run against production). |
| Tests | `npx tsc --noEmit` clean · `next lint` clean · **329/329** script assertions (179 original preserved + 150 new). `npm run build` result in §8. |
| Deployment | **Blocked on one prerequisite:** no transactional email provider exists in the repository, so magic links cannot be delivered until one is wired (§12). Both migrations must be applied by hand before the code ships (§13). |

---

## 2. Files created / modified

**Created — documentation**
- `credential_containment_plan.md`
- `docs/core_schema_snapshot.sql`, `docs/core_schema_diff.md`
- `remediation_stage_1_2_report.md` (this file)

**Created — migrations (NOT applied)**
- `supabase/migrations/20260909120000_registration_resume_access.sql`
- `supabase/migrations/20260909120100_stripe_payment_finalization.sql`

**Created — F-01**
- `src/lib/resume-access.ts` — token/session primitives, request → exchange → authenticate, scopes (pure, DI)
- `src/lib/resume-store-supabase.ts` — production store over the new tables/RPCs
- `src/lib/resume-session.ts` — cookie name/attributes, header parsing, server-component reader
- `src/lib/same-origin.ts` — Origin/Referer same-origin check (CSRF)
- `src/lib/email/resume-link-sender.ts` — delivery boundary; unconfigured default; test injection
- `src/lib/resume-routes.ts` — the six handlers as `(Request, deps) => Response`
- `src/lib/resume-ops-supabase.ts` — what a session may do to its one registration
- `src/lib/resume-deps.ts` — production wiring
- `src/lib/registration-cancel-server.ts` — cancel logic extracted from the legacy route, shared
- `src/app/pay/resume/page.tsx`, `src/app/pay/resume/exchange/page.tsx`
- `src/app/pay/resume/api/{exchange,checkout,cancel,waiver,sign-out}/route.ts`
- `src/components/pay/ResumePanel.tsx`, `src/components/pay/ExchangeAutoSubmit.tsx`

**Created — F-02**
- `src/lib/stripe-checkout.ts` — pricing (`priceTournamentCheckout`, pure) + session creation, extracted from the checkout route and shared with finalisation
- `src/lib/payment-finalize.ts` — facts → identify → re-read → validate → one transaction (pure, DI)
- `src/lib/payment-finalize-store-supabase.ts` — production store (RPC)
- `src/lib/stripe-webhook.ts` — webhook contract as a testable handler
- `src/lib/payment-reconcile.ts` — offline analysis/repair core
- `scripts/reconcile-payments.ts` — offline tool

**Created — tests**
- `scripts/_test-fakes.ts` (in-memory stores mirroring the SQL semantics, harness)
- `scripts/test-resume-access.ts`, `scripts/test-resume-routes.ts`, `scripts/test-payment-finalize.ts`, `scripts/test-stripe-webhook.ts`, `scripts/test-reconcile-payments.ts`

**Modified**
- `src/app/api/pay/eligibility/route.ts` — neutral resume-link request (was: status + token)
- `src/app/api/stripe/checkout/route.ts` — uses `stripe-checkout.ts`; the unauthenticated email path no longer writes to another person's registration before payment
- `src/app/api/stripe/webhook/route.ts` — wires `handleStripeWebhook`
- `src/lib/stripe-payments.ts` — `recordCheckoutSessionPayment` now delegates to the finaliser (kept for the success page and admin sync); adds `needs_review`
- `src/app/api/registrations/[id]/cancel/route.ts` — authorisation before the row read; shared cancel logic
- `src/app/pay/success/page.tsx` — honest message for `needs_review`
- `src/app/api/admin/sync-payments/route.ts` — reports `needs_review`
- `src/components/pay/PayEmailGate.tsx`, `src/components/pay/PayPageClient.tsx`, `src/app/pay/page.tsx` — "email me my link" UI, no client-side token handling
- `scripts/test-pay-eligibility-api.mjs` — manual helper updated to the neutral contract
- `CLAUDE.md` — verification list + the two invariants

Not modified (deliberately): F-03 presentation, homepage/event UI, SEO, historical migrations, `team_members`/`drop_ins` UI, `runPayEligibilityCheck` for the **signed-in** server path (identity there is the Supabase session, not an email).

---

## 3. New migrations

| File | Purpose | Forward behaviour | Data compatibility | Old code compatible during rollout? | Rollback |
|---|---|---|---|---|---|
| `20260909120000_registration_resume_access.sql` | F-01 storage | Creates `registration_access_tokens`, `registration_sessions`, `resume_link_requests`; functions `consume_registration_access_token` (atomic single-winner UPDATE … RETURNING + session INSERT) and `record_resume_link_request` (advisory-locked throttle + record); RLS on, no policies; service_role-only execute | No existing row is read or changed; FKs to `registrations(id)` only | **Yes** — old code never references these objects | Application rollback. Leave the tables (audit trail of issued links/sessions). `drop function`/`drop table` is possible but unnecessary and discards evidence |
| `20260909120100_stripe_payment_finalization.sql` | F-02 settlement | Creates `stripe_webhook_events`; functions `append_note_line`, `record_stripe_webhook_event`, `finalize_checkout_payment(jsonb)` (event-id idempotency → `payments` upsert on `stripe_session_id` → convergent registration/drop-in confirmation → mark processed, all in one transaction); RLS on, no policies; service_role-only | Writes only to existing columns confirmed in the production snapshot; never changes `payments.amount/currency/status` of an existing succeeded row; never overrides `waived`/`refunded` | **Yes** — old code keeps using its own statements; new code 5xx's (webhook) / errors (success page) if the function is absent | Application rollback. Keep `stripe_webhook_events` (the reconciliation trail) |

Neither migration is destructive, neither touches the ledger drift, and both are safe to apply in either order relative to each other. They must **not** be applied with `supabase db push` until the ledger is repaired (`docs/core_schema_diff.md` §3); use the SQL editor or the MCP `apply_migration` path by hand.

---

## 4. F-01 — before / after

**Before** (`backend_audit_v1.md` F-01):
```
browser ── POST /api/pay/eligibility {email, tournamentId} ──▶ server
        ◀── {status:'ready_to_pay', registrationId, payToken (HMAC, 90 days)} ──
browser then uses payToken on: /api/registrations/[id]/cancel, /api/register/payment-intent,
GET /api/registrations/[id] (email+name), /api/waiver/sign (youth: no name check), /api/stripe/checkout
```
Anyone who knew a registrant's email (a public tournament id is on every event page) obtained a capability over that registration. Guard: in-memory 30 req/min/IP.

**After:**
```
browser ── POST /api/pay/eligibility {email, tournamentId} ──▶ server
   1. record_resume_link_request(sha256(email), sha256(ip))  — durable throttle
   2. find live pending registration for that email on that event (+ acceptsPayments)
   3. token = 32 random bytes; INSERT registration_access_tokens{sha256(token), purpose='resume', 20 min}
   4. email link https://www…/pay/resume/exchange?t=<token>          (sender adapter)
        ◀── {success:true, message:<neutral>}   ← IDENTICAL for every input, 200, no-store

inbox ── GET /pay/resume/exchange?t=<token> ──▶ interstitial page (no consume on GET)
      ── POST /pay/resume/api/exchange {token} (same-origin) ──▶
   5. consume_registration_access_token(sha256(token)) — single-winner UPDATE, creates
      registration_sessions{sha256(secret), scopes, 24 h} in the same transaction
        ◀── 303 /pay/resume + Set-Cookie hps_resume=<secret>; Path=/pay/resume; HttpOnly; SameSite=Lax; Secure

browser ── POST /pay/resume/api/{checkout|cancel|waiver|sign-out} (cookie) ──▶
   6. same-origin check → session row lookup by hash → scope check → act on session.registration_id ONLY
```
What the session can do: read a minimal summary (event, team, waiver yes/no, fee outstanding), start online payment (Stripe session for that registration, amount from the server), cancel idempotently (card-paid rows still refused, as before), START the DocuSeal waiver flow (existing sign URL or a new submission). What it cannot do: mark cash paid, change payment status, complete a waiver, touch any other registration, read phone/DOB/emergency data, or anything administrative — there is no handler for any of it.

Timing: the request path performs the throttle write and the lookup for every input and burns a comparable hash when nothing is found; the email send itself cannot be equalised and is documented as residual.

**Legacy HMAC pay-resume token:** still minted only where the caller has *created* the registration (`/api/register` response, DocuSeal `completed_redirect_url`, signed-in `/register`, admin sign-waiver). It is no longer obtainable from an email address. Retiring it entirely is follow-up work (§16).

---

## 5. F-02 — before / after

**Before** (`src/lib/stripe-payments.ts` @ `7d872ec`):
```
webhook: constructEvent → recordCheckoutSessionPayment(session) → return 200 ALWAYS
  recordCheckoutSessionPayment:
    SELECT payments WHERE stripe_session_id → if found: return already_recorded   ← registration never re-checked
    INSERT payments                                                                 ← statement 1
    UPDATE registrations SET payment_status='paid' … (error only logged)            ← statement 2
    UPDATE drop_ins …
```
No amount/currency/event validation; no `payment_status` check on the session; no event-id ledger; success page and sync-payments shared the same short-circuit. Production instance: registration `803e3697-…` pending with a succeeded $80 payment `bbd7fa9b-…` linked to it.

**After:**
```
webhook: constructEvent (400 on failure)
  → type ∉ {checkout.session.completed, …async_payment_succeeded, …async_payment_failed} → 200 ignored
  → facts = verified session fields (id, payment_intent, payment_status, amount_total, currency, metadata)
  → finalizeCheckoutSession(facts, store, {eventId}):
       payment_status ≠ 'paid'          → record event 'not_paid', return (async methods settle later)
       identify: registration_id / drop_in_id / tournament_id from metadata (identification ONLY)
                 legacy fallback: newest live registration by email WITHIN the named event only
       re-read: registrations, tournaments, drop_ins
       validate: currency = usd; amount_total = priceTournamentCheckout(tournament, pay_kind, roster_size)
                 (or drop_ins.amount_cents); metadata.tournament_id = registration.tournament_id
       finalize_checkout_payment(jsonb)  — ONE TRANSACTION:
          event row (insert / lock; already processed → 'duplicate_event')
          payments upsert ON CONFLICT (stripe_session_id): fill missing links only
          confirm=true  : registration pending/partial → paid (+team_name/notes); paid → no-op;
                          cancelled → paid + needs_admin_review; waived/refunded → flagged, untouched
          confirm=false : payment recorded, registration flagged needs_admin_review with the reason
          drop_ins pending → paid
          event row processed_at + outcome
  → 'error' (store threw)      → 500  (Stripe retries; nothing was committed)
  → 'finalized' / 'needs_review' / 'duplicate_event' / 'not_paid' / 'skipped' → 200
success page / admin sync / reconciler → same finaliser with eventId = null (business convergence only)
```
Settlement decision (§3.3 of the task): HPS uses **Checkout Sessions, `mode: 'payment'`** (60/60 production payments carry `cs_` + `pi_` ids); the registration path does not pin payment methods, so async methods may be enabled in the Stripe dashboard. Therefore `checkout.session.completed` confirms only when `session.payment_status === 'paid'`; otherwise the event is recorded and `checkout.session.async_payment_succeeded` settles later; `…async_payment_failed` is recorded. Refund events remain unhandled (out of the stated scope; §16).

The known production row converges the first time any path reprocesses its session: webhook replay from the Stripe dashboard, a visit to its success URL, `POST /api/admin/sync-payments`, or `scripts/reconcile-payments.ts --apply`. **None of these was run.**

---

## 6. Security invariants now enforced

1. Knowledge of an email address never yields a capability: the public eligibility endpoint returns a fixed body and no identifiers (test: identical bodies for known / unknown / ineligible; store failure → same body).
2. Magic-link tokens: ≥256-bit CSPRNG, stored only as sha256, 20-minute TTL, purpose-bound, single-use, revocable; consumption is a single conditional UPDATE — exactly one winner under concurrency (test: 3 simultaneous → 1 session).
3. Resume sessions: ≥256-bit CSPRNG, stored only as sha256, 24-hour TTL, revocable, `last_used_at`; the cookie is HttpOnly, SameSite=Lax, Secure in production, Path `/pay/resume`; it carries no id, email or claims.
4. Every session is bound to one `registration_id` and an explicit scope list; handlers act only on `session.registrationId` and ignore any identifier in the request body (test: B's session with body naming A cancels B).
5. All cookie-authenticated state changes are POST, verified same-origin via `Origin` (fallback `Referer`; `Sec-Fetch-Site: cross-site` rejected; neither header → refused), on top of SameSite=Lax.
6. The resume surface has no operation that marks cash received, edits payment status, completes a waiver, refunds, or reads broad PII; the waiver action only starts the provider flow.
7. Throttling is durable (Postgres, advisory-locked), keyed by digests, with a 60 s per-email cooldown, 6/hour per email, 12/hour per IP, and no permanent lockout.
8. The legacy cancel route decides authorisation before reading the row (no 404-vs-403 existence oracle).
9. Stripe: signature verified fail-closed; metadata identifies, never authorises; the amount is re-derived server-side from `priceTournamentCheckout` — the same function that priced the checkout — so stale or foreign metadata cannot confirm a registration at the wrong price, currency or event.
10. The unauthenticated `/api/stripe/checkout` email path no longer writes `team_name`/`notes` onto another person's registration before payment.

---

## 7. Database invariants now enforced (once the migrations are applied)

| Invariant | Enforcement |
|---|---|
| One session per consumed token | `consume_registration_access_token`: token row consumed and session inserted in one transaction; `token_hash` UNIQUE on both tables |
| A token is consumed at most once | conditional `UPDATE … WHERE consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now()` |
| One Stripe event processed at most once | `stripe_webhook_events.id` PK; row locked `FOR UPDATE` inside the finaliser; `processed_at` set in the same transaction as the writes |
| One authoritative payment per Checkout Session | existing `payments_stripe_session_id_key` UNIQUE + `ON CONFLICT DO UPDATE` that fills links only |
| One payment per PaymentIntent | existing `payments_stripe_payment_intent_unique_idx` (a clash raises → 500 → retry, never a second row; test covers it) |
| Payment recorded ⇒ registration confirmed (or explicitly flagged) | same transaction in `finalize_checkout_payment`; convergent on re-run |
| A confirmation never overrides an owner decision | `waived`/`refunded` rows are flagged, not flipped; cancelled rows are flipped **and** flagged for a refund decision |
| Roster membership is one row | unchanged: `registrations_one_live_spot_idx`; finalisation never inserts registrations |
| New tables are service-role-only | RLS enabled with no policies; `REVOKE` from anon/authenticated; functions `REVOKE … FROM public, anon, authenticated; GRANT … TO service_role` (same posture as `save_match_result`) |

---

## 8. Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` (`next lint`) | no warnings or errors |
| `npm run build` | clean (exit 0); all new routes compile as dynamic: `/pay/resume`, `/pay/resume/exchange`, `/pay/resume/api/{exchange,checkout,cancel,waiver,sign-out}` |
| Original 11 scripts (`test-tournament-state` … `test-me-next-steps`) | **179/179** — unchanged |
| `scripts/test-resume-access.ts` | 41/41 |
| `scripts/test-resume-routes.ts` | 41/41 |
| `scripts/test-payment-finalize.ts` | 36/36 |
| `scripts/test-stripe-webhook.ts` | 18/18 (real Stripe signatures via `generateTestHeaderString`, no network) |
| `scripts/test-reconcile-payments.ts` | 14/14 |
| **Total** | **329/329** |

Coverage of the required cases: F-01 — equivalent responses, no bearer in response, invalid / expired / consumed / revoked token, concurrent consumption, one-registration scope, cross-registration refusal, cannot mark cash / cannot complete waiver (structural + spy), scoped idempotent cancel, origin/CSRF on every state-changing route. F-02 — bad/missing/unset-secret signature, irrelevant event, amount / currency / event mismatch, duplicate delivery, duplicate business payment (same PI), local failure not acknowledged and retried, fixture convergence exactly once, repeated convergence no-op, roster non-duplication, cancelled/waived handling, drop-in, unpaid/async sequence. Reconciliation — dry-run never mutates, orphan detected with the expected `finalize` proposal, stable repeated analysis, apply converges once, second apply no-op, duplicate flagged never auto-repaired.

**What the tests do not prove:** the two SQL functions were reviewed by hand and mirrored in `scripts/_test-fakes.ts`, but **not executed** — no Docker daemon or local Supabase stack is available in this sandbox, and remote execution is forbidden. See §17.

---

## 9. Production schema evidence used (read-only)

- `information_schema.columns` for `registrations`, `payments`, `tournaments`, `contacts`, `teams`, `drop_ins`, `waiver_signatures`, `site_settings` (PostgreSQL 17.6).
- `pg_constraint`, `pg_indexes`, `pg_policies`, `pg_trigger`, `pg_get_functiondef` for `save_match_result`, `clear_match_result`, `open_play_attendees`, `set_updated_at`; `supabase_migrations.schema_migrations` (22 rows).
- Aggregate counts only: 60 payments, all `succeeded`, all `usd`, all with `cs_` session ids and `pi_` intents; 14 default grants to anon/authenticated on `payments`/`registrations` (blocked by RLS).
- The F-02 record by id (`docs/core_schema_diff.md` §5): registration `803e3697-4476-41ea-bdaa-afec654bdf7c` (`pending`, `card`, live, youth, on a team, Community Cup, fee 8000) ⇄ payment `bbd7fa9b-d482-48f6-a6d4-c5ea47e3d7b7` (`succeeded`, 80.00 USD, `cs_live…`, `pi_…`, same event and contact). Name/email/phone not retrieved.
- Publishable key listing (public keys only): legacy `anon` enabled; one `sb_publishable_*` key exists; app does not use it.

## 10. Evidence that was unavailable

- Whether an `sb_secret_*` key or asymmetric JWT signing key exists (deliberately not queried).
- Stripe dashboard: enabled payment methods, webhook endpoint event subscriptions, delivery health. The code handles both sync and async outcomes regardless.
- Execution of the two migrations against any Postgres (no local daemon; remote forbidden).
- DocuSeal's live webhook signature scheme (unchanged here; the audit's UNVERIFIED stands).
- Whether the 2026-08-24 `updated_at` on the F-02 row was an admin edit or the lost second write.

---

## 11. Credential architecture findings (from `credential_containment_plan.md`)

- Six client initialisations; exactly one is privileged (`supabaseAdmin`, legacy `service_role` JWT via `SUPABASE_SERVICE_ROLE_KEY`) and it performs every data read and write in the app. Four anon-key clients exist only for Supabase Auth session handling. Operator scripts also use the service-role key.
- No custom JWT verification; no direct Postgres connection from code. `SUPABASE_JWT_SECRET` and `POSTGRES_*` in Vercel are unused leftovers of the integration.
- The project is on the **legacy shared-JWT-secret** key family: rotating the JWT secret regenerates `anon` and `service_role` together with **no coexistence window**, requires a full rebuild (the anon key is in the client bundle), and invalidates player access tokens (refresh tokens survive; players are transparently refreshed after the new deploy or asked to sign in once). Migrating to `sb_publishable_*`/`sb_secret_*` first would make the rotation zero-downtime; recommended, out of scope.
- Postgres password rotation affects nothing in the app. Delete the dead Vercel variables rather than rotate them in place.
- Runbook order: Postgres password → delete dead vars → rotate JWT/API keys + rebuild → verify (`/admin/diagnostics`, public pages, Google sign-in, Stripe test delivery) → prove old keys 401 → review API/Auth logs for the exposure window.

---

## 12. Deployment prerequisites

1. **Email delivery for magic links (BLOCKER for the logged-out /pay flow).** The operator chose Resend; `src/lib/email/resend-sender.ts` implements delivery over Resend's REST API (no SDK) and is selected automatically when **`RESEND_API_KEY`** and **`RESUME_EMAIL_FROM`** are set in Vercel (Production + Preview; optional `RESUME_EMAIL_REPLY_TO`). The From domain must be verified in Resend (DKIM/SPF records added at the DNS host) and the key must have "Sending access" scoped to that domain. Until both variables are present, requests are throttled, tokens are issued and expire unused, the response stays neutral, and **no link is delivered**. Signed-in players (`/register`, `/pay` server path) and players holding their own registration link are unaffected. Test: `scripts/test-resend-sender.ts`.
   **Status 2026-09-09 (operator, via browser):** `houstonpremiersoccer.com` is **Verified** in Resend (DKIM TXT `resend._domainkey`, CNAMEs `send` and `rsend` at Namecheap; apex `A`/`www`/`_dmarc`/email-forwarding untouched); a Sending-access key restricted to the domain, named `hps-web resume links (production)`, is stored in Vercel as `RESEND_API_KEY` (Sensitive, Production + Preview) with `RESUME_EMAIL_FROM = Houston Premier Soccer <noreply@houstonpremiersoccer.com>`. **This prerequisite is satisfied.** No redeploy was triggered; the variables take effect on the next deploy of this branch.
2. Apply `20260909120000_registration_resume_access.sql` and `20260909120100_stripe_payment_finalization.sql` **by hand** (SQL editor / MCP `apply_migration`), not `db push`.
3. `NEXT_PUBLIC_SITE_URL` must be the canonical `https://www.houstonpremiersoccer.com` (it anchors both the emailed link and the same-origin check; the request host is also accepted).
4. Stripe webhook endpoint should be subscribed to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` (the last two are new; harmless if absent).
5. Vercel Hobby retains ~1 h of logs: the new `stripe_webhook_events` table is now the durable trail; nothing else changes.

## 13. Ordered operator deployment plan

1. Apply migration `20260909120000_…` (F-01 objects). Verify: `select proname from pg_proc where proname in ('consume_registration_access_token','record_resume_link_request')` → 2 rows.
2. Apply migration `20260909120100_…` (F-02 objects). Verify: `finalize_checkout_payment`, `record_stripe_webhook_event`, `append_note_line` exist; `stripe_webhook_events` exists.
3. Wire the email provider (§12.1) and set any env var it needs in Vercel (Production + Preview).
4. Deploy this branch (after review/merge — not done here).
5. Smoke: `GET /pay/resume` → "This link has expired" page; `POST /api/pay/eligibility` with a known and an unknown email → byte-identical bodies; `POST /pay/resume/api/checkout` without cookie → 401; Stripe Dashboard → send a test `checkout.session.completed` → 200 and a row in `stripe_webhook_events` with outcome `needs_review` (test sessions match no local record).
6. Run `npx tsx scripts/reconcile-payments.ts` (dry run) with production env vars from a trusted machine; expect exactly the known F-02 row under `registration_pending_with_payment`. Review the output, then — as an explicit operator decision — `HPS_RECONCILE_APPLY=1 … --apply` to converge it, or replay the session's event from the Stripe dashboard. Confirm `payment_status = 'paid'` on `803e3697-…`.
7. Watch `stripe_webhook_events` for the first real completion; confirm `outcome = 'finalized'` and the registration flipped.

## 14. Rollback plan

- **Application:** revert the deploy (or the branch). Old code never reads the new tables/functions; it resumes its previous single-writer behaviour immediately. Leave both migrations in place — they are additive, and `stripe_webhook_events` / `registration_access_tokens` / `registration_sessions` are audit evidence worth keeping.
- **If a migration must be undone** (not recommended): `drop function public.finalize_checkout_payment(jsonb); drop function public.record_stripe_webhook_event(text,text,text,text,text); drop function public.append_note_line(text,text); drop table public.stripe_webhook_events;` and for F-01 the two functions and three tables. No existing table is altered by either migration, so dropping them cannot affect registrations, payments or contacts.
- **Partial rollout (code before migration):** the webhook answers 500 (Stripe retries for up to 3 days), the success page shows its honest "couldn't record" note, `/api/pay/eligibility` still answers the neutral body (nothing is issued), resume routes answer 500 on session lookup. No corruption path exists in either order.

## 15. Known production records requiring later manual reconciliation

| Record | State | Action |
|---|---|---|
| registration `803e3697-4476-41ea-bdaa-afec654bdf7c` / payment `bbd7fa9b-d482-48f6-a6d4-c5ea47e3d7b7` | succeeded $80, registration `pending` | Converge via §13 step 6. **Not fixed here.** |
| 4 payments with no `registration_id`/`drop_in_id`; 24 with no `tournament_id` (legacy) | ledger only | Will surface as `payment_unlinked` in the reconciler's dry run when inside the window; owner decides |
| 16 registrations `paid` with no `payments` row | cash / admin toggles | Indistinguishable from lost webhooks by design; unchanged (audit F-07) |

## 16. Remaining security issues outside scope

- **F-00** exposed Supabase credentials — runbook written, rotation not performed.
- **F-05** admin login has no brute-force protection.
- **F-03 / F-06 / F-07** unchanged (event-state presentation, migration ledger, observability beyond the new event table).
- The legacy HMAC pay-resume token still exists for the *creator* of a registration (90-day, stateless). It is no longer obtainable from an email, but retiring it in favour of resume sessions everywhere (DocuSeal redirect, `/register` response, admin sign-waiver) is a natural follow-up.
- `/api/register` still creates a registration that inherits a returning player's waiver on the strength of the email alone (audit F-04); out of F-01's stated scope (it issues a token only to the person who just submitted the form) but the same identity weakness.
- Refund/dispute events (`charge.refunded`) are not handled; `payment_status = 'refunded'` remains admin-only.
- `/waiver/[id]` capability page and `GET /api/registrations/[id]?token=` unchanged.
- Magic-link timing side channel: the email send happens only on the success path and cannot be equalised without a queue.

## 17. Assumptions to verify before deployment

1. **The two SQL functions run correctly on PostgreSQL 17.** They were reviewed and mirrored in the in-memory fakes but never executed. Verify on a Supabase branch or local stack first: `select public.finalize_checkout_payment('{"session_id":"cs_test_x","email":"t@example.com","amount_cents":100,"confirm":false}'::jsonb);` should insert one `payments` row and return `recorded_needs_review`; a second call must return the same payment id with `payment_inserted=false`. Then `select public.consume_registration_access_token('nope','resume','x','{}',3600)` → `{"ok":false,…}`.
2. `xmax = 0` in `RETURNING` reliably distinguishes insert from update on this Postgres version (standard behaviour; confirm on the branch).
3. Vercel forwards `x-forwarded-proto`/`x-forwarded-host` consistently for the same-origin check (the request `host` and the configured site URL are both accepted, so a mismatch fails closed rather than open).
4. Chrome/Safari treat the exchange's `303` after a POST from our own page as same-site for the `SameSite=Lax` cookie (standard; the interstitial exists precisely to avoid the cross-site GET case).
5. Stripe metadata on historical sessions carries `pay_kind` / `roster_size` for World Cup shares (it does — the checkout wrote them), so reprocessing an old World Cup session prices correctly; a session whose metadata is missing them lands in `needs_review`, never a wrong confirmation.
6. No consumer depended on `PayEligibilitySuccessBody.ready_to_pay` from the public API (the only client, `PayEmailGate`, was rewritten; the type remains for the signed-in server path).
