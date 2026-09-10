# Stage 2.2: standalone development Supabase checklist

> **Executed 2026-09-10, with two deviations. Read [STAGE-2-2-REPORT.md](STAGE-2-2-REPORT.md)
> for what was actually done and what is still owed.**
>
> The owner approved project creation, connector-based migration, and direct writes limited to
> synthetic development cases no application route can produce. `hps-dev` /
> `tfkdtwgxnumnuiiayrld` (PostgreSQL 17.6) exists, carries all 41 migrations, and is seeded
> and validated at the database layer.
>
> **Deviation 1 — the connector, not the CLI.** §2's PowerShell `supabase db push` sequence was
> not used. An authenticated Supabase management connector was available (contradicting
> [STAGE-2-2-INTEGRATION-READINESS.md](STAGE-2-2-INTEGRATION-READINESS.md), which recorded that
> none was), and it applied the migrations over the management API. That needs no CLI and **no
> database password**, so no database secret entered the session. The CLI sequence below stays
> valid for an operator who prefers it. One consequence to know: the management API assigns its
> own ledger versions, so the ledger was rewritten to the filenames afterwards —
> `scripts/stage22-migrations.ts --verify` is what proves the result.
>
> **Deviation 2 — §3–§5 did not run in the remote session.** The session's egress policy denies
> `*.supabase.co`, so the app could never reach the project; only the connector could. The
> launcher, the seed and the acceptance run are therefore scripted for the operator's machine
> and are listed under "Running it locally" below. **Until those run, Stage 2.2 is not
> complete**, and the SQL-level results in the report must not be presented as UI coverage.

## Running it locally

The database is already migrated and seeded, so there are no records to create by hand:

```powershell
npx tsx scripts/stage22-setup-env.ts     # writes .env.stage22.local; the key is never echoed
npx tsx scripts/stage22-dev.ts           # isolated app on http://127.0.0.1:3022
npx tsx scripts/stage22-verify-local.ts  # automated acceptance run, in a second terminal
```

`scripts/stage22-guard.ts` refuses Production in every one of them, before any network call.

---

**Original status, kept for the record: documentation only; awaiting approval.** No project creation, configuration, migration, reset, seed, environment-file edit or application launch is authorized by this checklist. Execute the steps below only after approval. Production must remain untouched. No push, merge, PR or deployment is part of this work.

The owner separately authorized committing/pushing the Stage 2 handoff to `astra/stage-2-1-admin`. That Git-only authorization does not approve database setup. See [the current Claude handoff](CLAUDE-STAGE-2-HANDOFF.md).

## 1. Create one empty, standalone development project

- [ ] Create a separate Supabase project named **`hps-dev`** in the intended HPS organization. This is a new project with its own database, Auth, Storage, project ref, API keys and database password. Do not create a branch of, restore from, or import data from Production. A new project's default branch label is not its identity: verify the project name and ref.
- [ ] Use PostgreSQL 17 if offered; the repository's successful preview migration replay used 17.6. Record the actual version and assess any major-version difference before applying migrations. Choose a suitable US region; no production region change is needed.
- [ ] Record the new development ref and URL in the local setup record. The allowed target must be this exact new ref. **Always reject Production ref `jqkiswwunrnyqjgroqtn`**, including its API hostname, direct database hostname and pooler username. Also reject any other unapproved ref.
- [ ] Generate a unique development database password. Keep it and API keys in an ignored local secrets file, never in chat, tracked files, screenshots or logs.
- [ ] Leave GitHub/Vercel integration, external SMTP, database webhooks, scheduled jobs and external provider integrations unconfigured. Do not copy production settings, Auth users, objects, Stripe IDs, DocuSeal submissions or secrets.

The previously documented preview ref `ddjfsqqaywmmtvaqnfqn` did not resolve during inspection; this does not prove it was deleted. This checklist deliberately targets the requested standalone replacement, not either historical preview branch.

## 2. Apply the existing 41 migrations, once, in filename order

- [ ] Use the **unchanged** files in this checkout's `supabase/migrations/`, listed in the manifest below. They include the baseline schema, RLS, Storage buckets/policies and the current registration, waiver, payment and result RPC infrastructure. Do not skip backfills merely because this database starts empty.
- [ ] Prepare a new, isolated migration workspace outside the repository, initialize local CLI configuration there, and copy only these migration files into its `supabase/migrations/`. Do not link the CLI to any remote project.
- [ ] Copy the **new development project's** PostgreSQL URI from its Dashboard Connect panel. Use a direct connection where available, or its session pooler on port 5432 for IPv4. Do not use the transaction pooler for this migration run. Percent-encode the password in a URI; copy the pooler hostname rather than guessing it. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).
- [ ] Verify the URI identifies the exact approved development ref: `db.<DEV_REF>.supabase.co` for a direct URI, or `postgres.<DEV_REF>` as the session-pooler username. Refuse an ambiguous/custom host unless its identity is independently verified. Confirm the database contains no HPS application tables before the first migration.
- [ ] Run a dry run against that explicit URI; expect all 41 files. Apply only after the target and list match. Stop on a failure and diagnose it; do not reset, repair the ledger, or switch targets to get past an error.

