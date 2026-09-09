# Credential Containment Plan — Houston Premier Soccer

**Status:** READ-ONLY analysis. Nothing in this document has been executed. No credential was rotated, inspected, or output while writing it. Only environment-variable **names** appear here.

**Why this exists:** `backend_audit_v1.md` F-00 records that a `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` and `POSTGRES_PASSWORD` were reachable behind a public Vercel preview URL from 2026-06-19 to 2026-08-14 (FOLLOWUPS.md:142-146) and that rotation was deferred and never recorded. This plan tells the operator exactly what each rotation touches, in what order, and how to prove the old values are dead.

---

## 1. Supabase key architecture (as actually installed)

### 1.1 Every Supabase client initialization

| # | File / symbol | Client type | Env var NAME(s) | Key kind | Privilege | Bypasses RLS? |
|---|---|---|---|---|---|---|
| 1 | `src/lib/supabase-admin.ts` — `supabaseAdmin` (lazy Proxy over `createClient`) | **privileged / service client** | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | legacy `service_role` JWT (name and the `isJwtShape` check in `src/app/api/admin/diagnostics/auth/route.ts` imply a JWT-format key; the value was not inspected) | full read/write on every table; `auth.admin.*` (`listUsers` in `src/lib/player-auth.ts:154`) | **Yes** |
| 2 | `src/lib/supabase-server.ts` — `createSupabaseServerClient()` | **authenticated server client** (cookie-bound, `@supabase/ssr`) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | legacy `anon` JWT | anon/authenticated role under RLS; used only for `auth.getUser()` (`src/lib/player-auth.ts:34-52`) | No |
| 3 | `src/lib/supabase-server.ts` — `createSupabaseMiddlewareClient()` | **middleware / session-refresh client** | same as #2 | legacy `anon` | session refresh only (`src/middleware.ts:38-51`) | No |
| 4 | `src/lib/supabase-server.ts` — `createSupabaseRouteHandlerClient()` | **authenticated server client** (route handler) | same as #2 | legacy `anon` | `exchangeCodeForSession`, `signOut` (`src/app/auth/callback/route.ts`, `src/app/auth/signout/route.ts`) | No |
| 5 | `src/lib/supabase-browser.ts` — `createSupabaseBrowserClient()` | **public / browser client** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | legacy `anon` | OAuth sign-in start, sign-out (`OAuthButtons`, `SignOutButton`) | No |
| 6 | `scripts/*.ts`, `scripts/*.mjs` (7 files) | **privileged** (operator tooling) | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | legacy `service_role` | full | **Yes** (run by hand only) |

**Custom JWT verification:** none. No `jose`, `jsonwebtoken`, `SUPABASE_JWT_SECRET`, `POSTGRES_*` or `DATABASE_URL` reference exists in `src/` or `scripts/` (grep on 2026-09-09). Player identity is validated by the Supabase Auth server via `auth.getUser()`, never by verifying a JWT locally.

**Direct Postgres connections:** none from application code. All database access goes through PostgREST / GoTrue using the two API keys above. The Postgres password is used only by operator tooling outside this repository (Supabase dashboard, CLI, the MCP connector used for the audit).

### 1.2 Key format in use

| Family | Present in project? | Used by app? |
|---|---|---|
| Legacy `anon` (JWT) | Yes — enabled (read-only key listing during audit) | **Yes** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| Legacy `service_role` (JWT) | Presumed yes (env var name, JWT-shape probe) — value not inspected | **Yes** (`SUPABASE_SERVICE_ROLE_KEY`) |
| `sb_publishable_*` | Yes — one "default" publishable key exists, enabled | **No** (not referenced anywhere) |
| `sb_secret_*` | Unknown (secret keys were deliberately not listed) | **No** |
| JWT signing keys (asymmetric, "JWT Signing Keys" feature) vs legacy shared JWT secret | Unknown — not visible through the tools used; must be checked in Dashboard → Project Settings → JWT Keys | n/a |

Conclusion: the project runs on the **legacy shared-JWT-secret key family**. Both API keys the app holds are JWTs signed by the project's JWT secret. That single fact drives every consequence in §2.

### 1.3 Other credentials implicated by F-00 or held by the app

| Env var NAME | Consumer | Category |
|---|---|---|
| `APP_SIGNING_SECRET` (legacy alias `ADMIN_SESSION_SECRET`) | `src/lib/app-signing.ts` — admin cookie HMAC, legacy pay-resume tokens | app signing secret (rotating it signs everyone out of admin and invalidates every outstanding pay-resume link; see §2.5) |
| `ADMIN_USER`, `ADMIN_PASSWORD` | `src/app/api/admin/login/route.ts` | admin credential |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `src/lib/stripe.ts`, `src/app/api/stripe/webhook/route.ts` | payment provider (not implicated by F-00; listed for completeness) |
| `DOCUSEAL_API_KEY`, `DOCUSEAL_WEBHOOK_SECRET`, `DOCUSEAL_*_TEMPLATE_ID` | `src/lib/waiver-capture.ts`, `src/app/api/docuseal/webhook/route.ts` | waiver provider (not implicated) |
| `SUPABASE_JWT_SECRET`, `POSTGRES_PASSWORD`, other `POSTGRES_*` / `SUPABASE_*` | **nothing in this repo** — leftovers of the Vercel↔Supabase integration (FOLLOWUPS.md:154-157) | exposed per F-00; unused by the app |

