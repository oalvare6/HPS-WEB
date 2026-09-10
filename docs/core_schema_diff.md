# Core Schema Reconciliation — production vs. repository

> **Superseded in part on 2026-09-10 by
> [`STAGE-1-6-MIGRATION-RECONCILIATION.md`](STAGE-1-6-MIGRATION-RECONCILIATION.md).** The
> "table defined only by a loose file" rows in §2 and the loose-file list in §3 are closed:
> every table is now created by a migration and the loose scripts are archived under
> `docs/archive/loose-sql/`. The full-schema comparison (every table, not just the eight
> here) lives in `docs/production-schema-catalog-2026-09-10.json` and is re-checked by
> `scripts/test-migrations-from-empty.ts`. §3's ledger table is still accurate — the ledger
> was **not** repaired — and the Stage 1.6 report §8 gives the exact repair commands.

**Captured:** 2026-09-09, read-only. Production evidence is in `docs/core_schema_snapshot.sql`. Nothing was changed on the remote project; no migration history was repaired.

**Scope:** the tables and functions behind registration, payment, roster and waiver state: `registrations`, `payments`, `tournaments`, `contacts`, `teams`, `drop_ins`, `waiver_signatures`, `site_settings`, plus the RPCs that touch them.

Classification legend: **production-only** (exists live, no repo definition) · **repo-only** (defined in repo, absent live) · **constraint drift** · **type drift** (TypeScript vs. live) · **migration-ledger drift** · **unknown**.

---

## 1. Summary

| Area | Result |
|---|---|
| Column sets for all 8 core tables | **Match** production ⇄ (loose SQL + migrations) column-for-column. No production-only or repo-only *columns* in scope. |
| Table definitions | 3 core tables (`tournaments`, `payments`, `site_settings`) are defined only by undated loose files under `supabase/`, not by any migration. |
| Constraints | 1 constraint drift (`registrations_registration_type_check`), 2 documented-but-never-applied NOT NULLs. |
| Types (`src/lib/types.ts`) | 3 type drifts, none affecting F-01/F-02 correctness. |
| Migration ledger | 22 ledger rows vs 30 files; 8 files absent from the ledger; 9 version stamps differ. |
| Functions | Production has exactly the 3 business functions the repo defines; **no** function exists yet for payment finalization or token exchange (the forward migrations in this remediation add them). |
| F-02 record | Located and documented (§5). Not modified. |

The forward migrations written for this remediation (`supabase/migrations/20260909120000_registration_resume_access.sql`, `20260909120100_stripe_payment_finalization.sql`) are **purely additive** (new tables, new functions, new indexes) and reference only columns confirmed present above, so they apply cleanly against the verified production structure regardless of the ledger drift.

---

## 2. Table-by-table

### registrations
| Item | Production | Repository | Class |
|---|---|---|---|
| 31 columns | as snapshot | `20260319215600` + `…224900` + `20260513120600` + `20260521150000` + `20260521170000` + `20260814234500` + `20260815031000` | match |
| `registration_type` CHECK | `('team','adult','youth','freeagent')` | `20260319215600:23` says `('adult','youth')`; `supabase/migrate-registration-type-adult-youth.sql` was meant to narrow it | **constraint drift** (production wider than repo; harmless today: 123 adult / 20 youth rows) |
| `tournament_id`, `contact_id` nullability | nullable | `20260513120600:2-3` comment promises NOT NULL after backfill; never applied | **constraint drift** (37 and 2 null rows respectively) |
| `payment_method` | free text, no CHECK | `src/lib/payment-method.ts` restricts to `card`/`cash` in code | app-only invariant (unchanged by this work) |
| `registrations_one_live_spot_idx` | present, partial unique | `20260815001500:85-87` | match (ledger stamp differs: `20260814185600`) |
| `waiver_submission_id text` vs `docuseal_submission_id integer` | both present | both in repo | match; `Registration` type declares both |