The following is the intended PowerShell command sequence **after approval and the identity checks above**, with the Supabase CLI available. `$stage22MigrationWorkspace` is a new absolute directory outside the repository; `$stage22Repo` is this checkout's absolute path. `HPS_DEV_DATABASE_URL` is loaded privately from the ignored file; it is never typed inline or printed. These variables are operator helpers, not new application contracts.

```powershell
New-Item -ItemType Directory -Path $stage22MigrationWorkspace -ErrorAction Stop
supabase --workdir "$stage22MigrationWorkspace" init
New-Item -ItemType Directory -Path (Join-Path $stage22MigrationWorkspace 'supabase/migrations') -Force
Get-ChildItem -LiteralPath (Join-Path $stage22Repo 'supabase/migrations') -Filter '*.sql' |
    Copy-Item -Destination (Join-Path $stage22MigrationWorkspace 'supabase/migrations')
supabase --workdir "$stage22MigrationWorkspace" db push --db-url "$env:HPS_DEV_DATABASE_URL" --dry-run
# Inspect the target and all 41 pending migrations before the next command.
supabase --workdir "$stage22MigrationWorkspace" db push --db-url "$env:HPS_DEV_DATABASE_URL"
supabase --workdir "$stage22MigrationWorkspace" migration list --db-url "$env:HPS_DEV_DATABASE_URL"
```

Run each step separately, checking its exit status; this is not an unattended script. The CLI's explicit `--db-url` selects the target and `--dry-run` lists pending migrations. Do not use `--linked`, `db reset`, `migration repair`, `db pull`, production dumps, archived loose SQL, or `scripts/sql/local-supabase-preamble.sql` on this hosted project. The preamble is for plain PostgreSQL tests, not a hosted Supabase database. [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push).

- [ ] Verify the complete remote migration ledger matches the 41 local versions, with latest version **`20260910130000`**. Check expected tables, RPCs and RLS against the local migrations. Confirm `tournament-images` is public, `waiver-signatures` is private, and their expected policies exist; a migration NOTICE about a skipped policy is not a passing Storage check. Resolve any setup discrepancy only in Development and record it.
- [ ] Verify the app can use the new project's Data API and Storage. Do not change production migration history to make it resemble Development.

### Exact migration manifest

```text
20260319215600_create_registrations.sql
20260319224900_add_docuseal_columns_to_registrations.sql
20260327000000_create_payments.sql
20260513000100_create_tournaments.sql
20260513000200_add_tournaments_featured_and_updates.sql
20260513000300_create_site_settings.sql
20260513000400_create_storage_buckets.sql
20260513120000_create_tournament_rounds.sql
20260513120100_enable_citext.sql
20260513120200_create_contacts.sql
20260513120300_create_teams.sql
20260513120400_create_drop_ins.sql
20260513120500_alter_tournaments_pricing.sql
20260513120600_alter_registrations_links.sql
20260513120700_alter_payments_links.sql
20260513120800_backfill_contacts.sql
20260513120900_backfill_tournament_links.sql
20260513121000_rls_policies.sql
20260513121100_drop_legacy_overrides.sql
20260513121200_waiver_bucket_policies.sql
20260521124500_add_contact_waiver_fields.sql
20260521150000_link_registrations_to_teams.sql
20260521170000_add_registration_needs_admin_review.sql
20260521203000_add_contact_profile_emergency_fields.sql
20260603120000_pay_email_lookup_indexes.sql
20260619140000_create_matches_and_scorers.sql
20260731090000_add_match_advanced_team.sql
20260812190000_add_tournaments_is_draft.sql
20260812210000_create_waiver_signatures.sql
20260814230000_add_tournaments_kind.sql
20260814234500_add_registrations_cancelled_at.sql
20260815001500_dedupe_registrations_and_guard.sql
20260815030000_add_open_play_free_entry_config.sql
20260815031000_open_play_attendance_and_free_entry.sql
20260908120000_round_counts_and_scorer_identity.sql
20260908120100_matches_integrity_constraints.sql
20260909120000_registration_resume_access.sql
20260909120100_stripe_payment_finalization.sql
20260909130000_docuseal_webhook_events.sql
20260910120000_finalize_link_tolerance_and_lock_order.sql
20260910130000_stripe_checkout_attempts.sql
```

## 3. Supply development-only local environment values

