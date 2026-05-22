# Supabase Auth — production operator checklist

Use this checklist when magic-link emails fail to arrive, OAuth redirects break, or
auth works locally but not on production. Pair with the live diagnostics page at
`/admin/diagnostics` (admin login required).

## 1. Site URL (Supabase Dashboard)

**Path:** Project → Authentication → URL Configuration → **Site URL**

Set to the canonical production origin (no trailing slash):

```
https://houstonpremiersoccer.com
```

The Site URL is the default redirect target when `redirectTo` is missing or not on the
allow list. Magic-link emails embed links derived from this setting.

**Verify:** After saving, send a test magic link from `/login` and confirm the link
host matches production, not `localhost` or a Supabase default.

## 2. Redirect URLs (allow list)

**Path:** Project → Authentication → URL Configuration → **Redirect URLs**

Add every origin that will receive auth callbacks. Required entries:

| URL | When |
|-----|------|
| `https://houstonpremiersoccer.com/auth/callback` | Production magic link + OAuth |
| `http://localhost:3000/auth/callback` | Local `next dev` |
| `https://*-your-vercel-team.vercel.app/auth/callback` | Vercel preview deploys (wildcard if supported) |

The app passes `emailRedirectTo` / OAuth `redirectTo` as
`<origin>/auth/callback` (optionally with `?next=`). Each origin you use in the
browser must appear in this list or Supabase will reject the redirect.

**Common failure:** Production Site URL is correct but preview/staging URLs are
missing — links work on prod, fail on previews.

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

Supabase's built-in mailer is rate-limited and often lands in spam. For production,
configure a transactional provider (Resend, Postmark, SendGrid, Amazon SES, etc.).

| Field | Guidance |
|-------|----------|
| Host / port | From your provider (e.g. `smtp.resend.com`, port `465` or `587`) |
| Username / password | API key or SMTP credentials from provider |
| Sender email | Use a domain you control (e.g. `noreply@houstonpremiersoccer.com`) |
| Sender name | `Houston Premier Soccer` |

**DNS (deliverability):** At your DNS host, add the provider's **SPF**, **DKIM**, and
(optionally) **DMARC** records for the sending domain. Without DKIM, Gmail and Outlook
often silently delay or junk auth emails.

**Verify:** Send a magic link to a real inbox you control. Expect delivery in under
60 seconds. Check spam if nothing arrives after 2 minutes.

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
6. If "Continue with Google" or "Continue with Apple" fails, check the
   provider redirect URIs are pointed at
   `https://<project-ref>.supabase.co/auth/v1/callback` (section 8.1 / 9.1)
   and that the Supabase provider tab has the latest Client ID + Client
   Secret saved.

## 7. Identity merge (read first before enabling OAuth)

**Path:** Project → Authentication → Providers → **Email** → "Confirm email"

Leave **Confirm email = enabled**. With Confirm Email on, Supabase Auth merges
identities for the same verified email automatically: the first time a magic-link
or password user signs in with Google or Apple, Supabase links the new identity
onto the existing `auth.users` row instead of creating a duplicate user.

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

## 9. Apple provider setup

**Path:** Project → Authentication → Providers → **Apple** → toggle on

Apple's "Sign in with Apple" requires an Apple Developer account
(\$99/yr) and a few more moving parts than Google. Plan ~30 minutes for the
first setup.

### 9.1 Create the Service ID

1. [Apple Developer Console](https://developer.apple.com/account/resources/identifiers/list)
   → **Identifiers** → `+` → **Services IDs** → continue.
2. Description: `Houston Premier Soccer — Sign in with Apple`.
3. Identifier (this is the `client_id` Apple expects): a reverse-DNS string
   you control, e.g. `com.houstonpremiersoccer.web.signin`.
4. Enable **Sign In with Apple** → **Configure**:
   - Primary App ID: select an existing App ID, or create a new one tied to
     the same team.
   - Domains and Subdomains:
     ```
     <your-project-ref>.supabase.co
     ```
   - Return URLs:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
   - Save and continue → Save the Services ID.

### 9.2 Create the Sign In With Apple key

1. Apple Developer Console → **Keys** → `+`.
2. Name: `HPS Sign In With Apple key`.
3. Enable **Sign In with Apple** → **Configure** → select the same Primary
   App ID from 9.1.
4. Continue → Register → **Download** the `.p8` file (one-time download —
   save it in a password manager).
5. Note the **Key ID** (10 chars) and your **Team ID** (Apple Developer
   account → Membership).

### 9.3 Mint the OAuth client secret (JWT)

Apple's client secret is a short-lived JWT signed with the `.p8` key. There
are two paths:

- **Recommended (Supabase-managed):** in Supabase → Authentication →
  Providers → Apple, use the in-dashboard "Generate client secret" tool if
  available for your project. Paste in Team ID, Service ID (= `client_id`
  from 9.1), Key ID, and the contents of the `.p8` file. Supabase will
  generate and rotate the JWT for you.
- **Manual (script):** if the in-dashboard tool isn't available, generate
  the JWT with a small Node script (see Apple's docs) and paste it as
  Client Secret. The JWT expires in 6 months max — set a calendar reminder
  to rotate.

### 9.4 Paste credentials into Supabase

| Field | Value |
|-------|-------|
| Client ID (for OAuth) | Services ID from 9.1 (e.g. `com.houstonpremiersoccer.web.signin`) |
| Client Secret (for OAuth) | The JWT from 9.3 |
| Callback URL (for OAuth) | (read-only — must match the Return URL in 9.1) |

Save. The "Continue with Apple" button on `/login` should now succeed.

### 9.5 Verify

Use an Apple ID that has never signed in to this site. Confirm `/login` →
Apple consent → `/me` works in one round-trip. On the very first sign-in
Apple sends the player's name; subsequent sign-ins do **not** include a name
payload (this is by Apple design — the `contacts` row is populated once on
first sign-in).

### 9.6 Operational notes

- **Apple JWT rotation:** Apple client secrets are JWTs with a max validity
  of 6 months. If "Continue with Apple" suddenly fails for everyone with
  `invalid_client`, the secret has expired — regenerate per 9.3.
- **Apple-private email relay:** Apple lets users sign in with a relay
  address like `xxxx@privaterelay.appleid.com`. That address is treated as
  the canonical email for the merge in section 7 — the player's "real"
  Apple ID email is never delivered to us.
