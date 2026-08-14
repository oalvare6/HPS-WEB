# Session log — 2026-08-14

**Read [`docs/REBUILD-PLAN.md`](./REBUILD-PLAN.md) first, then this file.** It supersedes
[`docs/SESSION-LOG-2026-08-13.md`](./SESSION-LOG-2026-08-13.md).

Live on https://www.houstonpremiersoccer.com as `main` @ **`7d64d8a`**.
Community Cup starts **2026-08-21 — 7 days out.**

---

## 1. The headline

**Google sign-in had never worked on the real domain, and no amount of code could have
fixed it.** Supabase's Site URL pointed at `https://hps-web-oalvare6s-projects.vercel.app/`
and the redirect allow-list contained four `.vercel.app` entries, two of them with a
wildcard in a position that matches no real hostname. Nothing matched
`www.houstonpremiersoccer.com/auth/callback`.

**Supabase does not error when `redirectTo` is missing from the allow-list. It silently
substitutes the Site URL.** So the OAuth code was delivered to a different origin, where the
PKCE verifier the browser had stored for `www` did not exist, and
`exchangeCodeForSession` could never succeed. `.vercel.app` is also on the Public Suffix
List, so a cookie set there can never be read by `houstonpremiersoccer.com` anyway.

The fingerprint, measured before the fix:

```
auth.identities   google   created 2026-08-13 23:44, updated 2026-08-14 00:23
auth.sessions     newest row: 2026-07-01              ← nothing since
Vercel runtime logs, /auth/callback requests: ZERO    ← ever
Supabase monthly active users: 1
```

**An identity with no session is what this misconfiguration looks like from the database.**
If sign-in ever "does nothing" or lands on a strange hostname again, check
[`docs/AUTH-CONFIG.md`](./AUTH-CONFIG.md) §1–2 **before reading a line of code.**

The operator's original report — *"it's under the Vercel kind of domain, which I don't know
if that's right"* — was exactly correct and was the single most valuable clue in the session.

---

## 2. What the operator asked for

> "When signed in, instead of saying register on the top right, it should say their status…
> when you're signed in, you can't sign out, it just stays there… it's under the Vercel kind
> of domain… I have teams made but there's no time for you to select the team even though I
> do have teams… right now you can't go in the dashboard because of cookies… for these
> tournaments, people can pay later."

Every one of those turned out to be a real defect. Two had causes nobody had guessed.

---

## 3. Code shipped — four commits

| Commit | What |
|---|---|
| `03f3819` | Sign-out, team picking, admin lockout, by-team payment panel |
| `69fc0bf` | Merge of the above |
| `ad8fc31` | Google-only sign-in — Apple removed |
| `7d64d8a` | One canonical host — 308 the Vercel aliases |

38 files, +1572/−395.

### 3a. Sign-out did nothing — `03f3819`

The middleware matcher covered `/auth/signout`, so its `getUser()` call refreshed an
expiring session and attached **fresh** `sb-*` cookies to the middleware response while the
route attached **deletions** to its own. Next merges both sets of `Set-Cookie` headers and
the refresh could win — which is why it failed intermittently and read as a UI bug.

- `/auth/signout` is now **excluded from the middleware matcher**. ⚠ Putting it back breaks
  sign-out again; the comment in `src/middleware.ts` says so.
- The route expires any surviving chunked cookies itself.
- `SignOutButton` clears the browser client's cached session before posting.

### 3b. The header offered "Register" to people already on a roster — `03f3819`

Signed in, the account menu is now the whole right-hand control and opens with the player's
waiver standing (`src/components/layout/WaiverStatusLine.tsx`). Signed out, "Sign in" and
"Register" both stay.

### 3c. Nobody already signed up could pick a team — `03f3819`

`/register` resolves a returning player to `owes_payment` or `already_paid`, and **neither
card had a team control at all** — the dropdown only ever existed on the two paths such a
player never reaches. That is why all four Community Cup signups sat at `team_id = NULL`
while the event had teams.

Both cards now carry a saving picker, extracted to
`src/components/register/TeamPicker.tsx` so the three call sites cannot drift.
`already_paid` had to start carrying `team_id`, which it never did.

Also moved the waiver gate in `/api/register/join` **after** the existing-row lookup. That
gate guards enrolment; firing it for someone already on the roster refused a team change
over a lapsed waiver, which is refusing the wrong thing.

### 3d. The admin lockout — `03f3819`

