# Stage 1.6 — Database schema and migration reconciliation

**Date:** 2026-09-10. **Branch:** `claude/stage-1-6-migration-reconciliation-gpqu6k`, cut from
`main` @ `a62ac1c`. **Read after** [`STAGE-1-4-1-PRICING-AND-STRIPE-CLOSEOUT.md`](STAGE-1-4-1-PRICING-AND-STRIPE-CLOSEOUT.md);
supersedes the loose-file rows of [`core_schema_diff.md`](core_schema_diff.md) and closes
`backend_audit_v1.md` F-06 for everything except the ledger repair, which is a production
change and is written down here rather than done.

**Production was read-only throughout.** Every production interaction was a `SELECT`, a
catalog listing, or a management call that changes nothing (§10 lists them all). No migration
was applied to production, no migration-history row was inserted, updated or deleted, no data
row was touched, the $80 record was not reconciled, and nothing was deployed or merged.

---

## 1. Result

| | |
|---|---|
| Why every clean database and Preview branch fails | **Found and reproduced.** The third migration references `public.tournaments`, which no migration creates (§2) |
| An empty database now builds from `supabase/migrations/` alone | **Yes.** 41 files, applied by the real Supabase CLI (`db push --db-url`) and by the new test, twice over (§5) |
| The fresh build matches production | **Yes, object for object,** except seven differences that are listed, explained and pinned by a test (§3.4, §5.3) |
| Migration files created | 5 baselines for the loose-file objects, 2 ported byte-identical from unmerged branches (§4) |
| Loose SQL under `supabase/` | Retired to `docs/archive/loose-sql/` with a README saying where each one went |
| Supabase Preview branch | **PASS on PostgreSQL 17.6.** The platform migrated an empty database through all 41 files; ledger 41/41, last applied `20260910130000` (§6). It failed on the first attempt and found a real defect — see §12 |
| Production migration ledger | **Not repaired, deliberately — still 22 rows for 41 files.** `supabase db push` and `supabase migration repair` must NOT be run against production yet. Exact commands and their order in §8 |
| Tests | `tsc` clean · `lint` clean · `build` clean · **645/645** assertions, 18 suites (§9) |

---

## 2. Why clean and Preview databases fail

### 2.1 The first broken dependency

`supabase/migrations/` is applied in file-name order. The third file,
`20260513120000_create_tournament_rounds.sql`, declares

```sql
tournament_id uuid not null references public.tournaments(id) on delete cascade,
```

and **no migration creates `public.tournaments`.** The table was only ever defined by the loose
script `supabase/tournaments.sql`, run by hand in the SQL editor on 2026-05-13, so production
had it and never noticed. An empty database does not, and stops there.

Reproduced with the real tool, not by reading: Supabase CLI 2.117.0, `db push --db-url`
against an empty PostgreSQL 16.13 that had been given only the roles and default privileges an
empty Supabase project already has (`scripts/sql/local-supabase-preamble.sql`), using the 34
files on `main` @ `a62ac1c` untouched:

```
Applying migration 20260319215600_create_registrations.sql...
Applying migration 20260319224900_add_docuseal_columns_to_registrations.sql...
Applying migration 20260513120000_create_tournament_rounds.sql...
{"_tag":"Error","error":{"code":"LegacyDbPushApplyError","message":"ERROR: relation \"public.tournaments\" does not exist (SQLSTATE 42P01)
At statement: 1
create table if not exists public.tournament_rounds ( ... references public.tournaments(id) ..."}}
```

Ledger afterwards: 2 rows. Tables afterwards: `registrations`. That is the whole story of the
`MIGRATIONS_FAILED` status on the June Preview branch, and it would have been the story of any
branch created since.

### 2.2 Everything downstream of it

Fixing `tournaments` alone would have moved the failure, not removed it. Walking every file for
objects that no earlier migration creates:

| File | Needs | Defined only by |
|---|---|---|
| `20260513120000_create_tournament_rounds` | `tournaments` | `supabase/tournaments.sql` |
| `20260513120300_create_teams`, `…120400_create_drop_ins`, `…120500_alter_tournaments_pricing`, `…120600_alter_registrations_links`, `…120900_backfill_tournament_links`, `20260619140000_create_matches_and_scorers`, `20260812190000`, `20260814230000`, `20260815030000`, `20260815031000`, `20260910130000` | `tournaments` | same |
| `20260513120700_alter_payments_links`, `…120800_backfill_contacts`, `…120900`, `20260815001500_dedupe_registrations_and_guard`, `20260909120100_stripe_payment_finalization`, `20260910120000` | `payments` | `supabase/payments.sql` |
| `20260513121000_rls_policies` | `tournament_updates`, `site_settings` | `supabase/tournaments-featured-and-updates.sql`, `supabase/site-settings.sql` |
| `20260603120000_pay_email_lookup_indexes` | `site_settings` (inserts the WhatsApp URL) | `supabase/site-settings.sql` |
| the admin banner upload route | the `tournament-images` bucket and its read policy | `supabase/tournament-images-bucket.sql` |

