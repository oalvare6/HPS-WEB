# Houston Premier Soccer

The website and back office for Houston Premier Soccer, a 7v7 amateur soccer organization in
south Houston. It runs the real operation: players find an event, sign up, sign a waiver and
pay; the owner manages rosters, teams, schedules and scores from an admin area; live standings
and results publish back to the public event page.

This is a working production system, not a brochure. It takes money, stores signed waivers and
holds the roster of record.

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript** (strict) · **Tailwind CSS**
- **Supabase** — Postgres, Storage, and player authentication (Google sign-in)
- **Stripe** — Checkout and payment settlement
- **DocuSeal** — waiver signing (with an in-app fallback when it is unavailable)
- **Resend** — transactional email for one-time registration resume links
- **Vercel** — hosting; one canonical host, `www.houstonpremiersoccer.com`

Admin authentication is a signed HMAC cookie, separate from player auth.

## Routes

**Public**

| Route | What |
|---|---|
| `/` | Home: featured event, recent events, location |
| `/events` | Every public event, split into tournaments and open play nights |
| `/events/[slug]` | One event: details, and for a live tournament the table, matches and scorers |
| `/about`, `/facility`, `/contact` | Marketing pages |
| `/privacy`, `/terms`, `/refunds`, `/cookies` | Legal pages |

**Sign up and pay**

| Route | What |
|---|---|
| `/register` | **The only front door to signing up.** One screen that resolves what this visitor still needs: the full form, a quick re-join, a waiver, payment, or a closed notice |
| `/register/waiver/[registrationId]` | In-app waiver signing (used when DocuSeal is unavailable) |
| `/pay` | Payment. When it is given an event that is still taking sign-ups it hands the visitor to `/register` instead |
| `/pay/resume/exchange` | Where the one-time emailed link actually lands. A GET never spends the token — the page posts it, so link scanners cannot burn it |
| `/pay/resume` | A player returning, once that token has been exchanged for a session |
| `/pay/success` | Post-checkout confirmation |
| `/waiver/[id]` | A printable record of a signed waiver |

**Player account** — `/login`, `/me` (registrations, payment history, waiver status, profile).
Signing in is optional: registering and paying both work signed out.

**Admin** — `/admin` (overview), `/admin/tournaments` (events; one page per event with Players,
Teams, Schedule & results, Announcements and Event settings tabs), `/admin/payments` (the Stripe
ledger), `/admin/contacts` (people), `/admin/site` (site settings), `/admin/diagnostics`.

## Local setup

```bash
npm install
cp .env.example .env.local    # fill in your own values
npm run dev                   # http://localhost:3000
```

`.env.local` is **required** — the build will succeed without it, but nearly every page fails at
runtime on its first query. At minimum set `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Admin sign-in additionally needs
`ADMIN_USER`, `ADMIN_PASSWORD` and a signing secret — the code prefers **`APP_SIGNING_SECRET`**
and accepts `ADMIN_SESSION_SECRET` only as a deprecated alias, so set the former even though
`.env.example` still lists the latter. Stripe, DocuSeal and Resend values are only needed to
exercise those specific flows.

**Never commit a real value.** `.env*` is gitignored except the example file.

## Build and test

```bash
npm run build          # production build
npm run lint           # ESLint
npx tsc --noEmit       # typecheck
```

There is no `npm test`. The suites are standalone scripts run with `npx tsx scripts/<name>.ts`
(`tsx` is not a dependency — npx fetches it). The list you are expected to run before claiming a
change works is in [`CLAUDE.md`](CLAUDE.md); it covers event state, sign-up state, standings,
schedules, the resume-link flow, Stripe checkout, settlement and reconciliation.

Three of them execute real SQL against a throwaway PostgreSQL (they start their own cluster if
one is not already available): the two settlement suites and `test-migrations-from-empty.ts`,
which rebuilds the whole schema from nothing and diffs it against production's catalog. They
**fail rather than skip** when no database can be provisioned.

`node scripts/verify-event-state-pages.mjs --build` renders the homepage, `/events`,
`/register` and an event page in headless Chromium against a fixture database and asserts that
all four agree about every event.

Database migrations live in `supabase/migrations/`, one timestamped file each. **Never put a
`.sql` file directly under `supabase/`** — that is what left the schema unbuildable from scratch
for four months. Other SQL in the repo (`scripts/sql/`, operator paste-files under `docs/`) is
fine. Read the migration notes in [`CLAUDE.md`](CLAUDE.md) before touching any of it, and do not
run `supabase db push` against production.

## Documentation

Start with **[`CLAUDE.md`](CLAUDE.md)** — the conventions and the traps that have already cost
this project time.

| Doc | For |
|---|---|
| [`docs/ASTRA-HANDOFF.md`](docs/ASTRA-HANDOFF.md) | **Product, UI or admin work.** The current system in one read |
| [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md) | What is done, what is open, what is deferred |
| [`docs/REBUILD-PLAN.md`](docs/REBUILD-PLAN.md) | The operator's locked product decisions and the evidence behind them |
| [`docs/STAGE-2-0-EVENT-STATE.md`](docs/STAGE-2-0-EVENT-STATE.md) | The one authoritative event-state model |
| [`docs/STAGE-1-6-MIGRATION-RECONCILIATION.md`](docs/STAGE-1-6-MIGRATION-RECONCILIATION.md) | Schema and migration reconciliation |
| [`docs/AUTH.md`](docs/AUTH.md), [`docs/AUTH-RUNBOOK.md`](docs/AUTH-RUNBOOK.md) | Authentication setup and triage |

Older session logs and audit reports under `docs/` are kept as evidence of how decisions were
reached. They are **history, not current truth** — where they disagree with the code or with the
documents above, the code wins.
