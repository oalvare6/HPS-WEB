# HPS project status

**Last updated: 2026-09-11**, after Stage 2.2 (the isolated `hps-dev` project) and Stage 2.3
A + B + C + D (offline payments, the send path, the cross-event guard, actionable review reasons).
This is a status page, not a history. For how any decision was reached, follow the links; for what to do next, read
[`ASTRA-HANDOFF.md`](ASTRA-HANDOFF.md).

⚠ **Nothing from Stage 2.1, 2.2 or 2.3 is in `main` or deployed.** It all lives on
`claude/dazzling-wozniak-es39bo`, validated against the isolated development project. Production
has none of the three new migrations, and its migration ledger is still drifted (below), so
shipping any of this is a deliberate, separately planned step.

## Where the system stands

The public site, sign-up, waiver and payment flows are live at
`www.houstonpremiersoccer.com` and carry real money and real rosters. The admin area runs the
operation: rosters, teams, schedules, scores, people and site settings. A remediation programme
through Stages 1.2 to 2.0 has closed most of `backend_audit_v1.md`. The exceptions are named below
— two of them, **F-00 (exposed credentials never rotated)** and **F-05 (no brute-force protection
on admin login)**, are still fully open and sit under "Pending operator actions" and "Known gaps".
What remains after that is product work, principally the owner-facing admin experience.