Not a dependency but part of the same pattern: `supabase/storage-bucket.sql` (the private
`waiver-signatures` bucket), `supabase/league-round-overrides.sql` (a table production dropped
long ago; `20260513121100` handles that with `drop … if exists`), and
`supabase/migrate-registration-type-adult-youth.sql` (never run anywhere; §3.4).

### 2.3 Why it stayed hidden

Every one of those files was applied to production by hand, and every later migration was
applied by hand or by the MCP tool, which stamps its own version number. Nothing ever ran the
chain from nothing. The two Supabase branch entries that exist tell the same story from the
platform's side: the `main` entry has read `MIGRATIONS_FAILED` since 2026-05-13, and the one
preview branch (`cursor/league-schedule-standings-scorers-9f16`, for the still-open PR #2)
failed on 2026-06-19 and has been `INACTIVE` since.

---

## 3. Production versus the repository

Captured read-only on 2026-09-10 from project `jqkiswwunrnyqjgroqtn` (PostgreSQL 17.6.1):
every table, column, constraint, index, policy, trigger, function, grant, extension and
bucket, as one JSON document produced by `scripts/sql/schema-catalog.sql` and stored as
`docs/production-schema-catalog-2026-09-10.json` (19 tables, 228 columns, 84 constraints,
79 indexes, 7 policies, 10 triggers, 18 functions, 45 table grants, 30 column grants).

### 3.1 Objects defined only by loose files (fixed)

`tournaments` (30 columns), `payments` (14), `site_settings` (3), `tournament_updates` (6),
`tournaments.is_featured` and its partial index, the trigger functions
`set_updated_at_tournament_updates()` and `set_updated_at_site_settings()`, the buckets
`waiver-signatures` (private, 2 objects) and `tournament-images` (public, 3 objects), and the
Storage policy "Public read tournament images". All now created by the baselines in §4.

### 3.2 Objects production has that `main` never had (ported)

| Object | Where it came from | Evidence |
|---|---|---|
| `matches.advanced_team_id` (uuid, FK → teams, comment) | migration `20260731090000_add_match_advanced_team.sql` on the unmerged branch `claude/world-cup-scores-ui-rfgjpj`; applied by hand on 2026-07-31 for the World Cup semi-final that finished 6-6 | that branch's FOLLOWUPS entry; **1 production match row** carries a value |
| `docuseal_webhook_events` table, `claim_docuseal_webhook_event()` function, two indexes, RLS, grants | migration `20260909130000_docuseal_webhook_events.sql` on the unmerged branch `claude/houston-premier-stage-1-3-lewiry` (Stage 1.3); applied by hand on or after 2026-09-09 | production's function body carries CRLF line endings, the fingerprint of a paste; **0 rows**; the Stage 1.3 *code* is not on `main` and is not deployed |

Note for whoever picks up Stage 1.3: `remediation_stage_1_3_report.md` does not exist on
`main`. It, the DocuSeal webhook code and its test live only on that branch. The migration was
already in production, so this stage carries it; the branch will merge without a conflict on
that file because the copy here is byte-identical.

### 3.3 Objects nothing in the repository ever defined (documented, not reproduced)

- **`backup_2026_08_17`**, a schema holding hand-made copies of thirteen tables from the B1
  data cleanup, RLS off. It is data, not schema; the catalog and the test look only at
  `public` and `storage`.
- **`set_updated_at_match_scorers()`**, an orphan trigger function: both match triggers call
  `set_updated_at_matches()`. It came with the June draft of the matches migration (§3.4).

### 3.4 Drift that stays, and why

| Object | Production | Repository | Decision |
|---|---|---|---|
| `registrations_registration_type_check` | `('team','adult','youth','freeagent')` | `('adult','youth')` since the baseline migration; the loose narrowing script was never run | **Keep the repository's.** 0 production rows use the legacy values; the app writes only `adult`/`youth`. Narrowing production is a one-statement change for a later, deliberate step: `alter table public.registrations drop constraint registrations_registration_type_check, add constraint registrations_registration_type_check check (registration_type in ('adult','youth'));` |
| `matches_round_idx`, `match_scorers_team_idx` | partial (`WHERE … IS NOT NULL`) | plain | Production's `matches`/`match_scorers` were created by hand in June 2026 from the draft migration on the `cursor/…` branch; the migration that followed used `create … if not exists` and kept the draft's shapes. Same rows served either way. **Left alone.** |
| `match_scorers_match_idx` | `(match_id)` | `(match_id, sort_order)` | as above |
| `matches_home_team_idx`, `matches_away_team_idx` | present | absent | as above; nothing filters matches by one team |
| `matches` column order | `kickoff_time` before `match_date` | the reverse | PostgREST returns JSON; order is invisible to the app. Deliberately not part of the comparison. |
| `contacts.email` citext extension | installed in `public` | `create extension if not exists citext` installs in the first schema on the path, `public` | identical outcome |
| `pgcrypto` | in `extensions`, pre-installed by the platform | `create extension if not exists pgcrypto` is a no-op | identical outcome; the local preamble pre-installs it the same way |

Everything else — every column type, default, NOT NULL, CHECK, foreign key with its `ON
DELETE`, unique index, policy, trigger, function body (compared as a whitespace-normalised
digest), table grant and column grant — is identical between production and a database built
from the migrations alone. `scripts/test-migrations-from-empty.ts` asserts exactly that, with
the seven differences above as its allow-list.

### 3.5 The migration ledger (not repaired)

Production's `supabase_migrations.schema_migrations` has 22 rows against 41 files:

| Class | Count | Versions |
|---|---|---|
| Ledger row matches a file | 13 | `20260319215600`, `20260319224900`, `20260513120000` … `20260513121000` |
| Ledger row carries an MCP-assigned version; the file has another | 9 | `20260619201109`→`20260619140000`, `20260812170137`→`20260812190000`, `20260813000824`→`20260812210000`, `20260814174433`→`20260814230000`, `20260814184245`→`20260814234500`, `20260814185600`→`20260815001500`, `20260814211133`→`20260815030000`, `20260814211247`→`20260815031000`, `20260909004333`→`20260908120000` |
| File not in the ledger, objects present in production | 19 | the 8 from `core_schema_diff.md` §3, the 4 Stage 1.2–1.4.1 files applied by hand on 2026-09-09/10 (`20260909120000`, `20260909120100`, `20260910120000`, `20260910130000`), the 2 ported files, and the 5 new baselines |

Checked against the ledger's stored SQL (statement counts, digests and the first line of each
row, read-only): the 13 matching rows are split into the same number of statements as the
files and open with the files' own header comments; the 9 MCP rows each hold the migration as
one statement, some with and some without the leading comment block. The DDL is the same
either way, which is why the objects match.

