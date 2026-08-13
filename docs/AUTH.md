# Auth Model

This document describes the two authentication systems that coexist in the HPS
web app, as they ship after Phase 15. The split is deliberate — do not unify
them without an explicit approved phase.

> ⚠ **Superseded in part by REBUILD-PLAN §A8 (2026-08-12).** Player sign-in is now
> **Google and Apple only** (D5). Magic link, password, forgot/reset password,
> `/me/security` and the post-checkout magic-link claim have all been removed. The
> sections below that describe them are kept only as a record of what used to exist —
> the code is gone. Admin auth is unchanged and still accurate.

## TL;DR

- **Admin** is one shared identity in env vars, gated by an HMAC cookie.
  Unchanged since the project began.
- **Players** authenticate against Supabase Auth via **Google or Apple OAuth**. Nothing
  else. Both providers are still pending configuration in the Supabase dashboard — as of
  2026-08-12 production has 28 auth users, all provider `email`, zero OAuth.
- **Signing in is optional.** Registration and payment both work signed-out; sign-in gates
  only `/me` and the one-tap returning-player path on `/register`.
- The two systems share no code, no cookies, and no users. A logged-in player
  who is also the admin must log in twice (once per surface).

## Player auth surface (current shape)

```
                       /login
                         │
       ┌─────────────────┼──────────────────┐
       │                 │                  │
   Magic link        Password           OAuth (Google / Apple)
       │                 │                  │
       ▼                 │                  ▼
   /auth/callback ◄──────┼─────── /auth/callback
       │                 │                  │
       │                 ▼                  │
       │                /me ◄───────────────┘
       │
       └── (recovery) ── /auth/reset ── set password ── /me
```

Post-checkout claim:

```
Stripe webhook ── inviteUserByEmail ─┐
                                     ├─► /auth/callback?next=/auth/claim ─► /me
/pay/success ── ClaimAccountForm ────┘  (signInWithOtp,  shouldCreateUser:true)
```

### Sign-in methods, one paragraph each