### payments
| Item | Production | Repository | Class |
|---|---|---|---|
| Table | 14 columns | `supabase/payments.sql` (loose, undated) + `20260513120700` | **table defined only by a loose file** (not production-only — the file exists — but not reproducible from `migrations/`) |
| `stripe_session_id` UNIQUE | `payments_stripe_session_id_key` | `payments.sql:22` | match |
| `stripe_payment_intent_id` partial UNIQUE | present | `20260513120700:26-28` | match |
| Stripe *event* id column | **absent** | absent | none — added by `stripe_webhook_events` table in the F-02 migration |
| `amount` | `numeric` (dollars) | `numeric(10,2)` in file | match (precision not surfaced by information_schema at this level) |
| `Payment` type (`src/lib/types.ts:506-522`) | — | matches columns | match |

### tournaments
| Item | Production | Repository | Class |
|---|---|---|---|
| 30 columns | as snapshot | `supabase/tournaments.sql` (loose) + `tournaments-featured-and-updates.sql` (loose) + `20260513120500` + `20260812190000` + `20260814230000` + `20260815030000` | **table defined only by loose files** |
| CHECKs (`status`, `kind`, fees) | present | present | match |
| `Tournament` type | `kind?` and `free_entry_tournament_ids?` optional by design | live columns NOT NULL with defaults | intentional (deploy-order tolerance, documented in `types.ts`) |

### contacts
| Item | Production | Repository | Class |
|---|---|---|---|
| 19 columns, citext email, unique index | as snapshot | `20260513120200` + `20260521124500` + `20260521203000` + `20260812210000` | match |
| `waiver_source` CHECK includes `'in_app'` | yes | `20260812210000:71-79` | match |
| `Contact.waiver_source` TS union | — | `"docuseal" \| "admin_override" \| "import" \| null` (`types.ts:347`) omits `"in_app"` | **type drift** (app writes `in_app` via `waiver-capture.ts:256`) |
| `auth_user_id` | absent | absent (REBUILD-PLAN target model only) | none — identity is email |

### teams, drop_ins, waiver_signatures, site_settings
All columns, FKs, CHECKs and indexes match their migrations (`20260513120300`, `20260513120400`, `20260812210000`) or loose file (`supabase/site-settings.sql`). `drop_ins.contact_id` is `ON DELETE RESTRICT` in both. `waiver_signatures.registration_id` cascades in both (noted in the audit as a retention risk; unchanged here).

### Functions
| Function | Production | Repository | Class |
|---|---|---|---|
| `open_play_attendees(uuid)` | present, SECURITY INVOKER, `set search_path=public` | `20260815031000` | match |
| `save_match_result`, `clear_match_result` | present, bodies match | `20260908120000` | match (ledger stamp `20260909004333`) |
| `set_updated_at*` trigger functions | 9 present | defined across files | match; advisor flags mutable `search_path` (pre-existing) |
| Payment finalization / token exchange / rate-limit functions | **absent** | absent before this remediation | added by forward migrations (see §4) |

### RLS
Production: RLS enabled on all 13 tables; SELECT-only public policies on `tournaments (is_draft=false)`, `tournament_rounds`, `tournament_updates`, `matches`, `match_scorers`, `site_settings`; zero policies on the six PII tables and `waiver_signatures`. Matches `20260513121000` + `20260812190000` + `20260619140000`. No drift.

---

## 3. Migration-ledger drift (documented, NOT repaired)

| Repo file | Ledger entry | Class |
|---|---|---|
| `20260513121100_drop_legacy_overrides.sql` | none | ledger drift (object state matches: `league_round_overrides` absent) |
| `20260513121200_waiver_bucket_policies.sql` | none | ledger drift (no-op file) |
| `20260521124500_add_contact_waiver_fields.sql` | none | ledger drift (columns present) |
| `20260521150000_link_registrations_to_teams.sql` | none | ledger drift (column + FK present) |
| `20260521170000_add_registration_needs_admin_review.sql` | none | ledger drift (present) |
| `20260521203000_add_contact_profile_emergency_fields.sql` | none | ledger drift (present) |
| `20260603120000_pay_email_lookup_indexes.sql` | none | ledger drift (indexes present) |
| `20260908120100_matches_integrity_constraints.sql` | none | ledger drift (constraint present) |
| `20260619140000`, `20260812190000`, `20260812210000`, `20260814230000`, `20260814234500`, `20260815001500`, `20260815030000`, `20260815031000`, `20260908120000` | present with **different version stamps** | ledger drift (MCP-applied; FOLLOWUPS.md:460-464) |
| `supabase/tournaments.sql`, `payments.sql`, `site-settings.sql`, `tournaments-featured-and-updates.sql`, `tournament-rounds.sql`, `storage-bucket.sql`, `tournament-images-bucket.sql` | n/a (never migrations) | loose definitions |

