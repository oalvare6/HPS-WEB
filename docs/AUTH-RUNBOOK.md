# Auth on-call runbook

Operator runbook for HPS player auth. Use this when production sign-in is
broken or a credential needs rotating. For first-time setup or anything not
listed here, see [docs/AUTH-CONFIG.md](./AUTH-CONFIG.md).

Companion surfaces, in the order to reach for them during an incident:

1. **`/admin/diagnostics`** — first stop. Live probe of env vars and Supabase
   reachability. See [Reading /admin/diagnostics](#reading-admindiagnostics)
   below.
2. **`scripts/smoke-auth.ts`** — non-destructive walk of every entry point.
   Run with `AUTH_SMOKE=1 npx tsx --env-file=.env.local scripts/smoke-auth.ts`.
3. **Supabase Dashboard → Authentication** — settings of last resort. Linked
   inline below.

## Triage by symptom

| Symptom | Most likely cause | Start at |
|---|---|---|
| "No magic-link email arrives" | Custom SMTP off, SPF/DKIM missing, or template missing `{{ .ConfirmationURL }}` | [Email deliverability](#email-deliverability) |
| "I can't get MX / SPF / DKIM records to stick on Namecheap (or any registrar)" | Switch off the transactional-provider path and use Gmail SMTP — no DNS needed | [docs/AUTH-CONFIG.md §4a](./AUTH-CONFIG.md#4a-gmail-smtp--recommended-when-dnsmx-records-arent-workable) |
| "Magic link arrives but clicking it fails" | Redirect URL allow list missing the origin | [Redirect URL allow list](#redirect-url-allow-list) |
| "Continue with Google fails with `redirect_uri_mismatch`" | Google's Authorized redirect URI doesn't point at Supabase | [Rotating Google OAuth](#rotating-google-oauth-secret) |
| "Continue with Apple fails for everyone with `invalid_client`" | Apple JWT client secret expired (6-month max validity) | [Rotating Apple JWT](#rotating-apple-sign-in-jwt) |
| "Two `auth.users` rows for the same email" | "Confirm email" disabled in Supabase Email provider settings | [Identity-merge silent duplicates](#identity-merge-silent-duplicates) |
| "Service-role calls 401" | `SUPABASE_SERVICE_ROLE_KEY` rotated and Vercel still has the old one | [Rotating Supabase service-role key](#rotating-supabase-service-role-key) |
| "Sign-in worked locally, fails on a Vercel preview" | Preview origin not on the redirect allow list | [Redirect URL allow list](#redirect-url-allow-list) |
| "`/admin/diagnostics` says reachable=no" | `NEXT_PUBLIC_SUPABASE_URL` wrong/missing or Supabase project paused | [Reading /admin/diagnostics](#reading-admindiagnostics) |
| "Password reset link lands on `/login?error=recovery_expired`" | Link already used, > 1h old, or `next=/auth/reset` not minted | [Password recovery dead-ends](#password-recovery-dead-ends) |

## Rotating Google OAuth secret

When to rotate: leaked client secret, departing operator with console access,
or routine 12-month rotation. Plan ~10 minutes.

1. **Mint a fresh secret in Google Cloud.** Console → APIs & Services →
   Credentials → click the OAuth client used for HPS → **Add secret** (Google
   supports two simultaneous active secrets so you can rotate without
   downtime). Copy the new secret.
2. **Paste into Supabase.** Project → Authentication → Providers → Google.
   Update **Client Secret (for OAuth)** with the new value. Leave Client ID
   alone. Save.
3. **Probe.** Open an incognito window, navigate to `/login`, click "Continue
   with Google" with a Google account you can sign in to. Expect to land on
   `/me`.
4. **Revoke the old secret.** Back in Google Cloud Console, delete the old
   secret entry from the OAuth client.

Notes:

- Authorized redirect URI on the Google side must remain
  `https://<your-project-ref>.supabase.co/auth/v1/callback`. Never the HPS
  origin. If you see `redirect_uri_mismatch`, this is what's wrong.
- Authorized JavaScript origins must include `https://houstonpremiersoccer.com`
  and any preview / local origin you actually use.
- If the rotation will be done before a known leak window, do step 4 first
  and step 2 second — Supabase will start failing Google sign-in for ~30s
  while the secret propagates.

## Rotating Apple Sign In JWT

When to rotate: routine (Apple's JWT has a hard 6-month max validity), key
file lost, or after a leak. Plan ~20 minutes.

1. **Locate the `.p8` private key.** Saved in your password manager when the
   key was created (Apple only lets you download it once). If it's lost,
   skip ahead — you'll create a new key in step 5.
2. **Confirm the Apple identifiers you need.** Apple Developer Console →
   Membership → note the **Team ID**. Apple Developer Console → Identifiers →
   the existing Services ID (e.g. `com.houstonpremiersoccer.web.signin`) →
   note its **Identifier**. Apple Developer Console → Keys → the existing
   key → note the **Key ID**.
3. **Mint a fresh JWT.** If Supabase's in-dashboard "Generate client secret"
   tool is available for your project (Authentication → Providers → Apple),
   paste in Team ID, Services ID, Key ID, and the `.p8` contents. Otherwise
   run a small Node script per Apple's docs to produce a JWT with
   `iss = <team-id>`, `sub = <services-id>`, `aud = "https://appleid.apple.com"`,
   and a 6-month `exp`.
4. **Paste into Supabase.** Authentication → Providers → Apple. Update
   **Client Secret (for OAuth)** with the new JWT. Save.
5. **(If the `.p8` is lost.)** Apple Developer Console → Keys → `+` → create
   a fresh Sign In With Apple key. Download the `.p8` (one-time only — store
   it in the password manager *immediately*). Note the new Key ID. Use this
   key for step 3 going forward, then **revoke** the old key from the Keys
   list.
6. **Probe.** Incognito → `/login` → "Continue with Apple" with an Apple ID
   you can sign in to. Expect to land on `/me`.
7. **Calendar reminder.** Set a recurring reminder 5 months out to redo this
   procedure before the new JWT expires. The symptom of expiry is
   `invalid_client` on every Apple attempt.

Notes:

- The Services ID's Return URLs must remain
  `https://<your-project-ref>.supabase.co/auth/v1/callback`. Apple won't let
  you accidentally point this at the HPS origin, but verify if you've made
  any Service ID edits.
- Apple-private email relay addresses
  (`xxxx@privaterelay.appleid.com`) are treated as the canonical email for
  identity merge purposes. The player's real Apple ID email is never
  delivered to us.

## Rotating Supabase service-role key

When to rotate: leaked key, departing operator, suspicious admin-API access
in Supabase logs. Plan ~15 minutes (mostly waiting for redeploy).

1. **Generate a new key.** Supabase Dashboard → Project Settings → API →
   **Reveal** the existing `service_role` key (copy to clipboard as a
   backup). Click **Regenerate** to mint a fresh key. **WARNING**: the old
   key is invalidated immediately on Supabase's side, so any in-flight
   request from a deployed function with the old key will start 401-ing
   within seconds.
2. **Update Vercel env vars.** Project → Settings → Environment Variables.
   Find `SUPABASE_SERVICE_ROLE_KEY` and update it for Production, Preview,
   and Development. Set the new value and Save.
3. **Redeploy production.** Trigger a fresh production deploy from Vercel
   (CI push, or "Redeploy" on the latest production deployment with
   "Use existing Build Cache" off). The service role key is read at runtime,
   but redeploying flushes any cached module state.
4. **Probe.** Open `/admin/diagnostics` and confirm `SUPABASE_SERVICE_ROLE_KEY
   + admin API` shows `OK`. The `listUsers` probe in the diagnostics route
   is the canary.
5. **Local `.env.local`.** If you regularly run `npm run dev` or the smoke
   script, update your local `.env.local` with the new key.

Blast radius if you skip step 3: `/pay/success`, the Stripe webhook claim
invite, the diagnostics page, the smoke script, and any admin-API page that
uses `supabaseAdmin` (registrations list, teams, tournament admin) will all
401 until the redeploy lands. Skip this rotation during a tournament
weekend.

## Email deliverability

Magic-link, password-reset, and claim-invite emails all flow through the
same Supabase Auth mailer. If one is missing, all three are likely missing.

Checklist, in order:

1. **Custom SMTP is on.** Supabase Dashboard → Authentication → SMTP Settings
   → **Enable Custom SMTP** is toggled. Supabase's built-in mailer is
   rate-limited and routinely gets junked — never rely on it in production.
2. **Sender domain matches a domain you control.** The Sender email under
   SMTP Settings should be `noreply@houstonpremiersoccer.com` or similar.
   Apple's SiwA in particular requires the sending domain to be verified
   for the From address.
3. **SPF, DKIM, DMARC at the DNS host.** Each of Resend / Postmark /
   SendGrid / SES gives you a set of TXT records — every one of them needs
   to be present at the domain's DNS provider. Gmail and Outlook silently
   delay or junk messages from domains without DKIM. Check with
   `dig TXT <sending-domain>` from any shell.
4. **Email template uses `{{ .ConfirmationURL }}`.** Supabase Dashboard →
   Authentication → Email Templates → **Magic Link**, **Reset Password**,
   and **Invite User**. Each template body must contain the
   `{{ .ConfirmationURL }}` variable; if a previous operator hard-coded an
   old URL, links will point at the old domain.
5. **Test against a real inbox you control.** Submit a magic link from
   `/login`. Expected delivery: under 60 seconds. If not arriving after
   ~2 minutes, check spam, then check the Supabase Auth logs.

If only specific recipients are missing the email but others receive it:
the issue is on the recipient's side (their provider is blocking us, their
inbox is full, their MX records are misrouting). The fix is on their side,
not ours.

## Redirect URL allow list

Supabase rejects any callback whose origin is not on the allow list. The
list must include every origin you actually use, not just production:

```
https://houstonpremiersoccer.com/auth/callback
http://localhost:3000/auth/callback
https://*-your-vercel-team.vercel.app/auth/callback     # preview wildcard
https://<a-stable-preview-alias>.vercel.app/auth/callback # if you use stable aliases
```

Edit at Supabase Dashboard → Authentication → URL Configuration →
**Redirect URLs**.

`/admin/diagnostics` lists the URLs the app expects under "Expected redirect
URLs". Cross-check that block against the dashboard.

## Identity-merge silent duplicates

Symptom: a single human ends up with two `auth.users` rows — usually one
from magic link / password and a second from Google or Apple. The `/me`
session points at whichever identity they used last; their registrations
appear under one row but their waiver under the other.

Root cause is almost always:

- Supabase Dashboard → Authentication → Providers → **Email** → "Confirm
  email" was disabled, OR
- The email on file at the OAuth provider was not the same as the email
  used for magic link / password (Apple SiwA private relay can cause this
  if the user previously used their real Apple ID email).

Recovery, per duplicate:

1. Decide which `auth.users` row to keep — usually the one with the longer
   identity history.
2. In Supabase Studio → Authentication → Users → click the row to **delete**
   → confirm. This deletes that auth user but does **not** touch `contacts`
   or `registrations`.
3. Confirm the surviving auth user has both identities. If not, the player
   will need to re-link the missing one (sign in again with the other
   provider once "Confirm email" is back on).
4. Turn "Confirm email" back on. Document the incident in `FOLLOWUPS.md` so
   we can catch a repeat.

Prevention: never disable "Confirm email" once OAuth is live. This is
documented in [docs/AUTH-CONFIG.md](./AUTH-CONFIG.md) section 7.

## Password recovery dead-ends

Symptom: clicking a "Reset your password" link lands on
`/login?error=recovery_expired`.

Causes, in order of likelihood:

1. **Link was already used.** Recovery codes are one-shot.
2. **Link is older than the Supabase recovery TTL.** Default is 1 hour. The
   player needs a fresh "Forgot password" submission.
3. **`next=/auth/reset` was stripped.** The app mints recovery links with
   `redirectTo: <origin>/auth/callback?next=/auth/reset`. If a corporate
   proxy or aggressive link-rewriter is stripping query strings, the
   callback defaults `next` to `/auth/reset` only when `type=recovery` is
   present. If the link came in via Outlook ATP or similar, recommend the
   player open the email in a different client.

Recovery: ask the player to submit "Forgot your password?" again. If two
attempts in a row both 404 or 500, escalate to
[Email deliverability](#email-deliverability).

## Reading /admin/diagnostics

The page at `/admin/diagnostics` (admin login required) renders the JSON
returned by `[src/app/api/admin/diagnostics/auth/route.ts](../src/app/api/admin/diagnostics/auth/route.ts)`.

What each check means:

| Check | OK means | Fail means |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL is set` | Server env present | Vercel env var is missing or empty |
| `Supabase project responds (auth health)` | `GET /auth/v1/health` returned 200 | Project paused, URL wrong, or network blocked |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY shape` | Value parses as a 3-segment JWT | Value missing or not a JWT (probably wrong env var) |
| `SUPABASE_SERVICE_ROLE_KEY + admin API` | `listUsers` probe succeeded | Key wrong / rotated, or admin API offline |
| `NEXT_PUBLIC_SITE_URL` | Set to canonical origin | Falls back to request host; OAuth redirects can break |
| `Supabase Auth Site URL` | API echoes expected | Verify in dashboard manually |
| `Supabase Redirect URL allow list` | Always "Verify in dashboard" | See [Redirect URL allow list](#redirect-url-allow-list) |
| `Custom SMTP + DNS (SPF/DKIM)` | Always "Verify in dashboard" | See [Email deliverability](#email-deliverability) |
| `Magic Link email template uses {{ .ConfirmationURL }}` | Always "Verify in dashboard" | See [docs/AUTH-CONFIG.md](./AUTH-CONFIG.md) section 3 |

The page also lists every redirect URL the app expects to see on the
allow list (production callback, localhost callback, and a callback for
`NEXT_PUBLIC_SITE_URL` if set).

## Running the smoke script

The smoke script is non-destructive: it mints magic-link / recovery emails
but does not consume them. Pointed at a real inbox, you can let the actual
links arrive and then ignore them. Pointed at a synthetic test address, the
emails are simply dropped on the floor.

```bash
AUTH_SMOKE=1 \
AUTH_SMOKE_EMAIL=runbook-test@example.com \
npx tsx --env-file=.env.local scripts/smoke-auth.ts
```

Optional env vars:

- `AUTH_SMOKE_BASE_URL` — default `http://localhost:3000`. Set to a
  deployed origin to smoke production. Be aware: the production smoke
  fires real emails to whatever inbox you specify.
- `AUTH_SMOKE_PASSWORD` — if set, the script also tests password sign-in
  and `/api/me/status` against a logged-in session.

The script writes one JSON line per step to stdout. Each line has
`{ step, ok, ms, detail }`. Diff against a known-good run to spot
regressions.

Without `AUTH_SMOKE=1` the script exits 0 immediately so it's safe to wire
into CI without burning auth quota.

## Quick links

- Supabase Dashboard: https://supabase.com/dashboard
- Project URL configuration: Dashboard → Authentication → URL Configuration
- Email templates: Dashboard → Authentication → Email Templates
- SMTP settings: Dashboard → Authentication → SMTP Settings
- Providers: Dashboard → Authentication → Providers
- API keys (service role): Dashboard → Project Settings → API
- Google Cloud Console: https://console.cloud.google.com/apis/credentials
- Apple Developer Console: https://developer.apple.com/account/resources/identifiers/list
- Vercel project env vars: Vercel Dashboard → Project → Settings → Environment Variables
