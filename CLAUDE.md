# Claude — read this first

**Active plan: [`docs/REBUILD-PLAN.md`](docs/REBUILD-PLAN.md). Read it end to end before
touching code.**

It contains the operator's locked decisions, the production evidence behind them, the target
data model, and the order of work. It supersedes `docs/HANDOFF-PLAYER-PAY-FLOW.md` and the
phase lists in `.cursor/rules/hps-phases.mdc`.

**The one-line version:** the system is built around email and money; it needs to be built
around a person and a roster.

**Deadline in flight:** Community Cup starts 2026-08-21. Track A in the plan is the minimum to
run it properly and deliberately avoids schema changes. Track B is the deeper cleanup.

**Who this is for:** the admin is being handed to the company owner, who is not technical.
Simplicity for that person outranks cleverness everywhere.

## Reference

**Stack:** Next.js 15 App Router, React 19, Supabase, Stripe, DocuSeal. Player auth =
Supabase; admin = HMAC cookie.

**Local dev:** `npm run dev` → http://localhost:3000 (needs `.env.local`, including
`SUPABASE_SERVICE_ROLE_KEY` — most pages fail without it).

**Before claiming anything works:**

```bash
npx tsc --noEmit
npx tsx scripts/test-tournament-state.ts
npx tsx scripts/test-signup-state.ts
npx tsx scripts/test-roster-totals.ts
npx tsx scripts/test-canonical-host.ts
npx tsx scripts/test-open-play-free-entry.ts
npm run build
```

**Two FKs now run from `registrations` to `tournaments`** — `tournament_id` and D7's
`free_entry_tournament_id`. PostgREST will not choose between them: any `.select()` that
embeds `tournaments(...)` from `registrations` **must** name the constraint
(`tournaments!registrations_tournament_id_fkey(...)`) or it answers PGRST201 at runtime. It
will pass `tsc` and `npm run build` either way — the ambiguity lives in the database. Six
call sites were rewritten when the column landed (`/pay`, `/me`, the waiver signing screen,
the admin registrations API, `/api/registrations/[id]`, captain paid-ack); add yours to
that habit.

**Admin waiver state has exactly one computation** — `waiverStatusFor` in
`src/lib/admin-roster.ts` — and one display policy, decided by the operator 2026-08-17: a
covered person is a green ✓ whatever the paper trail; the missing-document case is a quiet
tag, and "needs waiver" is reserved for genuinely missing or expired. Do not read
`registrations.waiver_signed` directly in a UI again; that habit is what had the same
person reading "signed" and "pending" on the same page.

**And note what that migration did to the code already running.** It only *added* things, so it
looked backward compatible — but the second FK breaks every existing unqualified embed the
instant it lands, which meant the **deployed** site, not just the new code. "Migration first,
then deploy" is the right instinct for a new column and the wrong one here. A migration that
adds a second relationship between two tables is a breaking change to every embed between them,
in **both** deploy orders. The zero-downtime path is to ship the constraint-naming fix alone
first (naming a constraint is valid against a one-FK schema too), then migrate, then ship the
feature.

**The webhook trap, found 2026-08-14.** The DocuSeal webhook had **never once delivered** to
this app. It was pointed at the **apex** domain, Vercel 307s apex → www *at the edge*, and
DocuSeal does not follow redirects — it logged every 307 as a success. Green checks on their
side, no requests on ours, nobody alarmed for a month. **Any third-party webhook configured
against `houstonpremiersoccer.com` instead of `www.houstonpremiersoccer.com` dies silently.**
Stripe was audited and is fine. When an integration misbehaves, check the *sender's* configured
URL and delivery log before testing the endpoint — testing the endpoint only proves what the
endpoint does, not what the sender experiences.

**Three rules that are easy to break:**

- **`/register` is the only front door to signing up.** `/pay` without a signed resume
  token redirects there. Do not add a second entry point — that was the bug (plan §A6).