Consequence for this task: `supabase db push` would attempt to re-apply the 8 unlisted files and would **not** recognise the 9 re-stamped ones as applied. Every repo migration is written `if not exists` / idempotently *except* the constraint-swap in `20260812210000` (which uses `drop constraint if exists` — a no-op if the auto-generated name differs). **Do not run `db push` until the ledger is repaired in a separate, deliberate task.** The two new forward migrations are safe to apply by hand (SQL editor or MCP `apply_migration`) in either order-of-ledger state, because they create only new objects.

---

## 4. Forward migrations added by this remediation (not applied)

| File | Objects | Depends on verified production columns |
|---|---|---|
| `supabase/migrations/20260909120000_registration_resume_access.sql` | tables `registration_access_tokens`, `registration_sessions`, `resume_link_requests`; functions `consume_registration_access_token(...)`, `record_resume_link_request(...)`; RLS enabled, no policies; service_role-only execute | `registrations.id` |
| `supabase/migrations/20260909120100_stripe_payment_finalization.sql` | table `stripe_webhook_events`; function `finalize_checkout_payment(...)`; RLS enabled, no policies; service_role-only execute | `payments(stripe_session_id UNIQUE, stripe_payment_intent_id, registration_id, drop_in_id, tournament_id, contact_id, email, amount, currency, tournament_name, status, notes)`, `registrations(payment_status, cancelled_at, needs_admin_review, notes, team_name)`, `drop_ins(payment_status)` — all confirmed above |

Both are additive; old application code keeps working with the new schema (it never reads the new objects), and the new code fails closed (500 / "not configured") rather than corrupting data if deployed before the migration.

---

## 5. The known $80 inconsistency (F-02) — verified read-only

| Field | Value |
|---|---|
| `registrations.id` | `803e3697-4476-41ea-bdaa-afec654bdf7c` |
| Event | `community-cup-fall-2026` (`entry_fee_cents = 8000`) |
| Registration status | `payment_status = 'pending'`, `payment_method = 'card'`, `cancelled_at = NULL`, `waiver_signed = true`, `docuseal_status = 'signed'`, `registration_type = 'youth'`, team assigned |
| Registration timestamps | created `2026-08-22 01:33:00Z`; updated `2026-08-24 02:04:47Z` |
| `payments.id` | `bbd7fa9b-d482-48f6-a6d4-c5ea47e3d7b7` |
| Payment row | `status = 'succeeded'`, `amount = 80.00`, `currency = 'usd'`, `stripe_session_id` present (prefix `cs_live`), `stripe_payment_intent_id` present (prefix `pi_`), `registration_id` = the row above, same `tournament_id`, same `contact_id`; created `2026-08-22 01:33:36Z` (36 s after the registration) |
| Roster state | live (not cancelled), on a team, counted as "still owes $80" by the Roster and shown "Pay $80 now" by `/register` |
| Expected state | `payment_status = 'paid'` |

Name, email and phone were not retrieved. **The record was not modified.** The new `finalize_checkout_payment` function converges exactly this shape (payment row present, registration pending) when the Stripe session is reprocessed by the webhook, the success page, `sync-payments`, or `scripts/reconcile-payments.ts --apply`; the operator chooses when.

---

## 6. Evidence unavailable through authorized read-only tooling

- Whether any `sb_secret_*` key or asymmetric JWT signing key exists (deliberately not queried — secret material).
- Stripe Dashboard configuration (enabled payment methods, webhook endpoint event list) — not reachable; the code's behaviour is decided in `remediation_stage_1_2_report.md` §F-02 on the basis of the objects the app creates.
- Generated Supabase TypeScript types: the repository has none (`src/lib/types.ts` is handwritten); the comparison above is against the handwritten types.