---

## 2. Rotation consequences (per credential)

### 2.1 Postgres database password

- **App consumers:** none. No code path connects to Postgres directly.
- **Coexistence:** Postgres has one password per role; the change is instantaneous. Anything holding the old password (a local `psql`, the Supabase CLI `db` commands with a stored connection string, an MCP connector configured with a connection string, the dead Vercel `POSTGRES_*` variables) fails immediately.
- **Sessions invalidated:** no user sessions are affected (users never authenticate against Postgres).
- **Verify before revoking:** nothing to verify inside the app. Verify that no operator tooling you rely on uses the connection string; if it does, update it after the change.
- **Risk:** lowest of the four. Do this first.

### 2.2 Supabase API keys (`anon` + `service_role`) and the JWT secret — these are ONE rotation under the legacy scheme

Under the legacy scheme the `anon` and `service_role` keys are JWTs signed with the project's JWT secret. **Rotating the JWT secret regenerates both API keys and immediately invalidates the old ones.** You cannot rotate `service_role` alone while keeping the old `anon` key, and you cannot keep the old and new JWT secrets valid at the same time. (`docs/AUTH-RUNBOOK.md:104-132` already describes the immediate-invalidation behaviour for the service-role key.)

- **App consumers that MUST be updated together:** `SUPABASE_SERVICE_ROLE_KEY` (server + scripts) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (server, middleware, browser bundle). The anon key is compiled into the client bundle, so a **full redeploy** is required, not just an env-var save (FOLLOWUPS.md and `docs/SESSION-LOG-2026-08-14-WAIVERS.md:165-168` both record that env changes without a build did nothing).
- **Coexistence:** none under the legacy scheme. Between "rotate in Supabase" and "new deploy live" every request from the running deployment gets 401 from PostgREST/GoTrue: every public page (all read through `supabaseAdmin`), sign-in, `/pay/success`, the Stripe webhook (it will 500 and Stripe will retry — good), the DocuSeal webhook. Plan for a maintenance window of the build time (a few minutes) and do it when no match is running.
- **Active player sessions:** access tokens issued to signed-in players are JWTs signed with the old secret. After rotation `auth.getUser()` rejects them. Refresh tokens are opaque database rows and remain valid, so `@supabase/ssr` in the middleware will attempt a refresh on the next request and obtain a new access token signed with the new secret. **Do not assume this succeeds silently**: the refresh runs with the *new* anon key only after the new deploy is live, so the sequence is (a) rotate, (b) deploy, (c) players are transparently refreshed or, at worst, see the sign-in prompt once. Admin sessions are unaffected (HMAC cookie, not Supabase).
- **Alternative that permits coexistence:** migrating the app to `sb_publishable_*` / `sb_secret_*` keys (both exist as concepts in the project; a publishable key already exists). Secret keys can be created, deployed, and the old key deleted afterwards with no overlap gap, and later rotations become zero-downtime. This is a code change (two env var names, plus `isJwtShape` in the diagnostics route would need relaxing) and is **recommended but out of scope for this remediation**. If the operator chooses this route, do it *before* the JWT rotation so the JWT rotation only affects player sessions, not server access.
- **Verify before revoking the old keys:** under the legacy scheme there is no "before" — rotation *is* revocation. So the verification is the pre-flight: new values staged in Vercel for Production **and** Preview, a deploy ready to trigger, `/admin/diagnostics` bookmarked, and the Stripe/DocuSeal webhook delivery logs open.

### 2.3 JWT signing keys (if the project has been migrated to asymmetric "JWT Signing Keys")

If Dashboard → JWT Keys shows an active asymmetric key, the consequences differ: a new key can be created as *standby*, promoted, and the previous key kept for verification until all tokens issued under it expire; API keys are then independent of the JWT secret. The operator must **check which world the project is in** before starting (§3 step 0). This plan does not assume either.

### 2.4 `SUPABASE_JWT_SECRET` / `POSTGRES_*` variables in Vercel

Unused by the app. They should be **deleted from Vercel**, not rotated in place, so a future leak has nothing to find. Their underlying values are rotated by §2.1 and §2.2.

### 2.5 `APP_SIGNING_SECRET` / `ADMIN_SESSION_SECRET` (not part of F-00, but cheap to include)