- **Signing in is not required to register or pay.** Sign-in is **Google only** (Apple was
  removed 2026-08-14 — never configured, so it failed every tap). Gating signup on sign-in
  would take the site offline for players (§A8, §9).
- **Nothing reaches a roster without an explicit Confirm, and one live spot per person per
  event is enforced in the database.** `registrations_one_live_spot_idx` will reject a second
  insert with `23505` — report that as "you're already signed up," never a generic error.
  Cancellation is `registrations.cancelled_at`, never `payment_status` (D17–D19, session log
  below).

**The auth trap that cost a week — FIXED 2026-08-14, but read it anyway.** Supabase's
**Site URL and Redirect URLs** must list the real domain. They pointed at
`hps-web-oalvare6s-projects.vercel.app`, and `www.houstonpremiersoccer.com/auth/callback`
matched none of them — so Supabase silently redirected to the Site URL instead of erroring,
`/auth/callback` never ran, and **no player could complete a Google sign-in on the real
domain** (1 MAU, zero `auth.sessions` after 2026-07-01). If sign-in ever "does nothing" or
lands on a strange hostname, check that allow-list *before* reading any code —
[`docs/AUTH-CONFIG.md`](docs/AUTH-CONFIG.md) §1 has the current values.

**One host serves this site: `www.houstonpremiersoccer.com`.** Vercel assigns four other
aliases that used to serve a full working duplicate; the middleware now 308s them to the
canonical host (`src/lib/canonical-host.ts`). Sessions are per-host and `.vercel.app` is on
the Public Suffix List, so a session made on an alias can never be read on the real domain.
Preview deployments are exempt on purpose — don't "simplify" that check away.

| Doc | What |
|---|---|
| [`docs/REBUILD-PLAN.md`](docs/REBUILD-PLAN.md) | **The active plan.** Start here. |
| [`docs/SESSION-LOG-2026-08-17-ADMIN-DATA-CLEANUP.md`](docs/SESSION-LOG-2026-08-17-ADMIN-DATA-CLEANUP.md) | **Most recent session.** Production data cleanup (B1 done), the four-way waiver-display contradiction, and the B6 admin consolidation (one page per event). Read after the plan. |
| [`docs/SESSION-LOG-2026-08-14-OPEN-PLAY-FREE-ENTRY.md`](docs/SESSION-LOG-2026-08-14-OPEN-PLAY-FREE-ENTRY.md) | D7 free entry, the guest list, the two-FK deploy trap, and why "correct" wasn't "delivered". |
| [`docs/SESSION-LOG-2026-08-14-SIGNUP-CONFIRM-GATE.md`](docs/SESSION-LOG-2026-08-14-SIGNUP-CONFIRM-GATE.md) | Earlier the same day: confirm-before-roster, self-cancel, and a 9-way duplicate-registration fix. |
| [`docs/SESSION-LOG-2026-08-14-WAIVERS.md`](docs/SESSION-LOG-2026-08-14-WAIVERS.md) | Earlier the same day: the waiver round trip and pay-later. |
| [`docs/SESSION-LOG-2026-08-14.md`](docs/SESSION-LOG-2026-08-14.md) | Earlier still: auth URLs, one canonical host. |
| [`docs/SESSION-LOG-2026-08-13.md`](docs/SESSION-LOG-2026-08-13.md) | The session before it. |
| [`FOLLOWUPS.md`](FOLLOWUPS.md) | Append-only log of known issues |
| [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md) | Shipped status (pre-dates the rebuild plan) |
| [`docs/AUTH.md`](docs/AUTH.md), [`docs/AUTH-RUNBOOK.md`](docs/AUTH-RUNBOOK.md) | Auth config + triage |
| [`docs/PAY-GATE-ACCEPTANCE.md`](docs/PAY-GATE-ACCEPTANCE.md) | Pay gate regression checklist |
| [`.cursor/rules/hps-phases.mdc`](.cursor/rules/hps-phases.mdc) | Conventions (phase list is stale) |