- [ ] Create **`.env.stage22.local`**, which is already covered by `.gitignore`, with the placeholders below replaced locally. Do not overwrite the current production-facing `.env.local` and do not pull Vercel environment variables.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<DEV_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<DEV_PROJECT_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<DEV_PROJECT_SERVICE_ROLE_KEY>
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3022
ADMIN_USER=hps-stage22
ADMIN_PASSWORD=<UNIQUE_DEVELOPMENT_PASSWORD>
APP_SIGNING_SECRET=<NEW_RANDOM_SECRET_OF_AT_LEAST_32_BYTES>

# Operator tools only; do not pass the database URI to the app/browser.
HPS_DEV_PROJECT_REF=<DEV_REF>
HPS_DEV_DATABASE_URL=<DEV_ONLY_POSTGRES_URI>
```

Use the new project's matching legacy `anon` and `service_role` keys for the first pass with the existing app configuration. Supabase also supports newer publishable/secret keys; changing key types is not required for this integration pass. The elevated key stays server-only, and must never receive a `NEXT_PUBLIC_` prefix. [Supabase API key documentation](https://supabase.com/docs/guides/getting-started/api-keys).

`APP_SIGNING_SECRET` is the current canonical name in `src/lib/app-signing.ts`; `.env.example` still documents its legacy alias, `ADMIN_SESSION_SECRET`. Set the canonical name with a new development value. No production secret rotation or authentication change is needed.

- [ ] Omit/unset all `STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `DOCUSEAL_*`, `RESEND_API_KEY`, `RESUME_EMAIL_FROM`, `RESUME_EMAIL_REPLY_TO`, `VERCEL_OIDC_TOKEN`, and the legacy `ADMIN_SESSION_SECRET` in the isolated process. They must not be inherited from the shell or the existing `.env.local`. Keep `HPS_TEST_DATABASE_URL` unset: reset-based PostgreSQL suites must never target this persistent project.
- [ ] Start the app through a dedicated local launcher that explicitly loads this custom file into an isolated source copy. **That launcher is still to be implemented after approval.** Next.js does not automatically load `.env.stage22.local`; ordinary `npm run dev` in this checkout is not the intended launch command.
- [ ] The isolated copy must exclude `.env*`, `.vercel`, Supabase links and existing build output; use its own `.next` directory. Pass only the required development app values and ordinary OS runtime variables. Validate the exact dev ref before starting Next.js. Preserve the Stage 2.1 source changes in this copy.
- [ ] Use `http://127.0.0.1:3022` consistently, with a separate browser profile/session. Confirm browser requests and server clients target only the approved Supabase ref and that generated registration/waiver links remain local. No production API request is needed as a connectivity check.

The minimal admin/public-registration test path uses existing local admin authentication and native waiver signing, without external OAuth or email. If returning-player Supabase Auth login is included, configure only the new development project's Auth Site URL to `http://127.0.0.1:3022` and allow `http://127.0.0.1:3022/auth/callback`; use a dedicated development OAuth client or controlled synthetic Auth identities as appropriate. Do not reuse a production OAuth client or weaken authentication. Report any untested OAuth path explicitly.

## 4. Seed synthetic data through the existing contracts

There is no database seed script yet. `scripts/fixtures/admin-workspace.mjs` supplies mock responses and is **not** a database seeder. After approval, implement a development-only seed runner and ID manifest; it must refuse any target except the exact approved dev ref before making a request.

- [ ] Use a unique run prefix such as `stage22-<run-id>` for event slugs and synthetic identities, reserved `example.com` email addresses and fictional phone numbers. Record every created event, contact, registration, team, round, match, scorer and payment ID in the manifest. Never read Production to create sample data.
- [ ] Create one populated tournament, one empty tournament, one second tournament with overlapping player names/identities, and one open-play event using the existing admin event APIs. Use development dates relative to the test date so attention and event-state cases remain meaningful; record the dates. Add simple synthetic event artwork through the existing upload route to validate Storage.
- [ ] Register the main tournament's 12 synthetic players through `/api/register` and the existing confirmation flow. Include adult and youth cases with fictional guardian details; verify contact and registration links. Use the existing native waiver signing flow for successful signatures and verify the `waiver_signatures` row, contact coverage, registration evidence and local `/waiver/<id>` document. Native signing does not upload to the legacy `waiver-signatures` bucket.
- [ ] Prepare missing/expired waiver evidence and legacy evidence without a document by narrowly scoped development-only seed writes where no normal UI action produces that state. Label those rows as synthetic edge cases in the manifest. Do not change waiver rules or claim seeded evidence proves a provider callback works.
- [ ] Use the existing authenticated registration PATCH route to assign the following states. Compare UI counts with actual database registration IDs.

| Main tournament status | Players | Financially accounted for |
|---|---:|---:|
| Paid | 5 | 5 |
| Waived/free (`waived`) | 2 | 2 |
| Pending | 3 | 0 |
| Partial | 1 | 0 |
| Refunded | 1 | 0 |
| **Total** | **12** | **7** |