The session lasted 8 hours and never renewed, so the owner was locked out every morning.
Now **30 days**, `sameSite: lax` (strict drops the cookie on a top-level navigation from
WhatsApp or a text — which is how the dashboard actually gets opened at the field), and
re-issued past halfway by `/api/admin/me`. See `src/lib/admin-session.ts`.

**This was only half the cause.** The other half was §3f — an admin cookie set on a
`.vercel.app` alias can never authenticate on the real domain.

### 3e. Pay-later — `03f3819`

Players sign up first and pay over the following weeks, so the useful question is how far
along each team is. Added a **By-team payment panel** to the Roster, derived from rows the
screen already holds — **no query, column or migration**. `registrations.payment_status`
already allowed `'partial'`.

**Reports only. Nothing blocks a player**, because being locked out on match day is worse
than a chase-up text.

### 3f. One canonical host — `7d64d8a`

**Five hosts were serving the identical live site** — same database, same Stripe, real
signups:

```
www.houstonpremiersoccer.com                    ← the real one
hps-web-three.vercel.app
hps-web-oalvare6s-projects.vercel.app
hps-web-git-main-oalvare6s-projects.vercel.app
hps-etj8vxdbv-oalvare6s-projects.vercel.app
```

Cookies are per-host, so a session made on an alias could never be read on the real domain.
A player who landed on one signed in, came back later, and was silently signed out. **The
admin cookie split the same way** — the likelier half of "you can't go in the dashboard
because of cookies."

Hobby gives no way to remove the aliases, so the middleware refuses to serve on them: a
**308** to the same path on the canonical host. Rules live in `src/lib/canonical-host.ts` as
a pure function.

⚠ **Preview deployments are exempt on purpose**, keyed off `VERCEL_ENV`. Redirecting them to
production would make every preview untestable. Do not "simplify" that check away.

⚠ The host check runs **before** the Supabase client is constructed. Refreshing a session
cookie onto a host we are about to redirect away from writes it to a domain the real site
can never read — the exact bug being fixed.

### 3g. Apple sign-in removed — `ad8fc31`

Offered from 2026-08-12 and **never worked once** — the provider was never enabled, so every
tap failed. Finishing it needs a \$99/yr developer account plus a client secret that is a
**JWT with a 6-month maximum validity**; when it expires sign-in breaks for everyone with
`invalid_client` and nothing in the app can detect it. A recurring outage the owner has to
remember to prevent, twice a year, forever.

`/me` still matches an `apple` identity even though the button is gone — nobody in
production has one, but if a person did it would still be a real way into their account.
The Apple setup runbook was deleted; recover from git history if ever wanted.

---

## 4. Dashboard changes made this session

Applied by the operator through the Claude Chrome extension, read-only recon first, then a
scoped change list with an explicit stop list.

| Where | From | To |
|---|---|---|
| Supabase Site URL | `https://hps-web-oalvare6s-projects.vercel.app/` | `https://www.houstonpremiersoccer.com` |
| Supabase Redirect URLs | 4 entries, 2 with a broken wildcard | 5 correct entries (see AUTH-CONFIG §2) |
| Vercel env vars | 16 branch-scoped Preview vars on a stale June branch | **Deleted** |
| Vercel deployments | 2 public preview deploys serving a full site copy | **Deleted** — URL now 404s |
| `NEXT_PUBLIC_SITE_URL` | `https://houstonpremiersoccer.com` (apex) | `https://www.houstonpremiersoccer.com` |

The 16 deleted vars included a second `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` and
`POSTGRES_PASSWORD`, sitting behind a **publicly reachable** preview URL with Deployment
Protection off, since 2026-06-19.

⚠ **Deleting them from Vercel closed the exposure but did NOT revoke them.** Those
credentials are still valid at the source. See §6.

---

## 5. Verified against production, not assumed

```
/ /register /login /events /events/community-cup-fall-2026
/privacy /terms /refunds /cookies                          200
/me                                                        307 → /login
/auth/callback (bare)                                      307 → /login?error=missing_code
POST /auth/signout        303, Cache-Control: no-store, both cookie chunks expired
/api/admin/*                                               401
hps-web-three.vercel.app/events                            308 → www, path preserved
hps-web-oalvare6s-projects.vercel.app/events               308 → www
hps-web-git-main-...vercel.app/events                      308 → www
houstonpremiersoccer.com (apex)                            307 → www, then 200
```

`/auth/callback` responding at all is new — that route had **never once been executed in
production** before today.