- **Magic link.** `[src/app/login/MagicLinkForm.tsx](../src/app/login/MagicLinkForm.tsx)`
  calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo:
  <origin>/auth/callback?next=... } })`. The "Resend link" affordance has a
  60-second cooldown to avoid spamming SMTP.
- **Password.** `[src/app/login/PasswordForm.tsx](../src/app/login/PasswordForm.tsx)`
  calls `supabase.auth.signInWithPassword({ email, password })`. On success it
  does a full-page navigation to `nextPath ?? "/me"` (not `router.push`) so the
  next request is guaranteed to hit middleware with the freshly written
  Supabase session cookies. Tab gating lives in `[src/app/login/LoginTabs.tsx](../src/app/login/LoginTabs.tsx)`.
- **Forgot password.** `[src/app/login/forgot-password/ForgotPasswordForm.tsx](../src/app/login/forgot-password/ForgotPasswordForm.tsx)`
  calls `supabase.auth.resetPasswordForEmail(email, { redirectTo:
  <origin>/auth/callback?next=/auth/reset })`. The reset link goes through
  `/auth/callback`, then lands on `/auth/reset`.
- **Reset password.** `[src/app/auth/reset/page.tsx](../src/app/auth/reset/page.tsx)`
  requires an active session (the recovery code was already exchanged in the
  callback). `[ResetPasswordForm.tsx](../src/app/auth/reset/ResetPasswordForm.tsx)`
  calls `supabase.auth.updateUser({ password, data: { has_password: true } })`.
- **Set / change password while signed in.** `[src/app/me/security/SecurityForm.tsx](../src/app/me/security/SecurityForm.tsx)`.
  If the player already has a password, the form verifies the old one via
  `signInWithPassword` before calling `updateUser`. If not, it just calls
  `updateUser({ password, data: { has_password: true } })`.
- **Google / Apple OAuth.** `[src/app/login/OAuthButtons.tsx](../src/app/login/OAuthButtons.tsx)`
  calls `supabase.auth.signInWithOAuth({ provider, options: { redirectTo:
  <origin>/auth/callback?next=... } })`. Provider configuration lives in
  Supabase (see `[docs/AUTH-CONFIG.md](./AUTH-CONFIG.md)` sections 8 and 9).
  Identity merging by email is delegated to Supabase Auth's "Confirm email"
  behavior — we do not implement custom merge logic.
- **Post-checkout claim.** `[src/components/pay/ClaimAccountForm.tsx](../src/components/pay/ClaimAccountForm.tsx)`
  (rendered by `[src/app/pay/success/page.tsx](../src/app/pay/success/page.tsx)`
  when the payer is signed-out and has no `auth.users` row) calls
  `signInWithOtp({ email, options: { emailRedirectTo:
  <origin>/auth/callback?next=/auth/claim, shouldCreateUser: true } })`. The
  email is locked to whatever Stripe verified for that session. The Stripe
  webhook at `[src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts)`
  also fires `supabase.auth.admin.inviteUserByEmail` once on first record so
  the player has a fallback even if they bounce off the success page.

### Server-side gate (`getCurrentPlayer`)

[`src/lib/player-auth.ts`](../src/lib/player-auth.ts) exposes two
`React.cache()`-wrapped helpers:

- `getCurrentAuthUser()` → `User | null`. Validates the Supabase JWT against
  the server via `supabase.auth.getUser()`. Multiple callers in a single
  request share one round-trip.
- `getCurrentPlayer()` → `{ userId, email, contact } | null`. Joins the auth
  user to a `contacts` row by email (citext, case-insensitive). If no contact
  row exists yet, one is lazily inserted with the best-effort name from
  `user_metadata` (Google's `given_name` / `family_name` / `full_name`,
  Apple's first-authorization `name`, or the registration-form `first_name`
  / `last_name`).

The `cache()` wrap is what addresses the Phase 6 follow-up about
`auth.getUser()` running on every render of the global header. The header
([`src/components/layout/header.tsx`](../src/components/layout/header.tsx))
and the page body share one Supabase auth call per request. Client surfaces
that want a fresh probe (e.g. after a sign-out in another tab) hit
[`src/app/api/me/status/route.ts`](../src/app/api/me/status/route.ts).

**Never** swap `getUser()` for `getSession()`. `getSession()` reads the
cookie without revalidating the JWT.

### Identity ↔ contacts join

- The Supabase auth user is the source of truth for `auth.users.email`.
- The `contacts` row is matched on normalized email and is the source of
  truth for everything else (name, phone, DOB, waiver status, emergency
  contact).
- A logged-in player edits their contact via
  `[src/app/me/MeProfileForm.tsx](../src/app/me/MeProfileForm.tsx)` and
  `[src/app/api/me/profile/route.ts](../src/app/api/me/profile/route.ts)`.
  The email field is read-only once a player has signed in.
- For OAuth users on first sign-in, we trust the provider's name claims
  exactly once. Apple in particular only sends the name payload on the very
  first authorization for a given app — by Apple design, not a bug.

### Sign-in methods card on `/me`

`/me` lists connected providers via `describeSignInMethods()` in
[`src/app/me/page.tsx`](../src/app/me/page.tsx). The logic reads
`user.identities[]` for the providers and `user.user_metadata.has_password`
to distinguish "Email + password" from "Magic link only".

`has_password` is set by every in-app password write (Phase 11's
`SecurityForm` and `ResetPasswordForm`). A password set out-of-band (Supabase
dashboard, future admin tool) will read as `false` until the next in-app
write. Documented in FOLLOWUPS; revisit when admin password reset ships.

### Header + AccountMenu

[`src/components/layout/header.tsx`](../src/components/layout/header.tsx)
resolves the player via the cached `getCurrentPlayer` and passes
`{ isAuthed, displayName }` down to
[`src/components/layout/header-client.tsx`](../src/components/layout/header-client.tsx).

When `isAuthed` is true, the header renders
[`src/components/layout/AccountMenu.tsx`](../src/components/layout/AccountMenu.tsx)
— a 4-item dropdown (Profile / My registrations / Security / Sign out).
Sign-out is a real form POST to `/auth/signout` so the server clears the
Supabase cookies before the response. Keyboard accessible (Esc closes;
mousedown outside closes; no focus trap by design for a 4-item menu).

When not authed, the header shows a static "Sign in" link to `/login`.

### Sign out

[`src/app/auth/signout/route.ts`](../src/app/auth/signout/route.ts) — POST
only, calls `supabase.auth.signOut()`, redirects to `/`. Doesn't touch the
admin HMAC cookie.

## Middleware (session refresh + `/me/*` gate)

[`src/middleware.ts`](../src/middleware.ts) has two jobs:

1. Run `createSupabaseMiddlewareClient` + `supabase.auth.getUser()` on every
   matched request. This is the `@supabase/ssr` recipe that refreshes the
   auth session cookie on the response. The cookie write must be the first
   thing we do on the request — no code between client creation and the
   `getUser()` call.
2. Gate `/me` and `/me/*` server-side: anonymous visitors get redirected to
   `/login?next=<original-path>`. Every other player surface (`/auth/*`,
   `/login`, `/pay/success`, `/auth/claim`) is publicly reachable so the
   page itself can decide what to do based on the session.

Matcher excludes Next.js internals and static asset extensions; everything
else (including `/auth/*` and `/api/*`) gets a session refresh.

## Admin auth (unchanged, do not refactor)

Admin access is gated by a single shared admin account whose credentials
live in environment variables, not in the database.

- **Env vars:** `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`.
- **Session:** HMAC-signed cookie. Issued and verified in
  [`src/lib/app-signing.ts`](../src/lib/app-signing.ts) via
  `signAdminSessionCookieValue` and `verifyAdminSessionCookieValue`.
- **Page gate:** [`src/components/admin/AdminGate.tsx`](../src/components/admin/AdminGate.tsx).
- **API gate:** every admin API route must call `verifyAdminSessionCookieValue`
  on the request cookie before doing any work.
- There is no `auth.users` row for the admin and no admin user table. The
  admin is a single env-defined identity.

### Why this stays separate

- One operator, no RBAC requirement on the roadmap.
- Replacing it with Supabase Auth + an `is_admin` claim would need a role
  system and RLS rewrites that are out of scope.
- The two systems do not interfere: `app-signing` uses its own cookie name;
  Supabase Auth uses cookies managed by `@supabase/ssr`.

## Cross-cutting rules

- Never mix the two. Admin pages do not call `supabase.auth.*`. Player pages
  do not call `verifyAdminSessionCookieValue`.
- A logged-in player who happens to also be the admin must still sign in
  separately to access `/admin/*`.
- When in doubt about whether a new route is admin or player, ask before
  building.

## Production checklist & operator docs

- **[docs/AUTH-CONFIG.md](./AUTH-CONFIG.md)** — first-time setup. Supabase Site
  URL, Redirect URL allow list, SMTP, magic-link email template, Google
  provider, Apple provider.
- **[docs/AUTH-RUNBOOK.md](./AUTH-RUNBOOK.md)** — on-call runbook. Secret
  rotation, common email-deliverability incidents, identity-merge
  troubleshooting, and how to read the live diagnostics page.
- **Live diagnostics:** `/admin/diagnostics` (admin login required) probes
  env vars and Supabase reachability and lists the redirect URLs the
  dashboard should have. Always look here first when production sign-in
  breaks.
- **Smoke script:** `scripts/smoke-auth.ts` walks every entry point against a
  designated test email. Run with `AUTH_SMOKE=1 npx tsx
  --env-file=.env.local scripts/smoke-auth.ts`.