---

## 4. Strategy

**Backfill the history; do not squash it.** `backend_audit_v1.md` F-06 suggested capturing
production's DDL as a single baseline and retiring everything before it. That would work for a
fresh database but would force a rewrite of production's ledger (delete 22 rows, insert one)
and lose the record of how the schema got here. The repository already had the better
precedent: `20260319215600_create_registrations.sql` is itself a backfill — "This migration
backfills the migrations history for the registrations table, which was originally created
via the loose script … The DDL is idempotent so re-running this against the existing prod
database is a no-op." Stage 1.6 does the same for the four tables and two buckets that were
still loose, one file each, timestamped to sort just before the first migration that needs
them, so that:

- an empty database builds in order without any file after them changing;
- production sees no-ops (`if not exists`, `create or replace`, `on conflict do nothing`),
  proved by applying the whole chain twice locally and by the fact that every constraint and
  index name PostgreSQL generates comes out exactly as production has it;
- the ledger repair in §8 is a list of `migration repair` calls, not a rewrite.

**Port, do not reinvent, what production got from other branches.** The two production-only
objects have real migration files on real branches. Copying them byte-identical keeps a fresh
database equal to production and keeps those branches mergeable; writing new files for the
same objects would have created duplicates that fail on the second apply.

**Reproduce the schema, not the accidents.** The draft-era index shapes and the orphan
function are hand-made production artefacts with no effect on any query result. Encoding them
in a migration would have meant writing DDL whose only purpose is to match a mistake. They are
allow-listed with reasons instead, so the difference is visible and stays deliberate.

**Timestamps are evidence-based estimates, and say so.** `payments` sorts at
`20260327000000`: after `registrations` (2026-03-19, which its foreign key needs) and before
the first production payment row (2026-03-27 21:28 UTC). The four 2026-05-13 baselines sort at
`00:01`–`00:04` UTC: the `tournament-images` bucket was created at 00:14 UTC that day in the
same working session, and the migrations that build on these tables carry 12:00 stamps. Each
file's header says which constraint it satisfies and why the day was chosen.

**Deliberately not done**, because each is a production change or a redesign:

- narrowing `registrations_registration_type_check` (§3.4) — one statement, later;
- repairing the ledger (§8) — production write;
- dropping `set_updated_at_match_scorers()` or reshaping the draft indexes — cosmetic;
- carrying the loose script's "Spring Classic 2026" seed row into the tournaments baseline —
  a migration defines structure; a Preview branch does not need that event;
- a `supabase/config.toml` — branching reads it for service configuration, but the June
  branch reached the Migrate step without one, and a generated default would point Auth's
  site URL at localhost. Add one deliberately when branching is available (§6);
- adding the Supabase CLI to `package.json` — it lives in a scratch directory for this
  session's evidence only; the repository's test drives `psql`, like the settlement tests.

---

## 5. Proof

### 5.1 The real CLI, against an empty database (reconciled set)