Expected financial display: **7 / 12 accounted for; 5 outstanding**. Waived/free counts equally with paid. No 50% eligibility gate, event-state transition or serious warning may be introduced. A partial/refunded player remains separately identifiable; do not describe all five outstanding players as having never paid.

- [ ] For payment-ledger display cases, seed a small, explicitly synthetic set of `payments` rows linked to the created contacts/registrations/events, using the schema's existing fields and units. These are development fixture records, not real Stripe receipts. Registration status edits must not fabricate payment ledger rows. Leave external provider IDs absent where allowed, otherwise use unmistakably synthetic IDs that will never be sent to a provider. Record seeded amounts/statuses independently in the manifest.
- [ ] Create two teams, captains, assigned and unassigned players through existing admin APIs. Exercise moves and reject a team from another event. Add missing emergency details, absent optional email/phone and an admin-review flag as separate cases without violating required-field constraints.
- [ ] Create league rounds, a non-table playoff round, a canceled round, scheduled/postponed/undated fixtures and a past fixture awaiting a result. Save a completed result and roster-linked scorers through the existing result endpoint and `save_match_result` RPC. Do not directly seed the successful result used to prove the result-entry workflow.
- [ ] Make reruns reuse a known manifest or create a new run prefix. Do not clear schemas, truncate tables, reset the project or delete unrelated records. Any later cleanup is limited to manifest-owned synthetic rows in this development project.

**Provider boundary:** the minimum setup validates real database-backed payment statuses and native waivers. It does not validate an actual card charge, refund settlement, Stripe webhook delivery or DocuSeal callback. Those require separately isolated Stripe sandbox/test credentials and, for DocuSeal, a dedicated test account. Keep production credentials absent; do not represent seeded payment rows as successful provider integration. General Resend messaging and detailed Cash/Zelle receipt tracking remain outside this pass.

## 5. Verify Stage 2.2 against database-backed data

- [ ] Walk through **registration → confirmation → waiver → payment status → team → schedule → result/scorer → standings/statistics**, comparing browser/API responses and persisted rows by ID. Reload between stages so cached or optimistic UI cannot masquerade as persistence. Record what was seeded directly versus created through the application.
- [ ] Test populated, empty, loading, failed requests, partial, waived/free, refunded and missing-data cases. Delay/fail selected browser HTTP requests for transient-state tests; successful requests still use the real dev database. Confirm useful errors, retry and unsaved-input behavior without showing fabricated success or zero totals.
- [ ] Verify name/email/phone search, event/team/status combinations, dashboard attention links, refresh and back navigation. Compare the exact rendered registration IDs with an independent database query, including identical names across events and deleted/missing selections. Check desktop and mobile.
- [ ] Prove score math with a fresh league fixture: Team A beats Team B **2–1**; expect A: played 1, won 1, GF 2, GA 1, GD +1, points 3; B: played 1, lost 1, GF 1, GA 2, GD −1, points 0. Assign A's two goals to one registered contact and B's goal to another; expect individual totals 2 and 1. Verify database contact IDs as well as labels.
- [ ] Edit and clear that result, confirming old scorer rows and old standings totals do not survive. Add another match for the same contact to verify aggregation by identity, and verify tied ranks and own-goal handling. Playoff results must follow the existing `counts_toward_table` behavior; current top-scorer calculations include played playoff matches. Preserve the existing World Cup published-table exception.
- [ ] Attempt invalid cross-event team/scorer assignments and a failed result save; verify the existing integrity checks reject invalid changes and do not leave partial result/scorer data. Verify anonymous access cannot read private contact/payment/waiver tables or write admin data. Keep existing RLS and authentication intact.
- [ ] Verify synthetic banner upload/public read and private-bucket access restrictions separately from native waiver signing. Test the signed document route's existing access behavior without changing it.
- [ ] Run appropriate existing local tests, type checks, lint and build using the isolated environment. The reset-based PostgreSQL suites require a separate disposable test database, never Production or this persistent development project. Do not count old fixture passes as real-data validation.
- [ ] Produce a Stage 2.2 report with: connected target/ref and completed tests; bugs/mismatches and evidence; remaining prototypes/provider coverage gaps; proposed Stage 2.3 backend work; and confirmation Production, deployment configuration and remote Git state were untouched.

## 6. Approval boundary and next phase

**Stop here until the user approves project creation/configuration and the development-only connection, migration and synthetic seed plan.** This document is the reviewable plan; none of its future commands have been executed.

Stage 2.3 candidates remain general Resend communication/reminder delivery, detailed Cash/Zelle receipt persistence and audit history, and any backend fixes demonstrated by real-data testing. Do not preemptively change backend contracts, payment authority, waiver/auth behavior or event-state logic to make an integration test pass.