Before pushing `7d64d8a`, the redirect was exercised against a **real production build**
with `VERCEL_ENV=production` and spoofed `Host` headers: all four aliases 308 with path and
query preserved, canonical and apex both 200, no loop.

Local gates: `tsc` clean · lint clean · build clean · **55/55** across four scripts
(`test-tournament-state` 16, `test-signup-state` 16, `test-roster-totals` 8,
`test-canonical-host` 15).

---

## 6. Still open — ordered

1. **Sign in with Google end to end on the real domain.** Every piece is verified
   independently; the round trip needs the owner's account. Success looks like: never leaves
   `houstonpremiersoccer.com`, lands on `/me`, name top-right, sign out works twice. Then
   check `auth.sessions` for a row newer than 2026-07-01 — that is the proof.
2. **The signed-in screens are unverified.** Team picker on `owes_payment` /
   `already_paid`, the header waiver line, the account menu. All shipped, none exercised by a
   real session, because doing so needs the owner's Google account.
3. **No database backups.** Free plan excludes them; Pro is \$25/mo (PITR is a separate
   \$100/mo add-on — not needed). REBUILD-PLAN Track B1 is destructive and says "back up
   first"; that instruction currently cannot be followed. A manual SQL dump was offered and
   not yet taken.
4. **Rotate the exposed credentials.** Supabase service-role key, JWT secret, Postgres
   password — public since 2026-06-19, still valid. Deliberately deferred: rotating the
   service-role key is a coordinated change (new value → redeploy → verify) and every page
   reads it. **Post-tournament, but do not let it slide.**
5. **Community Cup has 2 teams and all 4 signups have `team_id = NULL`.** The pickers work
   now; they have nothing to offer. Owner's job.
6. **Mark `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DOCUSEAL_API_KEY` as Sensitive.**
   Vercel's "Needs Attention" flags are **only** that advice — not expiry, not error.
   Converting requires re-entering the value by hand; a mistyped Stripe key means no money.
   Deliberately deferred past the 21st.
7. **Waiver text still unreviewed** — `src/lib/waiver-text.ts`. Carried from 08-13.
8. **Legal pages still unreviewed.** Carried from A5.

---

## 7. Traps for whoever picks this up

- **Check the Supabase redirect allow-list before debugging any auth problem.** It fails
  *silently*. This cost a week across two sessions.
- **Do NOT click "Disable legacy API keys" in Supabase → Settings → API Keys.** The app reads
  the legacy `SUPABASE_SERVICE_ROLE_KEY` and anon key. That button takes the entire site down
  instantly, and it is presented in the UI as a tidy-up.
- **Do NOT put `/auth/signout` back in the middleware matcher.** §3a.
- **Do NOT redirect preview deployments to the canonical host.** §3f.
- **"Confirm email" must stay ON** on the Supabase Email provider — it is what merges the 28
  legacy email accounts onto one person when they sign in with Google.
- **Do not re-add Apple.** §3g and AUTH-CONFIG §9.
- **Only `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are read by the app.** The other ~14 `SUPABASE_*` /
  `POSTGRES_*` vars in Vercel are dead weight from the native integration. Harmless; do not
  assume they are load-bearing.
- **`APP_SIGNING_SECRET` is not set in Vercel and that is fine** —
  `src/lib/app-signing.ts` falls back to `ADMIN_SESSION_SECRET`, which is set.
- **Vercel runtime logs are capped at 1 hour on Hobby.** You cannot look back at yesterday.
- **Don't run `npm run build` while the dev server is running** — and rebuild after stopping
  it, because `next dev` clobbers `.next`.
- `registrations` still has NOT NULL on email/dob/emergency fields; the A3 walk-in
  placeholder workaround is unchanged. B3 removes the need.

---

## 8. Files worth knowing about (new this session)

| Path | What |
|---|---|
| `src/lib/canonical-host.ts` | One-host rule. Pure, tested. |
| `src/lib/admin-session.ts` | 30-day sliding admin session. |
| `src/components/register/TeamPicker.tsx` | The team control, shared by 3 call sites. |
| `src/components/layout/WaiverStatusLine.tsx` | Waiver standing in the account menu. |
| `src/components/auth/SignOutButton.tsx` | Clears the client cache, then posts. |
| `scripts/test-canonical-host.ts` | 15 cases, incl. the redirect-loop guard. |
| `scripts/test-roster-totals.ts` | 8 cases over the by-team payment maths. |