Rotating it: signs the admin out (30-day cookie becomes invalid), and **invalidates every outstanding legacy pay-resume link and waiver link** (90-day HMAC tokens) — players holding a texted or emailed link would need a new one. After this remediation the resume path no longer depends on that secret (magic links are random tokens stored hashed in the database), so the cost of rotating it drops to "players who still hold old-style links". Rotate only if you have reason to believe it leaked; it was not named in F-00.

---

## 3. Operator runbook (ordered)

Do this outside a match night. Total hands-on time ~30 minutes. Keep this document open; tick each step.

**0. Establish the key scheme (2 min).** Supabase Dashboard → Project Settings → **JWT Keys**. If it says the project uses the legacy JWT secret, follow the steps as written. If asymmetric signing keys are active, read §2.3 and adapt step 3 (create standby key → promote → keep old for verification).

**1. Postgres password (5 min).** Dashboard → Project Settings → Database → **Reset database password**. Choose a new random password. Update any operator tool that stores the connection string (CLI, MCP connector config, local `.env` for scripts that use a connection string — this repo has none). Verify: a connection attempt with the *old* password is refused; the site is unaffected.

**2. Delete dead variables (3 min).** Vercel → hps-web → Settings → Environment Variables. Delete every `POSTGRES_*` and `SUPABASE_*` variable **except** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (the three the app reads — `src/lib/supabase-admin.ts`, `src/lib/supabase-server.ts`, `src/lib/supabase-browser.ts`). Check Production, Preview and Development scopes. Do not redeploy yet.

**3. Rotate the JWT secret / API keys (10 min, brief outage).**
   1. Dashboard → Project Settings → API (or API Keys) → **generate/rotate**. Under the legacy scheme this regenerates `anon` and `service_role` at once and the old values stop working immediately.
   2. Immediately paste the new `anon` value into `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the new `service_role` value into `SUPABASE_SERVICE_ROLE_KEY` in Vercel, Production **and** Preview. Mark `SUPABASE_SERVICE_ROLE_KEY` as **Sensitive**.
   3. Trigger a **fresh build** (Vercel "Redeploy" with build cache off, or an empty commit — `docs/SESSION-LOG-2026-08-14-WAIVERS.md:165-168` records why a plain redeploy was not enough).
   4. Update the local `.env.local` used for `npm run dev` and `scripts/*`.

**4. Verify the new credentials (5 min).**
   - `/admin/diagnostics` → `SUPABASE_SERVICE_ROLE_KEY + admin API` shows OK (`listUsers` canary).
   - Homepage, `/events`, `/register`, `/events/community-cup-fall-2026` render with data (all read through `supabaseAdmin`).
   - Sign in with Google on the real domain; `/me` loads. Sign out.
   - Stripe Dashboard → Webhooks → endpoint on `www` → send a test `checkout.session.completed` and confirm a 200 (the handler verifies the signature and, for a test session with no matching local record, records the event and acknowledges).
   - `GET /api/docuseal/webhook` still reports `ready: true`.

**5. Prove the old credentials fail (3 min).**
   - From a terminal that still holds the *old* service-role value: `curl -s -o /dev/null -w "%{http_code}" -H "apikey: <old>" -H "Authorization: Bearer <old>" https://<project>.supabase.co/rest/v1/tournaments?select=id` → expect **401**. (Do this from the operator's machine; never paste the value into a chat or a repository.)
   - Same probe with the old anon key → 401.
   - A `psql` attempt with the old Postgres password → authentication failure.
   - Any leftover preview deployment that might have embedded the old anon key in its bundle is harmless now; still delete stale preview deployments.

**6. Audit / log review (5 min).**
   - Supabase Dashboard → Logs → **API** and **Auth** for the exposure window (2026-06-19 → 2026-08-14) and for the last 30 days: filter for requests authenticated as `service_role` from IPs/user-agents that are not Vercel functions. Any hit is evidence of use of the leaked key and warrants a data-access review.
   - Supabase → Logs → Postgres: failed-auth spikes after step 1 tell you which tooling still held the old password.
   - Vercel → Deployments: confirm no public preview deployment remains that predates 2026-08-14.
   - Record the completion date in `FOLLOWUPS.md` so the next audit does not re-flag F-00.

**7. Optional hardening (later, separate change).** Move the app to `sb_publishable_*` / `sb_secret_*` keys so future rotations are zero-downtime and the browser bundle no longer embeds a JWT. Enable Supabase **Leaked Password Protection** advisor item (harmless; no password sign-in exists). Consider rotating `APP_SIGNING_SECRET` once the magic-link resume flow from this remediation is live and old texted links have aged out.

---

## 4. What this plan deliberately does not do

- It does not rotate anything; every step above is for the operator.
- It does not assume asymmetric JWT keys are in use; step 0 decides.
- It does not touch Stripe or DocuSeal secrets; F-00 did not implicate them (Stripe was audited clean on 2026-08-14). Rotate them only on their own evidence.