Same server, same preamble, the 41 files on this branch:

```
Applying migration 20260319215600_create_registrations.sql...
Applying migration 20260319224900_add_docuseal_columns_to_registrations.sql...
Applying migration 20260327000000_create_payments.sql...
Applying migration 20260513000100_create_tournaments.sql...
Applying migration 20260513000200_add_tournaments_featured_and_updates.sql...
Applying migration 20260513000300_create_site_settings.sql...
Applying migration 20260513000400_create_storage_buckets.sql...
Applying migration 20260513120000_create_tournament_rounds.sql...
… (33 more, every one "Applying …")
Applying migration 20260910130000_stripe_checkout_attempts.sql...
{"upToDate":false,"dryRun":false,"migrations":[ …41 files… ],"message":"Finished supabase db push."}
```

`supabase migration list --db-url` afterwards: 41 rows, `local` equal to `remote` for every
version. 19 tables in `public`; both buckets (`tournament-images` public, `waiver-signatures`
private) and the "Public read tournament images" policy created against the stub Storage
schema.

### 5.2 The permanent test

`scripts/test-migrations-from-empty.ts` — **44 assertions**, run on PostgreSQL 16.13:

1. the database is empty, the preamble applies, still empty;
2. every file is named `<14 digits>_<snake_name>.sql` and no version repeats;
3. all 41 apply in order, each in its own transaction; on failure the test prints
   `FIRST BROKEN DEPENDENCY: <file>` and the error, and stops exactly where a Preview branch
   would stop;
4. every table `supabaseAdmin.from()` names (16) and every RPC (7) exists; RLS is on for every
   table; both `registrations`→`tournaments` foreign keys exist under the names the PGRST201
   rule requires; `registrations_one_live_spot_idx`, `payments_stripe_session_id_key` and
   `payments_stripe_payment_intent_unique_idx` are the unique shapes the invariants rely on;
   the six public read policies are exactly the six;
5. the whole chain applies a **second time** and the catalog is byte-identical afterwards;
6. the catalog of the fresh build is diffed against the production capture: 7 differences,
   all on the allow-list, none stale.

### 5.3 The diff, verbatim

```
# fresh build vs production catalog (2026-09-10, read-only, …): 7 differences
  known   changed         constraints: registrations.registrations_registration_type_check
  known   production_only indexes: matches.matches_away_team_idx
  known   production_only indexes: matches.matches_home_team_idx
  known   changed         indexes: match_scorers.match_scorers_match_idx
  known   changed         indexes: match_scorers.match_scorers_team_idx
  known   changed         indexes: matches.matches_round_idx
  known   production_only functions: set_updated_at_match_scorers()
PASS  every difference from production is on the allow-list with a reason
PASS  every allow-listed difference still exists (none has gone stale)
PASS  the catalogs are the same size within the allow-list (production 524, fresh 521)
```

### 5.4 What this does not prove

- **PostgreSQL 16.13 is not 17.6.1.** ~~Nothing in the chain is version-specific~~ — **this
  bullet was wrong, and §12 is the proof.** Something in the chain *was* version-specific:
  `drop trigger if exists … on <a relation that never existed>` is a skipped statement on 16
  and a hard `42P01` on 17. The Preview branch caught it, this suite had not. Now closed both
  ways: the migration no longer names an absent relation, and the suite fails on that class on
  either major and proves its own tripwire is armed first (§12.5). The Preview branch has since
  run these files on the platform's own image and passed (§6).
- **The Storage schema here is a stub.** The bucket migration's guard, inserts and policy ran,
  but against four columns of `storage.buckets`, not Supabase's real table. On a Supabase
  project the same statements are the ones the loose scripts ran by hand in March and May.
- **Local has no data.** The second-pass idempotency is structural. Four migrations write
  data (`20260513120800`, `20260513120900`, `20260603120000`, `20260815001500`); §8 says which
  of them must never be re-run against production and in what order the ledger must be
  repaired so that none of them is.

---

## 6. Preview environment result — **PASS**

**Exercised, on the platform's own PostgreSQL 17.6, and it passes.** The organisation was
upgraded the same day this stage was written, PR #9 was opened, and the GitHub integration
created preview branch `ddjfsqqaywmmtvaqnfqn` from an **empty** database (`with_data: false`)
and applied `supabase/migrations/` to it.

**It failed on the first attempt** — `42P01` at file 19 of 41 — which is the whole point of
having the environment. That defect and its fix are §12. After commit `00c7830` the integration
re-ran and the branch reached `FUNCTIONS_DEPLOYED`. Read back from the preview database itself:

| | Before `00c7830` | After `00c7830` |
|---|---|---|
| Branch status | `MIGRATIONS_FAILED` | `FUNCTIONS_DEPLOYED` |
| `supabase_migrations.schema_migrations` | **18 rows**, last `20260513121000` | **41 rows**, last `20260910130000` |
| Tables in `public` | 10 | **19** |
| `to_regclass('public.league_round_overrides')` | — | `null` (correctly never created) |
| `finalize_checkout_payment`, `save_match_result`, `consume_registration_access_token` | — | all 3 present |

