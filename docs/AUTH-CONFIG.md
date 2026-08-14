# Supabase Auth — production operator checklist

Use this checklist when magic-link emails fail to arrive, OAuth redirects break, or
auth works locally but not on production. Pair with the live diagnostics page at
`/admin/diagnostics` (admin login required).

## 1. Site URL (Supabase Dashboard) — READ THIS FIRST

**Path:** Project → Authentication → URL Configuration → **Site URL**

Set to the canonical production origin, **no trailing slash**:

```
https://www.houstonpremiersoccer.com
```

> ### ⚠ This setting broke sign-in for everyone, silently, for two days.
>
> Until 2026-08-14 the Site URL was `https://hps-web-oalvare6s-projects.vercel.app/`
> and the Redirect URLs listed only `*.vercel.app` hosts. Nothing matched
> `www.houstonpremiersoccer.com/auth/callback`.
>
> **Supabase does not error when `redirectTo` is not on the allow list. It
> substitutes the Site URL and carries on.** So the OAuth code was delivered to
> the wrong origin, `/auth/callback` never ran, and the PKCE verifier the
> browser had stored for `www` did not exist on the `.vercel.app` origin — so
> `exchangeCodeForSession` could never succeed. `.vercel.app` is also on the
> Public Suffix List, so a cookie set there can never be read by
> `houstonpremiersoccer.com` regardless.
>
> Evidence at the time: `auth.identities` had a `google` row created
> 2026-08-13 23:44, but `auth.sessions` had **nothing newer than 2026-07-01**,
> and the project reported **1 monthly active user**. An identity with no
> session is the fingerprint of this exact misconfiguration.
>
> **Symptom to recognise:** sign-in "does nothing", or lands the player on an
> unfamiliar hostname. Check this allow list before reading a line of code.

## 2. Redirect URLs (allow list)

**Path:** Project → Authentication → URL Configuration → **Redirect URLs**

Every origin that will receive an auth callback must be listed. Current set:

```
https://www.houstonpremiersoccer.com/**
https://houstonpremiersoccer.com/**
https://hps-web-oalvare6s-projects.vercel.app/**
https://hps-web-*-oalvare6s-projects.vercel.app/**
http://localhost:3000/**
```

The app passes OAuth `redirectTo` as `<origin>/auth/callback` (optionally with
`?next=`), so the `/**` suffix is what makes each entry cover it.

**Get the wildcard position right.** Vercel preview hostnames are
`hps-web-<hash>-oalvare6s-projects.vercel.app`. An entry like
`https://hps-*-web-oalvare6s-projects.vercel.app` — wildcard between `hps-` and
`-web` — matches nothing at all. That typo was live until 2026-08-14.

**Common failure:** production works but previews don't, because only the
production origin is listed. Per §1, this fails *silently*.

## 3. Email template (magic link)

**Path:** Project → Authentication → Email Templates → **Magic Link**

Confirm the template body includes the confirmation link variable:

```
{{ .ConfirmationURL }}
```

Do not hard-code `localhost` or an old domain in the template. Supabase substitutes
the signed URL at send time.

