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
npm run build
```

**Two rules that are easy to break:**

- **`/register` is the only front door to signing up.** `/pay` without a signed resume
  token redirects there. Do not add a second entry point — that was the bug (plan §A6).
- **Signing in is not required to register or pay.** Sign-in is **Google only** (Apple was
  removed 2026-08-14 — never configured, so it failed every tap). Gating signup on sign-in
  would take the site offline for players (§A8, §9).

**The auth trap that cost a week:** Supabase's **Site URL and Redirect URLs** must list the
real domain. They pointed at `hps-web-oalvare6s-projects.vercel.app` until 2026-08-14, and
`www.houstonpremiersoccer.com/auth/callback` matched none of them — so Supabase silently
redirected to the Site URL instead of erroring, `/auth/callback` never ran, and **no player
could complete a Google sign-in on the real domain** (1 MAU, zero `auth.sessions` after
2026-07-01). If sign-in ever "does nothing" or lands on a strange hostname, check that
allow-list *before* reading any code.

| Doc | What |
|---|---|
| [`docs/REBUILD-PLAN.md`](docs/REBUILD-PLAN.md) | **The active plan.** Start here. |
| [`docs/SESSION-LOG-2026-08-13.md`](docs/SESSION-LOG-2026-08-13.md) | **Most recent session.** What shipped, what's live, what's still owed. Read after the plan. |
| [`FOLLOWUPS.md`](FOLLOWUPS.md) | Append-only log of known issues |
| [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md) | Shipped status (pre-dates the rebuild plan) |
| [`docs/AUTH.md`](docs/AUTH.md), [`docs/AUTH-RUNBOOK.md`](docs/AUTH-RUNBOOK.md) | Auth config + triage |
| [`docs/PAY-GATE-ACCEPTANCE.md`](docs/PAY-GATE-ACCEPTANCE.md) | Pay gate regression checklist |
| [`.cursor/rules/hps-phases.mdc`](.cursor/rules/hps-phases.mdc) | Conventions (phase list is stale) |