So the claim this stage set out to make — **`supabase/migrations/` builds the whole schema from
an empty database** — is now proved on Supabase's own image and not only on a local PostgreSQL.

Two operational notes for whoever drives this next:

- The Supabase bot says *"only new migration files are pushed. Close and reopen this PR if you
  want to apply changes from existing seed or migration files."* The fix in `00c7830` **edited**
  an existing migration, and it was re-applied only because the branch's ledger had stopped
  **at** that file, so it was still unrecorded there. If a future edit to an already-applied
  migration appears to be ignored by a preview branch, close and reopen the pull request.
- The dead June preview branch for PR #2 (`vwgdxrjkhpvuyokydtyf`, `MIGRATIONS_FAILED`,
  `INACTIVE`) is still worth deleting; PR #2 is four months stale. **Do not** reset or reuse it:
  it tracks the `cursor/…` git branch, whose migration set is the broken one.

None of this touches production. A preview branch is a separate, disposable project.

---

## 7. Files changed and created

| File | Change |
|---|---|
| `supabase/migrations/20260327000000_create_payments.sql` | **new** — `payments`, from the loose script, idempotent |
| `supabase/migrations/20260513000100_create_tournaments.sql` | **new** — `tournaments`, indexes, `set_updated_at()`, trigger; no seed row |
| `supabase/migrations/20260513000200_add_tournaments_featured_and_updates.sql` | **new** — `is_featured`, `tournament_updates`, trigger |
| `supabase/migrations/20260513000300_create_site_settings.sql` | **new** — `site_settings`, trigger |
| `supabase/migrations/20260513000400_create_storage_buckets.sql` | **new** — both buckets and the read policy, guarded for plain PostgreSQL and for a role that may not create Storage policies |
| `supabase/migrations/20260731090000_add_match_advanced_team.sql` | **ported byte-identical** from `claude/world-cup-scores-ui-rfgjpj` |
| `supabase/migrations/20260909130000_docuseal_webhook_events.sql` | **ported byte-identical** from `claude/houston-premier-stage-1-3-lewiry` |
| `docs/archive/loose-sql/*.sql` (9 files) + `README.md` | the loose scripts, moved with `git mv`; the README maps each to its migration |
| `docs/production-schema-catalog-2026-09-10.json` | read-only structural capture of production |
| `scripts/sql/schema-catalog.sql` | the catalog query (SELECT-only) |
| `scripts/sql/local-supabase-preamble.sql` | roles, default privileges, `extensions` schema, Storage stub — what an empty Supabase database already has |
| `scripts/test-migrations-from-empty.ts` | the from-empty test, 44 assertions |
| `scripts/_pg.ts` | `provisionEmptyDatabase(name)` split out of `provisionTestDatabase()`; `applyFile()` on the handle; `REPO_ROOT` exported. The settlement suites are unchanged in behaviour |
| `docs/core_schema_diff.md`, `docs/core_schema_snapshot.sql` | supersession notes pointing here and at the catalog |
| `CLAUDE.md`, `FOLLOWUPS.md` | the new test in the verification list; the three rules; the session entry |

No application code changed. No migration that existed before this stage was edited.

---

## 8. Manual ledger actions still required (later, from a trusted machine)

Production's ledger must be brought into line **before** anyone runs `supabase db push`
against production or lets the GitHub integration deploy migrations to it. Until then a push
would re-run the 19 unlisted files. Eighteen are structurally idempotent (§5.2 step 5), but
`20260815001500_dedupe_registrations_and_guard.sql` cancels duplicate live registrations and
must not be handed a second chance under a version the ledger does not recognise.

> **Corrected 2026-09-11 — "19" understates the blast radius.** Nineteen is the count of files
> never recorded under *any* version. But `db push` matches on the version string alone, and the
> nine class-(b) rows in §3.5 carry MCP-assigned versions that match **no** filename — so their
> files are also unlisted as far as a push is concerned, and it re-runs them too. Against the
> current 44 files: 44 − 13 exact matches = **31 files pushed, of which 28 are already applied**
> and 3 are the genuinely new Stage 2.3 ones. `20260815001500` is among the nine, which is
> precisely why it is singled out above. **The repair commands below are unaffected and remain
> correct** — they already cover all 28. See
> [`RELEASE-READINESS-STAGE-2.md`](RELEASE-READINESS-STAGE-2.md) §3.4.
>
> Note also that the `--status applied` list below names the 28 pre-Stage-2.3 files only. The
> three Stage 2.3 versions (`20260911090000`, `20260911091000`, `20260911120000`) must **not** be
> added to it: they are the only files that should actually execute.

Nothing below runs SQL from the files; `migration repair` only edits
`supabase_migrations.schema_migrations`. Do it in this order, with the CLI linked to
`jqkiswwunrnyqjgroqtn` (`supabase link --project-ref jqkiswwunrnyqjgroqtn`):