**Subject / sender:** Set a recognizable subject (e.g. "Sign in to Houston Premier
Soccer") and a From name players will trust.

## 4. SMTP (custom mail — required for reliable production delivery)

**Path:** Project → Authentication → SMTP Settings → **Enable Custom SMTP**

Supabase's built-in mailer is heavily rate-limited and often lands in spam. Pick
one of the two paths below depending on whether you control your sending domain's
DNS.

### 4a. Gmail SMTP — recommended when DNS/MX records aren't workable

This is the path HPS uses in production. The trade-off: emails arrive **from**
the Gmail address (e.g. `houspremiersoccer@gmail.com`), not from
`noreply@houstonpremiersoccer.com`. Players still recognize the brand; setup is
ten minutes; zero DNS work.

**Prerequisite:** Two-factor authentication must be on for the Gmail account.
Gmail blocks plain-password SMTP since May 2022 — you must use an **App
Password** (a 16-character credential separate from the regular password).

1. Sign in to the Gmail account that will send the emails (HPS:
   `houspremiersoccer@gmail.com`).
2. Go to
   [Google Account → Security → 2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification)
   and enable it if it isn't already.
3. Open [App Passwords](https://myaccount.google.com/apppasswords). If the page
   shows "App passwords aren't available for your account", it means 2FA is not
   on yet — finish step 2.
4. Generate a new app password. Name it `Supabase Auth — HPS`. Copy the
   16-character string (Google shows it once with spaces; the spaces are visual
   only — Supabase accepts it with or without them).
5. In Supabase → Authentication → SMTP Settings → **Enable Custom SMTP** and
   paste:

   | Field | Value |
   |-------|-------|
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | `houspremiersoccer@gmail.com` |
   | Password | the 16-character app password from step 4 |
   | Sender email | `houspremiersoccer@gmail.com` (must match the username) |
   | Sender name | `Houston Premier Soccer` |
   | Minimum interval | `60` seconds (default is fine) |

   Save.

**Verify:** From `/login`, send a magic link to a real inbox (your personal
Gmail / Outlook / iCloud). Expect delivery in under 60 seconds, **From**
`Houston Premier Soccer <houspremiersoccer@gmail.com>`. Check spam if nothing
arrives after 2 minutes.

**Quotas:** Gmail caps free accounts at ~500 outbound recipients per day. HPS
auth volume is well under that. Google Workspace accounts get 2,000/day.

**Rotating the app password:** Generate a new one in
[App Passwords](https://myaccount.google.com/apppasswords), paste into Supabase,
save, then revoke the old entry in Google. No downtime if you do it in that
order.

### 4b. Transactional provider (Resend / Postmark / SendGrid / SES)

Use this when you control the sending domain's DNS and want the From address
to live on `@houstonpremiersoccer.com`.

| Field | Guidance |
|-------|----------|
| Host / port | From your provider (e.g. `smtp.resend.com`, port `465` or `587`) |
| Username / password | API key or SMTP credentials from provider |
| Sender email | Use a domain you control (e.g. `noreply@houstonpremiersoccer.com`) |
| Sender name | `Houston Premier Soccer` |

**DNS (deliverability):** At your DNS host, add the provider's **SPF**, **DKIM**,
and (optionally) **DMARC** records for the sending domain. Without DKIM, Gmail
and Outlook often silently delay or junk auth emails. If your registrar's DNS
panel makes adding these records painful (Namecheap is a common offender),
switch to 4a — there is no penalty for using Gmail SMTP at HPS scale.

**Verify:** Send a magic link to a real inbox you control. Expect delivery in
under 60 seconds. Check spam if nothing arrives after 2 minutes.

## 5. Application environment variables

Set in Vercel (or `.env.local` for dev):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; never expose to browser |
| `NEXT_PUBLIC_SITE_URL` | Canonical site origin for Stripe and other redirects |

`NEXT_PUBLIC_SITE_URL` should match the Supabase Site URL in production.

## 6. Quick triage order

1. Open `/admin/diagnostics` — confirm env vars and Supabase reachability.
2. Confirm Site URL + Redirect URLs in dashboard (section 1–2).
3. Confirm custom SMTP + DNS (section 4).
4. Resend from `/login` success card after 60s cooldown.
5. If link arrives but sign-in fails, check redirect URL allow list and
   `/auth/callback` logs.
6. If "Continue with Google" fails — or appears to succeed but leaves the
   player signed out — check §1/§2 **first**. A `redirectTo` that is not on
   the allow list fails silently. Then check the Google redirect URI points at
   `https://<project-ref>.supabase.co/auth/v1/callback` (section 8.1) and that
   the provider tab has the latest Client ID + Client Secret saved.

## 7. Identity merge (read first before enabling OAuth)

**Path:** Project → Authentication → Providers → **Email** → "Confirm email"

Leave **Confirm email = enabled**. With Confirm Email on, Supabase Auth merges
identities for the same verified email automatically: the first time a legacy
magic-link or password user signs in with Google, Supabase links the new
identity onto the existing `auth.users` row instead of creating a duplicate
user.

The HPS app **does not** implement custom merge logic. If you ever disable
"Confirm email", a player who previously used magic link and then clicks
"Continue with Google" with the same address will end up with a second
`auth.users` row and a confused `/me` experience. Don't do that.

## 8. Google provider setup

**Path:** Project → Authentication → Providers → **Google** → toggle on

### 8.1 Create the Google OAuth client

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs &
   Services → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. Authorized JavaScript origins (per environment):

   ```
   https://houstonpremiersoccer.com
   http://localhost:3000
   ```

4. Authorized redirect URIs — **must point to Supabase, not to our app**:

   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

   You can find your project ref in `NEXT_PUBLIC_SUPABASE_URL`. Supabase forwards
   from `/auth/v1/callback` to our `redirectTo` (which the app sets to
   `<origin>/auth/callback?next=...`).

5. Click **Create**. Copy the Client ID and Client secret.

### 8.2 Paste credentials into Supabase

In Supabase → Authentication → Providers → **Google**:

| Field | Value |
|-------|-------|
| Client ID (for OAuth) | The Client ID from step 8.1 |
| Client Secret (for OAuth) | The Client secret from step 8.1 |
| Callback URL (for OAuth) | (read-only — copy this exact URL into Google as the redirect URI) |
| Skip nonce check | **Off** (default) |

Save. The "Continue with Google" button on `/login` should now succeed.

### 8.3 Verify

Use a Google account that has never signed in to this site before. Confirm
`/login` → Google consent → `/me` works in one round-trip and that
`auth.users` shows exactly one row for that email with both `email` and
`google` in `identities`.

## 9. Apple sign-in — REMOVED 2026-08-14

**Google is the only provider. Do not add Apple back without reading this.**

Apple was offered on `/login` from 2026-08-12 to 2026-08-14 and **never worked
once** — the provider was never enabled in Supabase, so every tap failed. It
was removed rather than finished, for three reasons:

1. **$99/yr Apple Developer account**, required before any of it can be set up.
2. **The client secret is a JWT with a 6-month maximum validity.** When it
   expires, sign-in breaks for everyone with `invalid_client` and nothing in
   the app can detect or prevent it. That is a recurring outage the owner has
   to remember to head off, twice a year, forever.
3. **Nobody was blocked by its absence.** Registration and payment both work
   signed-out; sign-in only buys the one-tap returning-player path.

The Apple setup runbook was deleted with this change — recover it from git
history (`git log -- docs/AUTH-CONFIG.md`) if it is ever wanted again.

If you do re-add Apple: the provider is still matched in
`describeSignInMethods` (`src/app/me/page.tsx`), so an existing Apple identity
would still display; you would need to restore the button in
`src/components/auth/OAuthButtons.tsx` and re-add its callback to the redirect
allow-list in §2. Also note Apple's private relay addresses
(`xxxx@privaterelay.appleid.com`) become the canonical email for the §7 merge —
the player's real address is never delivered to us, which quietly breaks
matching against a `contacts` row keyed on their real email.
