# Auth Model

This document describes the two authentication systems that coexist in the HPS
web app. Phases 1–8 must respect this split — do not unify them without an
explicit approved phase.

## Admin auth (current, do not refactor)

Admin access is gated by a single shared admin account whose credentials live
in environment variables, not in the database.

- Env vars: `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` (production).
- Session: HMAC-signed cookie. Issued and verified in
  [`src/lib/app-signing.ts`](../src/lib/app-signing.ts) via
  `signAdminSessionCookieValue` and `verifyAdminSessionCookieValue`.
- Page gate: [`src/components/admin/AdminGate.tsx`](../src/components/admin/AdminGate.tsx).
- API gate: every admin API route must call `verifyAdminSessionCookieValue` on
  the request cookie before doing any work.
- There is **no `auth.users` row** for the admin. There is no admin user table.
  The admin is a single env-defined identity.

### Why this stays as-is

- It is currently working.
- The site has exactly one admin (the operator) — there is no multi-admin or
  RBAC requirement on the roadmap.
- Replacing it with Supabase Auth + an `is_admin` role/claim is feasible later,
  but is explicitly out of scope for Phases 1–8.

## Player auth (added in Phase 6)

Players authenticate with Supabase Auth using passwordless email magic links.
This is a **separate** auth flow from the admin gate above — adding it must not
touch `app-signing.ts` or `AdminGate`.

- Mechanism: `supabase.auth.signInWithOtp({ email })`.
- New dependency required: `@supabase/ssr` (must be explicitly approved before
  installing — see project rules).
- Files added in Phase 6:
  - `src/app/login/page.tsx` — email entry form for players.
  - `src/app/auth/callback/route.ts` — exchanges the OTP code for a session.
  - `src/middleware.ts` — refreshes the Supabase session and protects `/me/*`.
- Identity link: the player's Supabase Auth user is matched to a `contacts`
  row by email (`contacts.email = auth.users.email`). The email on the contact
  is treated as read-only once a player has logged in.

## Why two systems coexist

- Admin and player concerns are different: admin needs operational access to
  every contact; player needs only their own data.
- Migrating admin to Supabase Auth would require a new role/claim system and
  RLS rewrites that are out of scope for this overhaul.
- The two systems do not interfere with each other: `app-signing` reads its own
  cookie name; Supabase Auth uses its own cookies via `@supabase/ssr`.

## Cross-cutting rules

- Never mix the two: admin pages do not call `supabase.auth.*`; player pages
  do not call `verifyAdminSessionCookieValue`.
- A logged-in player who happens to also be the admin must still log in
  separately to access `/admin/*`. They are independent sessions.
- When in doubt about whether a new route is admin or player, ask before
  building.