```bash
# 0. Look. Every row below should show Local and Remote disagreeing in the ways §3.5 lists.
supabase migration list --linked

# 1. Retire the nine MCP-assigned versions (rows only; the objects stay).
supabase migration repair --linked --status reverted \
  20260619201109 20260812170137 20260813000824 20260814174433 20260814184245 \
  20260814185600 20260814211133 20260814211247 20260909004333

# 2. Record every file whose objects production already has (the same nine under their
#    file versions, the eight from core_schema_diff §3, the four Stage 1.2–1.4.1 files,
#    the two ported files, and the five baselines).
supabase migration repair --linked --status applied \
  20260327000000 20260513000100 20260513000200 20260513000300 20260513000400 \
  20260513121100 20260513121200 \
  20260521124500 20260521150000 20260521170000 20260521203000 20260603120000 \
  20260619140000 20260731090000 \
  20260812190000 20260812210000 20260814230000 20260814234500 20260815001500 \
  20260815030000 20260815031000 \
  20260908120000 20260908120100 \
  20260909120000 20260909120100 20260909130000 20260910120000 20260910130000

# 3. Prove it: every row Local == Remote, and a dry-run push has nothing to apply.
supabase migration list --linked
supabase db push --linked --dry-run
```

Then:

- **Check the GitHub integration** (Project Settings → Integrations). Its `main` entry has
  read `MIGRATIONS_FAILED` since 2026-05-13. If "Deploy to production" is on, the next push
  to `main` will apply whatever the ledger does not list — after the repair, nothing — and the
  status should clear. If it is off, decide whether to turn it on; from then on every merged
  migration runs on production automatically, which is exactly why the ledger has to be right
  first.
- **Adopt one apply path** and retire the other: either the integration/`db push` (ledger
  stays right by itself) or the MCP `apply_migration` tool (stamps its own version — the
  cause of the nine mismatches). Not both.
- **Optionally narrow `registrations_registration_type_check`** (§3.4) as a normal migration,
  once the operator confirms no import needs the legacy values.

---

## 9. Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | no warnings or errors |
| `npm run build` | clean |

| Suite | |
|---|---|
| test-tournament-state | 16/16 |
| test-signup-state | 18/18 |
| test-roster-totals | 12/12 |
| test-canonical-host | 15/15 |
| test-open-play-free-entry | 29/29 |
| test-standings | 15/15 |
| test-schedule | 14/14 |
| test-resume-access | 41/41 |
| test-resume-routes | 46/46 |
| test-payment-finalize | 36/36 |
| test-stripe-webhook | 20/20 |
| test-reconcile-payments | 35/35 |
| test-resend-sender | 13/13 |
| test-stripe-route | 10/10 |
| test-checkout-pricing | 65/65 |
| test-finalize-sql | 122/122 (executed, PostgreSQL 16.13) |
| test-stripe-integration | 90/90 (executed, PostgreSQL 16.13) |
| **test-migrations-from-empty** | **48/48 — new** (executed, PostgreSQL 16.13) |
| **Total** | **645/645** |

No existing test was changed, skipped or weakened. The settlement suites still build their
fixture the same way; only the provisioning helper they call was split so the new suite could
start from nothing.

**Counts as of `00c7830`.** The new suite was 44/44 when this stage was first written; §12 adds
four assertions — the armed tripwire, the version-order check, and the missing-relation guard on
each of the two passes — taking it to 48/48 and the total from 641 to 645. `node_modules` must be
installed (`npm ci`) before `lint` and `build`, or `next` is not found.

---

## 10. Confirmation that production was not modified

Every interaction with the production project, in order:

| Call | Effect on production |
|---|---|
| `list_projects`, `list_organizations`, `get_project` | none (read) |
| `list_branches` ×2 | none (read) |
| `list_migrations` | none (read) |
| `list_extensions`, `list_tables` (public, verbose) | none (read) |
| `execute_sql` ×14 — `pg_class`/`pg_proc`/`pg_constraint`/`pg_indexes`/`pg_policies`/`pg_trigger`/`pg_attribute`/`information_schema` grants, `storage.buckets`, aggregate `min(created_at)` and `count(*)` values, the ledger's stored statements as digests and first lines, and the full catalog query | none — every statement was a `SELECT`; no row values beyond aggregates and timestamps were read, and no name, email or phone was retrieved |
| `search_docs` ×2 | documentation only |
| `get_cost`, `confirm_cost` | none (a quote) |
| `create_branch` | **refused by the platform** (`PaymentRequiredException`); nothing created. The preview branch that exists today was created later by the GitHub integration on PR #9, not by this call (§6, §12.7) |