✅ **Stage 2.0 *is* in `main`** — commit `b2e2210`, merged by
[PR #10](https://github.com/oalvare6/HPS-WEB/pull/10) as `44a475e` on 2026-09-10. An earlier
revision of this page said it was not; that was wrong and is corrected here. Whether `main`'s
current tip is the *deployed* build is a Vercel question, not a git one — confirm in the Vercel
dashboard before relying on it.

## Completed (in the repository)

**Isolated development and Stage 2.3 backend** (Stages 2.2–2.3, 2026-09-10/11 — see
[`STAGE-2-2-REPORT.md`](STAGE-2-2-REPORT.md) and [`STAGE-2-3-PROPOSAL.md`](STAGE-2-3-PROPOSAL.md))
- **`hps-dev`** (`tfkdtwgxnumnuiiayrld`, PostgreSQL 17.6) — a standalone project, not a branch of
  Production — built from the migrations and verified object-by-object against the production
  catalog, then seeded with synthetic data. Stage 2.2 signed off at **44/44** acceptance checks
  run through the admin's own HTTP routes.
- **Offline payments (A).** `manual_payments`: amount, method, the date money changed hands, a
  note and who took it. Append-only; a correction voids and re-enters. Stripe stays authoritative
  for card settlement and is never overwritten.
- **The send path (B).** `message_batches` / `message_recipients`: server-resolved audiences, a
  compulsory dry run, idempotent sends, per-recipient outcomes and a retry that touches only
  failures. Delivery still requires `RESEND_API_KEY` + `RESUME_EMAIL_FROM`.
- **Cross-event team guard (C).** A trigger, not a composite FK — the PGRST201 trap.
- **Actionable review reasons (D).** Every writer of `needs_admin_review` is read back as a
  sentence with a "what to do"; a live check says what is unsafe right now; one route resolves,
  refusing while it still is unless the owner says in writing what they did; every resolution is
  a dated line in the ledger. No migration. The two cancelled-spot reasons are finally visible.

**Admin workspace** (Stage 2.1, 2026-09-10, owner-approved — see
[`STAGE-2-1-ADMIN-WORKSPACE.md`](STAGE-2-1-ADMIN-WORKSPACE.md))
- One page per event with Players, Teams, Schedule & results, Announcements and Event settings;
  filterable player lists with persistent URLs; one player-detail dialog; phone-first dialogs.


**Security and access** (Stage 1.2 — Stage 1.3's only deliverable, DocuSeal replay protection, was
written on a branch that never merged; see "Known gaps")
- Knowing an email address authorizes nothing. `POST /api/pay/eligibility` returns one neutral
  body to every caller and emails a one-time link instead.
- A signed-out player's only capability is an HttpOnly `hps_resume` cookie backed by a
  server-side row, scoped to one registration and a fixed set of actions.
- Resume state changes require same-origin proof.

**Payments** (Stages 1.4–1.4.1)
- One settlement path: the database function `finalize_checkout_payment`. Amount, currency and
  event are re-derived from server rows before a registration is confirmed; replays converge;
  the webhook returns 5xx on local failure so Stripe retries.
- Supabase is the only price. Checkout is created with a server-computed amount, and the amount
  a customer was quoted is recorded per Checkout Session, so editing an event's fee cannot
  invalidate a session already in flight. That record is best-effort: if the write fails it is
  logged and settlement re-derives today's fee instead.
- The payment repair script refuses to write anything the operator has not named.

**Schema and migrations** (Stage 1.6)
- `supabase/migrations/` now builds the entire schema from an empty database — it could not for
  four months, which is why every Preview branch failed. Five baseline migrations capture
  objects that only loose hand-run scripts had defined; those scripts are archived.
- A test applies all 44 files to an empty PostgreSQL, twice, and diffs the result against a
  captured production catalog (48/48). Every difference is allow-listed with a reason; the three
  Stage 2.3 migrations show as fresh-only until production has them and the catalog is re-captured.
- A tripwire in that test catches statements PostgreSQL 16 tolerates and Supabase's
  PostgreSQL 17 rejects — the failure mode that let a broken chain pass locally.

**Event state** (Stage 2.0 — in `main`; confirm the deployed build in Vercel)
- One resolver, `resolveEventView`, answers what an event is. Every card, badge, call to
  action, list order and archive bucket reads it, and its `canRegister` / `canPay` *are* the
  functions the money and sign-up routes gate on, so a page cannot advertise a door the backend
  will refuse.
- The admin's single status dropdown is now the only writer of the four columns behind it.
- Fixed by consequence: a closed event can no longer receive a sign-up through the API, and the
  homepage's registration indicator is derived from the events rather than typed in.

## Test baseline

Run on **`claude/dazzling-wozniak-es39bo` @ `40c39d2`** (Stage 2.1 + 2.2 + 2.3 A–D),
2026-09-11 — not on the old Stage 2.0 branch:

| | |
|---|---|
| `npx tsc --noEmit`, `npm run lint`, `npm run build` | all clean |
| 30 script suites | **6,533 counted assertions**, all passing |
| — of which 25 run in-process | 6,205 (24 report a count; `test-admin-workspace` passes but prints none) |
| — of which 5 execute real SQL | 328 (`finalize` 126, `stripe-integration` 90, `migrations-from-empty` 48, `manual-payments` 34, `messages` 30) |

Five suites execute real SQL against a PostgreSQL they provision themselves: the two settlement
suites, the from-empty migration suite and the two Stage 2.3 suites. They fail rather than skip.
The full command list is in [`../CLAUDE.md`](../CLAUDE.md).

Two caveats on this run, stated rather than hidden. The SQL suites ran against **PostgreSQL
16.13**, so they do not re-prove the PG17 `IF EXISTS … ON <relation>` behaviour — the
from-empty suite's notice tripwire covers the specific trap, and the Supabase Preview branch on
the pull request remains the last word. And `verify-event-state-pages.mjs` (headless Chromium,
46 assertions on the Stage 2.0 branch) was **not** re-run here; it was unchanged by this branch.

## Remaining work

**Next up — shipping Stage 2.1–2.3.** The admin workspace (2.1), the isolated development
project (2.2) and all four Stage 2.3 items are built and validated against `hps-dev`; nothing is
on `main` or deployed. **The plan for shipping it is written:
[`RELEASE-READINESS-STAGE-2.md`](RELEASE-READINESS-STAGE-2.md)** — the exact SHAs, the migration
state verified live against production, the ledger repair, the forced deploy order (migrations
before code — the roster depends on `manual_payments`), stop conditions, rollback and a smoke
checklist. Its verdict is **ready once operator actions are completed**; the first of those is
reading one Supabase dashboard toggle. [`ASTRA-HANDOFF.md`](ASTRA-HANDOFF.md) was the brief Stage
2.1 answered; it is kept for the architecture and invariants.

**Pending operator actions** (production changes, deliberately not automated)
- **The migration ledger is still drifted.** 22 rows against 44 files, confirmed live
  2026-09-11. Until the repair in
  [`STAGE-1-6-MIGRATION-RECONCILIATION.md`](STAGE-1-6-MIGRATION-RECONCILIATION.md) §8 is run,
  **do not `supabase db push` against production** — it would re-run **28** already-applied
  files (not nineteen: the nine MCP-versioned rows match no filename either, so a push re-runs
  those too — see [`RELEASE-READINESS-STAGE-2.md`](RELEASE-READINESS-STAGE-2.md) §3.4), one of
  which cancels duplicate registrations. A green Supabase preview branch does not change this:
  preview proves the files build from *empty*, and production is not empty. The two migrations
  dated 2026-09-10 — the settlement lock-order fix and the checkout-attempts table — **are** live
  in production; verified against the deployed function and catalog on 2026-09-10.
- **The exposed credentials have still not been rotated** (audit finding F-00). A service-role
  key, the JWT secret and the Postgres password were reachable behind a public preview URL for
  roughly two months. The exposure was closed; rotation was deferred and no document records it
  happening. [`../credential_containment_plan.md`](../credential_containment_plan.md) is a
  read-only plan — it states plainly that nothing in it has been executed.
- **No Stripe webhook delivery has been recorded yet.** `stripe_webhook_events` is empty, so
  the deployed endpoint has not yet been proved end to end. The sandbox procedure needs an
  operator with a test-mode key.
- **One historical payment is still unreconciled** — a registration that remains unpaid against
  a succeeded Stripe payment. Verified still present on 2026-09-10. The repair is rehearsed and
  scoped; it has not been run.
- Google sign-in works; Apple was removed. Legal pages are published but not lawyer-reviewed.

**Known gaps in the code** (found while writing this; not yet scheduled)
- **The DocuSeal webhook is not replay-protected.** The table and claim function exist in
  production and in `supabase/migrations/`, but nothing in `src/` calls them — that code was
  written on a branch that never merged. A replayed delivery with no `completed_at` can re-stamp
  a signature date and silently extend a waiver by up to a year.
- **A second signed-out credential is still live.** Besides the resume session, a 90-day HMAC
  `payToken` travels in URLs and is accepted by eight surfaces. Stage 1.2 removed the *oracle*
  that handed one out for an email address; it did not remove the token.
- **Admin login has no brute-force protection** (audit finding F-05) on its one static credential:
  no rate limit, no lockout, no delay, and no rate limiting anywhere else in `src/` either.
- Waiver validity is stricter at the gates (`isContactWaiverValid`, exact adult/youth match) than
  in the admin display (`waiverStatusFor`, which is never passed a waiver type at all), so the
  roster can show a green tick for someone a youth gate would refuse. Note this is a separate thing
  from the operator's deliberate decision to show a covered person a green tick whatever the paper
  trail; the type-blindness is a defect.

## Deferred by decision

- **Refunds and disputes.** `charge.refunded` and `charge.dispute.*` are unhandled; a refund is
  an admin-set status only.
- **Public-site UX, SEO, accessibility and performance** — after the admin.
- **Schema cleanup**: `tournaments.stripe_price_id` / `stripe_product_id` are still written and
  nothing *prices* from them, though the admin routes and the reconcile script do read them — so a
  drop is a real change, not a no-op. `drop_ins` and `team_members` hold no production rows but
  still have live code paths, including guest rows in the admin roster.
- The deeper data-model rebuild in [`REBUILD-PLAN.md`](REBUILD-PLAN.md) Track B (one roster
  table, people keyed by phone).

## Reading order for a new contributor

1. [`../README.md`](../README.md) — what this is and how to run it
2. [`../CLAUDE.md`](../CLAUDE.md) — conventions and the traps already paid for
3. [`ASTRA-HANDOFF.md`](ASTRA-HANDOFF.md) — the current system and the invariants
4. [`REBUILD-PLAN.md`](REBUILD-PLAN.md) — the operator's product decisions

Everything else under `docs/` is evidence of how a decision was reached. `FOLLOWUPS.md`, the
session logs and `backend_audit_v1.md` are **history**: useful for the reasoning, superseded by
the code and by the documents above wherever they disagree.