Not called: `apply_migration`, `merge_branch`, `rebase_branch`, `reset_branch`,
`delete_branch`, `deploy_edge_function`, `create_project`, `pause_project`, `restore_project`,
any `INSERT`/`UPDATE`/`DELETE`/DDL through `execute_sql`, and `supabase db push`/`migration
repair` against anything but the throwaway local databases on `127.0.0.1:54329`. The $80
record (`803e3697-…`) was not read by id and was not changed. Git: pushed to
`claude/stage-1-6-migration-reconciliation-gpqu6k` only; no pull request, no merge, no
deploy.

---

## 11. Hazards recorded, not changed

- **The GitHub integration can write to production on merge** (§8). Do not merge this branch,
  or any branch carrying migrations, until the ledger is repaired and the integration's
  settings are known.
- **Stage 1.3 is applied in production but not merged or deployed.** Production carries its
  table and function; `main` carries neither its webhook code nor its report. The migration
  is now on `main`'s lineage; the code is not.
- **`advanced_team_id` is real data with no reader.** One World Cup match row says Morocco
  advanced; nothing on `main` displays it (the World Cup standings are still the hard-coded
  override from REBUILD-PLAN §2). Dropping the column would erase the only record of that
  result.
- **`backup_2026_08_17` has RLS off.** Its grants were not examined (this stage looked only
  at `public` and `storage`); PostgREST does not expose the schema, but it is a copy of every
  PII table from 2026-08-17 sitting in the production database. The B1 cleanup it backed up
  is three weeks old; the owner should decide when it goes, and someone should confirm the
  `anon`/`authenticated` roles hold no grants on it before then.
- **`waiver-signatures` bucket holds 2 objects nothing in the code reads.** Kept because it
  exists; not a dependency.

---

## 12. Stage 1.6.1 — what the Preview branch found, and the fix (2026-09-10)

**Status: resolved. Preview is PASS on PostgreSQL 17.6 as of commit `00c7830`** — 41/41
migrations from an empty database (§6 has the before/after read back from the branch itself).

When this stage was first written, branching was refused on the Free plan and the platform's own
image had never run these files. That changed the same day: the organisation was upgraded, PR #9
was opened, and the GitHub integration created preview branch `ddjfsqqaywmmtvaqnfqn` and ran the
chain.

**It failed at file 19 of 41**, and §5.4's first bullet — *"PostgreSQL 16.13 is not 17.6.1"* —
turned out to name the exact reason.

```
ERROR: relation "public.league_round_overrides" does not exist (SQLSTATE 42P01)
At statement: 0
drop trigger if exists league_round_overrides_set_updated_at on public.league_round_overrides
```

### 12.1 Root cause

`supabase/migrations/20260513121100_drop_legacy_overrides.sql` opened with

```sql
drop trigger if exists league_round_overrides_set_updated_at on public.league_round_overrides;
```

**`IF EXISTS` guards the trigger. It does not guard the relation named after `on`.** The table was
only ever created by a loose script — `docs/archive/loose-sql/league-round-overrides.sql` — which
this stage deliberately did *not* turn into a baseline migration, because the table is meant to be
gone. So on every clean database the relation has never existed, and the statement has nothing to
hang off.

Production and every other historical database survived it because the table *was* there once.

### 12.2 Why the from-empty test passed anyway

Not an omitted file, and not the preamble. Verified:

- the suite reads `supabase/migrations/` and applies **all 41 files in the same order Supabase
  does** — the failing file was executed;
- `scripts/sql/local-supabase-preamble.sql` never mentions `league_round_overrides`, and the
  suite already asserted the preamble leaves `public` empty, so it cannot have supplied it.

**The two servers disagree.** Measured on both:

| | `drop trigger if exists t on public.<never existed>` |
|---|---|
| PostgreSQL **17.6** (Supabase — probed on preview branch `ddjfsqqaywmmtvaqnfqn` itself) | `ERROR: 42P01 relation … does not exist` — chain stops |
| PostgreSQL **16.13** (Ubuntu 24.04; what `scripts/_pg.ts` boots) | `NOTICE: relation … does not exist, skipping` — statement skipped, **exit 0** |

The suite asserted psql's exit code and nothing else, so a statement the server **skipped** was
indistinguishable from one it **ran**. 44/44 green on the same commit the platform rejected.

This is not `supautils` or any Supabase hook: the preview branch's `shared_preload_libraries` is
`pg_stat_statements, pgaudit, plpgsql, plpgsql_check, pg_cron, pg_net, pgsodium, auto_explain,
pg_tle, plan_filter, supabase_vault` — no DDL interceptor. It is core PostgreSQL 17 strictness.

### 12.3 The fix

The `drop trigger` line is **deleted**, not guarded. Dropping a table drops its triggers with it,
so the line bought nothing on a database that had the table, and broke every database that did
not. What remains is self-guarding — each statement names its own object:

```sql
drop table if exists public.league_round_overrides;
drop function if exists public.set_updated_at_round_overrides();
```

No table is created merely to be dropped. The file carries a comment saying why the line is absent
and must not come back.

### 12.4 Audit of the rest of the chain

Both mechanically and by reading. The chain was applied from empty on PostgreSQL 16 with **every
NOTICE captured**, because on 16 that notice is the only trace the 42P01 class leaves:

- **`relation "X" does not exist, skipping`** — the parent relation was missing. This is the
  42P01 class. **One occurrence in 41 files: the one above.** None after the fix.
- `trigger "T" for relation "R" does not exist, skipping` (10×) and `policy "P" for relation "R"
  does not exist, skipping` (6×) — the opposite finding: the relation *was* there. Normal for an
  idempotent migration.
- `table "…" / index "…" / function "…" / extension "…" does not exist|already exists, skipping`
  — self-guarded, each names its own object.

Statically: 18 `drop trigger if exists … on`, 8 `drop policy if exists … on`, 12 `drop column if
exists` and 2 `drop constraint if exists` (both inside an unguarded `alter table`, so they fail
loudly rather than silently), 8 `drop index if exists`, 8 `drop table if exists`, 6 `drop function
if exists`. There is no `alter table if exists` anywhere. Every parent relation but
`league_round_overrides` is created by an earlier-sorting migration.

### 12.5 The test that would have caught it

`scripts/test-migrations-from-empty.ts` no longer trusts the exit code alone.

1. **`scripts/_pg.ts` surrenders the notices.** `applyFile` (and a new `applySql`) return every
   `NOTICE`/`WARNING` the server raised alongside `ok`.
2. **The 42P01 class is a failure.** Any `NOTICE: relation "X" does not exist, skipping` during
   the from-empty pass *or* the second (idempotency) pass fails the run, naming file and relation.
   The regex is anchored so it cannot match the benign `… for relation …` shapes.
3. **The tripwire proves itself armed first.** Before the chain runs, the suite fires
   `drop trigger if exists … on public.hps_tripwire_relation_that_never_existed` and requires this
   server to *either* refuse it (17) *or* announce the skip in a notice the detector recognises
   (16). A server that does neither cannot see what a Preview branch sees, and the run says so
   instead of passing.
4. **The set and order are asserted to be Supabase's.** Filename order is checked to be the same
   sequence as version order.
5. **The header names the server**, and warns when the major is not Supabase's 17.

**Proof, all on the same PostgreSQL 16.13 that was green before:**

| Migration | Suite | Result |
|---|---|---|
| original (broken) | original | **44/44 passed** — the blind spot |
| original (broken) | updated | **46/48, exit 1** — `no migration reaches for a relation that does not exist on a clean database … got ["20260513121100_drop_legacy_overrides.sql: public.league_round_overrides"] expected []` |
| fixed | updated | **48/48 passed** |

### 12.6 What is still not proved, and what must still NOT be run

The tripwire closes *this* 16↔17 difference on either version. It is not a claim that every other
one is covered. **The Preview branch on the pull request remains the last word.**

**Nothing in §8 changed, and a green Preview does not change it.** Preview passing means the 41
files build a correct schema *from empty*. Production is not empty and its ledger does not agree
with the files:

> **The production migration ledger is still 22 rows for 41 files.** Thirteen rows match a file,
> nine carry MCP-assigned versions, and nineteen files are unlisted although their objects already
> exist. **Do NOT run `supabase db push` against production. Do NOT run `supabase migration
> repair` against production yet.** A push today would re-run nineteen files, one of them
> data-bearing (`20260815001500_dedupe_registrations_and_guard.sql`). §8 has the exact repair
> commands and the order they must be run in, from a trusted machine, deliberately — not as a
> side effect of merging this branch. §11's hazard about the GitHub integration writing to
> production on merge still stands.

### 12.7 Every call made during Stage 1.6.1

Same standard as §10. **Production (`jqkiswwunrnyqjgroqtn`) was not touched at all** — not read,
not written; the only production-scoped call was `list_branches`, which reads branch metadata.

| Call | Target | Effect |
|---|---|---|
| `list_branches` ×3 | production project (metadata) | none (read) |
| `execute_sql` ×2 — `version()`, `shared_preload_libraries`, ledger and table counts, `to_regclass` | **preview branch** `ddjfsqqaywmmtvaqnfqn` | none (`SELECT` only) |
| `execute_sql` ×2 — `drop trigger/policy if exists … on public.hps_probe_relation_does_not_exist` | **preview branch** `ddjfsqqaywmmtvaqnfqn` | none — a provably absent relation; both raised `42P01` and changed nothing. This is the measurement §12.2 rests on |
| GitHub: read PR #9, its status checks and its comments | — | none (read) |

Not called against anything: `apply_migration`, `merge_branch`, `rebase_branch`, `reset_branch`,
`delete_branch`, `create_branch`, `create_project`, `supabase db push`, `supabase migration
repair`. No pull request was created or merged; the fix was pushed to the existing branch.
Local PostgreSQL 16.13 databases on `127.0.0.1` did all the rest.
