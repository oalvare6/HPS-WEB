# Production release readiness — Stage 2.1 + 2.2 + 2.3

**Written 2026-09-11. Nothing in this document has been executed.** Every finding below came
from reading the repository, running the test suites locally, and **read-only** `select`
queries against production. No migration, no `db push`, no ledger repair, no deploy, no Vercel
or Supabase configuration change was made.

**Verdict: READY ONCE OPERATOR ACTIONS ARE COMPLETED.** The code is validated and the three new
migrations are purely additive, but four operator actions must happen first — §4. The most
important is not the ledger: it is confirming what the **Supabase GitHub integration** will do
the moment `main` changes (§3.4, §6 Q6). Merging before that is answered risks an unattended
migration run against a drifted ledger.

---

## 1. Exact state

| | |
|---|---|
| Release branch | `claude/dazzling-wozniak-es39bo` |
| Branch SHA | `40c39d2684b179d86cd345892d1beb90a9016c14` |
| `main` SHA | `44a475e3929c66f3b2b7511d4ec41ac0e46f1996` (PR #10, 2026-09-10) |
| Merge base | `44a475e…` — **identical to `main`'s tip** |
| Relationship | 14 commits ahead, **0 behind**. A fast-forward; no merge conflict is possible. |
| Repository | `oalvare6/HPS-WEB` |
| Production Supabase | `jqkiswwunrnyqjgroqtn` · PostgreSQL 17.6.1.084 · `ACTIVE_HEALTHY` |
| Isolated dev Supabase | `tfkdtwgxnumnuiiayrld` (`hps-dev`) · PostgreSQL 17.6.1.166 |
| Canonical host | `www.houstonpremiersoccer.com` |

### 1.1 The 14 commits

```
40c39d2  feat(stage-2.3)  review reasons (D)
f3be520  fix(test-harness) PostgreSQL suites on Windows
7940d04  chore(dev)       pin tsx, line endings, APP_SIGNING_SECRET in the template
632ce90  docs             handoff docs to the real Stage 2.3 state
3a013ce  feat(stage-2.3)  the Resend send path (B)
f2cda3b  docs(stage-2.2)  sign off — 44/44 through the running admin
c66e40b  feat(stage-2.3)  offline cash/Zelle receipts (A) + cross-event team guard (C)
acee648  docs(stage-2.2)  finalize the report, propose Stage 2.3
8ccaf1e  fix(stage-2.2)   read the real route envelopes in the verifier
82d5b45  fix(stage-2.2)   verify the API keys against hps-dev
0c15e0d  feat(stage-2.2)  seed hps-dev, validate in SQL, script the local UI run
35fc804  feat(stage-2.2)  guarded migration planner; hps-dev built from the files
5e74c60  feat(stage-2.2)  isolated dev launcher and a guard that refuses Production
f0c52b0  feat(admin)      Stage 2.1 workspace + Stage 2.2 handoff
```

### 1.2 Local verification run on `40c39d2`

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean, no warnings |
| `npm run build` | clean |
| 25 in-process suites | 6,205 assertions passing (24 report a count; `test-admin-workspace` passes but prints none) |
| 5 SQL suites (real PostgreSQL) | 328 assertions passing |
| **Total** | **30 suites, 6,533 counted assertions, all passing** |

Two limits, stated rather than hidden:

- The SQL suites ran on **PostgreSQL 16.13** (the only server available in this environment),
  not 17. CLAUDE.md records that 16 silently tolerates `drop trigger if exists … on <missing
  relation>` where 17 raises `42P01`. `test-migrations-from-empty.ts` carries its own
  notice-reading tripwire for exactly that trap and it armed and passed, but **the Supabase
  Preview branch on the pull request is still the last word** on any other 16/17 disagreement.
  Treat a green Preview as a required gate, not a formality (§5 step 4).
- `scripts/verify-event-state-pages.mjs` (headless Chromium) was **not** re-run. It is unchanged
  by this branch and its 46 assertions were green on the Stage 2.0 branch that is already in
  `main`.

---

## 2. What merges (Q1)

84 files, +14,237 / −1,939. `main` has **none** of Stage 2.1, 2.2 or 2.3.

**This is a bigger release than "Stage 2.3".** Stage 2.1 — the entire admin workspace redesign —
is in this branch and not in `main`. The owner-visible change on merge day is the whole admin,
not three new features.

### 2.1 Production runtime surface

**New API routes (6)**

```
POST/GET  /api/admin/registrations/[id]/manual-payments
POST      /api/admin/registrations/[id]/manual-payments/[receiptId]/void
POST      /api/admin/registrations/[id]/review
POST/GET  /api/admin/tournaments/[id]/messages
POST      /api/admin/tournaments/[id]/messages/preview
POST      /api/admin/tournaments/[id]/messages/[batchId]/retry
```

All six are under `/api/admin`, behind the existing HMAC admin cookie. **No public, player-facing
or money-taking route changes in this release.** `/register`, `/pay`, the Stripe webhook, the
DocuSeal path and the waiver flow are untouched.

**Modified existing routes (2)** — `/api/admin/tournaments/[id]/roster` (carries review facts and
`cancelledReviews`) and `/api/admin/contacts/merge` (appends to a retired row's notes instead of
replacing them).

**New libraries (7)** — `admin-review.ts`, `admin-review-server.ts`, `admin-messages.ts`,
`admin-messages-server.ts`, `manual-payments.ts`, `email/message-sender.ts`,
`components/admin/workspace.ts`.

**New/changed admin UI** — the Stage 2.1 workspace (one page per event, filterable player lists,
persistent URLs, phone-first dialogs), plus `ManualPayments`, `MessagePreview`, `ReviewSection`,
`PlayerDetail`, `PlayersTable`, `EventMessageButton`, and a new `/admin/payments` page.

**`vercel.json` — new file.** It disables Vercel deployments for `astra/stage-2-1-admin` and
`claude/dazzling-wozniak-es39bo` only. **It does not touch `main`**, whose deployment behaviour
is unchanged. Verified by reading the file; it contains nothing else.

**Environment variables: none added.** The only `process.env` read anywhere in the changed
files is `NODE_ENV`. The send path uses `RESEND_API_KEY` and `RESUME_EMAIL_FROM`, which `main`
already references (`src/lib/email/resend-sender.ts`) and `.env.example` already lists. Whether
they are *set* in Vercel Production is an operator check — §4.4.

### 2.2 Not runtime

`scripts/` (14 new: the Stage 2.2 tooling and the Stage 2.3 suites), `docs/` (6 new),
`.gitattributes`, `.env.example`, `package.json` / `package-lock.json` (adds `tsx@4.23.13` as a
devDependency only).

No secret file is tracked: `.env.stage22.local` matches `.gitignore:33` and is not in the index.

---

## 3. Database (Q2, Q3, Q4)

### 3.1 What is required (Q2)

**Exactly three migrations**, and nothing else:

| File | What it creates | Touches existing data? |
|---|---|---|
| `20260911090000_registration_team_same_event.sql` | function `assert_registration_team_same_event()`, trigger `registrations_team_same_event` on `registrations` | **No.** Only a `do $$` block that *reports* pre-existing violators without failing. |
| `20260911091000_manual_payments.sql` | table `manual_payments`, 3 indexes, RLS, 4 functions, grants | **No.** New table only. |
| `20260911120000_message_batches.sql` | tables `message_batches` + `message_recipients`, 3 indexes, RLS, 2 functions, grants | **No.** New tables only. |

**None of the three alters an existing table.** Verified by extracting every DDL statement: there
is no `alter table` against any pre-existing relation, no column added, dropped or retyped, and
no `insert`/`update`/`delete` against existing rows.

**No PGRST201 risk.** CLAUDE.md's two-FK trap needs *two* relationships between the same pair of
tables. Each new child table has at most **one** FK per parent:

```
manual_payments     → registrations ×1, contacts ×1, tournaments ×1
message_batches     → tournaments   ×1, teams    ×1
message_recipients  → message_batches ×1, registrations ×1, contacts ×1
```

Stage 2.3 C was deliberately built as a **trigger, not a composite foreign key**, precisely to
avoid adding a second `registrations`→`teams` relationship. That decision is what makes this
release safe to apply in the migrations-first order; a composite FK would have made it unsafe in
*both* orders.

### 3.2 Live production check (read-only, 2026-09-11)

Would the new trigger reject anything already in production?

| Query | Result |
|---|---|
| registrations with a team but no event | **0** |
| registrations whose team belongs to a different event | **0** |
| registrations with a team (the population at risk) | 50 |
| registrations total | 145 |
| flagged `needs_admin_review` | 24 |
| flagged with empty `notes` | 1 |

**The trigger will reject nothing that exists.** Production data already satisfies the invariant,
because the admin route has been enforcing it in application code all along.

Object presence, confirmed live:

| Object | Production |
|---|---|
| `manual_payments`, `message_batches`, `message_recipients` | **ABSENT** (all three) |
| `record_manual_payment`, `void_manual_payment`, `apply_manual_payment_status`, `manual_payments_total_cents`, `record_message_batch`, `mark_message_sent`, `assert_registration_team_same_event` | **ABSENT** (all seven) |
| trigger `registrations_team_same_event` | **ABSENT** |
| `finalize_checkout_payment`, `save_match_result`, `append_note_line`, `record_resume_link_request` | present |
| `payments`, `tournaments`, `registrations`, `contacts`, `teams`, `matches`, `match_scorers`, `tournament_rounds`, `waiver_signatures`, `registration_sessions`, `stripe_checkout_attempts`, `stripe_webhook_events`, `site_settings`, `tournament_updates` | present |

### 3.3 Which migrations are live, which absent (Q3)

- **41 of 44 files** have their objects in production. The two dated 2026-09-10 (the settlement
  lock-order fix and `stripe_checkout_attempts`) are live — verified 2026-09-10 against the
  deployed function and the catalog.
- **3 of 44 are absent** — exactly the Stage 2.3 three, confirmed object-by-object above.

**Objects present ≠ ledger rows.** That distinction is the whole of §3.4.

### 3.4 What is wrong with the ledger (Q4)

Read live from `supabase_migrations.schema_migrations` on 2026-09-11. It holds **22 rows against
44 files**, in two classes:

**(a) 13 rows that match a file exactly** — `20260319215600`, `20260319224900`, and the eleven
from `20260513120000` to `20260513121000`.

**(b) 9 rows carrying an MCP-assigned version that matches no file.** These were applied through
the management API, which stamps its own timestamp instead of the filename's:

| Ledger row | The file it really is |
|---|---|
| `20260619201109` | `20260619140000_create_matches_and_scorers` |
| `20260812170137` | `20260812190000_add_tournaments_is_draft` |
| `20260813000824` | `20260812210000_create_waiver_signatures` |
| `20260814174433` | `20260814230000_add_tournaments_kind` |
| `20260814184245` | `20260814234500_add_registrations_cancelled_at` |
| `20260814185600` | `20260815001500_dedupe_registrations_and_guard` |
| `20260814211133` | `20260815030000_add_open_play_free_entry_config` |
| `20260814211247` | `20260815031000_open_play_attendance_and_free_entry` |
| `20260909004333` | `20260908120000_round_counts_and_scorer_identity` |

**The consequence, stated precisely.** `supabase db push` applies every local file whose *version*
is absent from the ledger. It cannot know that row (b) `20260814185600` "is really" file
`20260815001500`. So an unrepaired push would run:

> **44 files − 13 matched = 31 files**, of which **28 are already applied** and 3 are genuinely new.

The Stage 1.6 report established structural idempotency for the 19 it examined (§5.2 step 5); the
other nine have not been re-audited under this framing, so treat "idempotent" as proven for 19 and
merely likely for the rest. **One is definitely not:**
`20260815001500_dedupe_registrations_and_guard.sql` **cancels duplicate live registrations.**
Re-running it against today's 145 rows is a data-modifying operation nobody has rehearsed.

> **Correction to `STAGE-1-6-MIGRATION-RECONCILIATION.md` §8 and to `CLAUDE.md`.** Both say a push
> would "re-run the nineteen unlisted files". Nineteen is the count of files never recorded under
> *any* version. It undercounts the blast radius: the nine class-(b) files are also absent under
> their own versions, so `db push` re-runs them too. **The real figure is 28 already-applied
> files, and the data-bearing one is among the nine** — which is exactly why §8 singles it out.
> The repair commands in §8 are unaffected and remain correct; only the headline number changes.

### 3.5 What the repair must do (Q5)

§8 of the Stage 1.6 report is still the authority, and its two commands are arithmetically
complete: **9 reverted + 28 applied, on top of the 13 already matching = 41 rows for the 41
pre-Stage-2.3 files.** Verified by enumerating both lists against `supabase/migrations/`.

**The three Stage 2.3 versions — `20260911090000`, `20260911091000`, `20260911120000` — must NOT
be marked applied.** They are the only files that should actually execute. Marking them would
leave production permanently without the tables while the ledger claimed otherwise.

`migration repair` edits only `supabase_migrations.schema_migrations`. It runs no SQL from any
file and changes no application data.

---

## 4. Preflight checks

Run **all** of these before touching anything. Each is read-only.

### 4.1 The GitHub integration — do this first

Supabase reports a branch entry `main` → git branch `main`, `is_default: true`, status
**`MIGRATIONS_FAILED` since 2026-05-13**, alongside an obsolete PR-linked preview branch from
June. **The integration exists and is pointed at `main`.**

Open **Supabase → Project Settings → Integrations → GitHub** and answer one question:

> **Is "Deploy to production" (apply migrations on push to `main`) ON or OFF?**

- **OFF** → merging is inert for the database; you apply migrations deliberately. Proceed.
- **ON** → **merging `main` triggers an automatic migration run against production with the
  ledger still drifted.** Do not merge. Either repair the ledger first (§5 step 2) or turn the
  toggle off for this release.

`MIGRATIONS_FAILED` has stood since 2026-05-13 and PRs #7–#10 merged in that window without
damaging production — suggestive that the toggle is off or that the run fails early, but
**"it has not hurt us yet" is not evidence.** Read the toggle.

### 4.2 Ledger snapshot

```bash
supabase link --project-ref jqkiswwunrnyqjgroqtn
supabase migration list --linked          # expect 22 remote rows, 44 local files
```

Expect exactly the 13 + 9 split in §3.4. **If it shows anything else, stop** — this document's
arithmetic no longer describes your database.

### 4.3 Re-run the trigger safety query

§3.2 was true on 2026-09-11. Re-run it immediately before applying, because rosters change:

```sql
select
  count(*) filter (where r.team_id is not null and r.tournament_id is null)  as team_but_no_event,
  count(*) filter (where r.team_id is not null and t.id is not null
                     and t.tournament_id is distinct from r.tournament_id)   as cross_event_team
from public.registrations r
left join public.teams t on t.id = r.team_id;
```

Both must be `0`. If not, the migration's own `do $$` block will report the rows; fix the data
before the trigger goes live, or a later edit to those rows will fail.

### 4.4 Vercel

- Confirm which commit is currently serving `www.houstonpremiersoccer.com`, and that it is
  `main`'s tip. This document asserts `main` contains Stage 2.0; it does **not** assert the
  deployed build does.
- Confirm production env vars. Nothing new is required. If the owner wants the Send button to
  actually deliver, `RESEND_API_KEY` and `RESUME_EMAIL_FROM` must be set **and** the From domain
  verified in Resend. Without them the feature is honest but inert: every recipient is recorded
  `failed` with `email_provider_not_configured` and nothing is sent.
- Confirm `vercel.json` will not affect `main` (it names only the two working branches).

### 4.5 Local gate

On `40c39d2`, from a clean install: `npx tsc --noEmit`, `npm run lint`, `npm run build`, and the
30 suites. All were green on 2026-09-11 (§1.2).

---

## 5. Ordered production steps (Q7)

**The order is forced, not preferred.** `/api/admin/tournaments/[id]/roster` — the main admin
screen — calls `reviewFactsFor()`, which queries `manual_payments` and **throws** on error
(`admin-review-server.ts:58`). Production has 24 flagged registrations, so that path executes.
Ship the code before the migration and **the roster 500s for every event with a flagged player.**
Migrations must land first.

Conversely, migrations-first is safe: all three are additive, the trigger rejects nothing that
exists (§3.2), and the deployed `main` code never touches the new tables.

> **Step 0 — Preflight.** Everything in §4. ⛔ **Operator checkpoint.**

> **Step 1 — Back up.** Take a fresh Supabase backup / PITR checkpoint and **write down its
> timestamp**. Every rollback path in §7 depends on it. ⛔ **Operator checkpoint.**

> **Step 2 — Repair the ledger.** `STAGE-1-6-MIGRATION-RECONCILIATION.md` §8, verbatim: the
> `--status reverted` command for the nine, then `--status applied` for the twenty-eight. Then
> prove it:
> ```bash
> supabase migration list --linked      # every row Local == Remote; 41 rows
> supabase db push --linked --dry-run   # must list EXACTLY the three 20260911* files
> ```
> ⛔ **Operator checkpoint — do not continue unless the dry run names exactly those three.**
> Anything else means the repair is wrong, and the next command would rewrite live data.

> **Step 3 — Apply the three migrations.** `supabase db push --linked`. Confirm the three tables,
> seven functions and one trigger from §3.2 are now `present`, and read the migration's own
> violator report. **Nothing has changed for users yet** — no deployed code reads these tables.

> **Step 4 — Open the pull request and let Preview run.** `claude/dazzling-wozniak-es39bo` →
> `main`. This is where PostgreSQL **17** gets its say on the three files (§1.2). ⛔ **Operator
> checkpoint — a red Preview stops the release.** Note: after step 3 the Preview branch builds
> from a schema production now shares, so a FRESH-ONLY diff against
> `docs/production-schema-catalog-2026-09-10.json` is expected until the catalog is re-captured
> (`scripts/sql/schema-catalog.sql`).

> **Step 5 — Merge.** Fast-forward; no conflict possible. ⛔ **Operator checkpoint**, and the
> point of no return for the Vercel deploy.

> **Step 6 — Deploy.** Let Vercel build `main`, or promote deliberately. Watch the build log.

> **Step 7 — Smoke test.** §8, in order. ⛔ **Operator checkpoint** at "player-facing surfaces".

> **Step 8 — Close out.** Re-capture the schema catalog, update the from-empty allow-list so the
> Stage 2.3 objects stop reading FRESH-ONLY, and record the ledger repair in
> `STAGE-1-6-MIGRATION-RECONCILIATION.md` §8 as done.

> **Step 9 — Adopt one apply path.** Either the GitHub integration / `db push`, or the MCP
> `apply_migration` tool — **not both**. Using both is what produced the nine mismatched rows.
> Write the choice down in `CLAUDE.md`.

### 5.1 Deliberately out of scope

Not part of this release, and each needs its own authorisation: the F-00 credential rotation, the
F-05 admin brute-force protection, the one unreconciled historical payment, the DocuSeal
replay-protection gap, and the `registrations_registration_type_check` narrowing.

---

## 6. The ten questions, answered

**Q1 — What code will merge?** §2. 84 files; the whole of Stage 2.1, 2.2 and 2.3. Six new admin
routes, two modified admin routes, seven new libraries, the admin workspace, `vercel.json`. No
public or money-taking route changes. No new environment variables.

**Q2 — What database changes are required?** §3.1. Three migrations, all additive: three tables,
seven functions, one trigger, six indexes, RLS and grants. No existing table altered, no existing
row written.

**Q3 — Which migrations are live vs absent?** §3.3. 41 of 44 live; the three Stage 2.3 files
absent, confirmed object-by-object against production.

**Q4 — What is wrong with the ledger?** §3.4. 22 rows for 44 files: 13 exact matches and 9 rows
under MCP-assigned versions that match no file. An unrepaired `db push` would re-run **28**
already-applied files — not 19, as the older docs say — one of which cancels duplicate live
registrations.

**Q5 — What repair must happen first?** §3.5. Revert the 9, mark the 28 applied, leave the three
Stage 2.3 versions alone. Prove it with `migration list` + `db push --dry-run` naming exactly
those three.

**Q6 — Can the Supabase GitHub integration auto-apply migrations when `main` changes?**
**Yes — the mechanism is configured and pointed at `main`,** with status `MIGRATIONS_FAILED`
since 2026-05-13. Whether it *will* apply depends on one dashboard toggle this session cannot
read. **This is the single most dangerous unknown in the release** (§4.1): if it is on, merging
alone triggers an unattended migration run against the drifted ledger, and step 2's ordering
protection is bypassed. Read the toggle before merging.

**Q7 — What is the safest order?** §5: preflight → backup → ledger repair → migrations → PR and
Preview → merge → deploy → smoke → close out → one apply path. Migrations before code is
**forced** by the roster's hard dependency on `manual_payments`.

**Q8 — What happens if a step fails?** §7.

**Q9 — Which steps are reversible?** §7.1.

**Q10 — Which checkpoints need approval?** The seven ⛔ marks in §5. The two that matter most:
the §4.1 integration toggle before merging, and the `db push --dry-run` in step 2 — the last
moment at which a bad ledger repair is still harmless.

---

## 7. Failure, rollback and recovery (Q8, Q9)

### 7.1 Reversibility

| Step | Reversible? | How |
|---|---|---|
| 1 Backup | n/a | — |
| 2 Ledger repair | **Yes** | Ledger rows only; `migration repair` can set them back. Touches no application data. |
| 3 Apply migrations | **Yes, structurally** — see below | Each file carries a rollback comment. |
| 4 PR / Preview | **Yes** | Close the PR; the preview branch is disposable. |
| 5 Merge | **Yes, by revert** — never by force-push | `git revert` the merge commit. |
| 6 Deploy | **Yes** | Vercel instant rollback to the previous deployment. |
| 7 Smoke | n/a | Read-only. |
| **A re-run of `20260815001500`** | **NO** | Cancels live registrations. Recoverable only from the step-1 backup. |
| **A message actually sent** | **NO** | Mail cannot be recalled. |

Two irreversible things, and both are guarded. The dedupe re-run is prevented by step 2 and its
dry-run checkpoint. The send is prevented by the compulsory dry run in the composer, by
idempotency in `record_message_batch`, and — until §4.4 is done — by `RESEND_*` being unset.

**Dropping the new tables is structurally reversible but destroys data.** Once the owner records
a cash receipt or sends a message, `manual_payments` and `message_batches` hold the only record
of it; the rollback comments in the migrations say so in those words. After step 7, roll back the
*code*, not the schema — the schema is additive and harmless to leave in place.

### 7.2 If a step fails

**Step 2 (repair).** `migration repair` is idempotent per version; re-run the failing half. If
`migration list` is still not row-for-row after two attempts, **stop and do not push.** A wrong
ledger is safe while nothing pushes; it is catastrophic the moment something does.

**Step 2 dry run names more than three files.** The repair is incomplete or wrong. **Stop.**
Re-derive the difference between the 44 filenames and the ledger by hand. Never "push anyway to
see what happens".

**Step 3 (apply) fails partway.** Supabase applies each file in a transaction, so a failed file
leaves no half-object; earlier files stay applied and ledger-recorded. Read the error, fix the
file, re-push. All three are `if not exists` / `create or replace`, so re-running a partially
applied set is safe. **Do not deploy code while any of the three is unapplied** — the roster
depends on `manual_payments`.

**Step 3 reports pre-existing trigger violators.** The `do $$` block reports without failing, so
the migration still succeeds. Fix those rows before anyone edits them, or the edit will fail with
`23514`.

**Step 4 (Preview) is red on PostgreSQL 17.** The most likely cause is the `IF EXISTS … ON
<relation>` trap that PG16 hides. Read the failing file number, fix it, re-run. **Do not merge.**

**Step 6 (deploy) fails.** Vercel keeps the previous deployment serving. Instant-rollback if the
new one partially promoted. The database is already migrated and additive, so the old code runs
against it unharmed — this is precisely why migrations go first.

**Step 7 (smoke) finds a defect.** Roll back the deployment first, then decide about the code.
Leave the schema alone.

**The roster 500s after deploy.** Almost certainly a missing Stage 2.3 table — verify §3.2's
object list before debugging anything else.

---

## 8. Post-deploy smoke checklist

Run in order, on `www.houstonpremiersoccer.com`. **The player-facing block is first on purpose:**
it is the money path, and this release should not have touched it.

**Player-facing — must be unchanged** ⛔ *checkpoint*

- [ ] `/` loads; the registration indicator matches the events.
- [ ] `/events` and an individual `/events/[slug]` show the same state, badge and CTA.
- [ ] `/register` opens and accepts a sign-up for an open event.
- [ ] A closed event refuses sign-up, and no page advertises a door the backend refuses.
- [ ] `/pay` without a resume token still redirects to `/register`.
- [ ] An apex or `.vercel.app` alias still 308s to `www`.
- [ ] Google sign-in completes on the real domain.

**Admin, existing behaviour**

- [ ] Admin login; the event list and one event page load.
- [ ] The roster loads **for an event with a flagged registration** — this is the
      `manual_payments` dependency. All 24 flags are on real rows; find one.
- [ ] Waiver state reads the same as before for a known player.
- [ ] Schedule, results and the public hub agree on a played match.
- [ ] Teams: assigning a player to a team in the same event still works.

**Stage 2.3 A — offline payments**

- [ ] Record a $1 cash receipt against a test registration; confirm amount, method, date, note
      and who recorded it all persist.
- [ ] The status moves as expected; below the fee reads `partial`, not `paid`.
- [ ] Void it; confirm the status walks back down and the void is recorded, not erased.
- [ ] Confirm a Stripe-settled registration is **not** overwritten — the collision is flagged.

**Stage 2.3 C — cross-event teams**

- [ ] Assigning a player to a team from a *different* event is refused with a readable message.

**Stage 2.3 D — review reasons**

- [ ] A flagged registration shows a reason and a "what to do".
- [ ] The one flagged row with empty notes shows a truthful live answer, not an invented reason.
- [ ] Resolve refuses with 409 while something is genuinely unsafe.
- [ ] Resolve-anyway requires a written note, and that note lands in the ledger.

**Stage 2.3 B — messages** *(only if §4.4 configured Resend)*

- [ ] The dry run lists the exact recipients and the exact text.
- [ ] "Everyone unpaid" matches what the roster shows as unpaid.
- [ ] A player with no email is reported as skipped **with a reason**, not silently dropped.
- [ ] Send to **one** address you control. Confirm it arrives.
- [ ] Re-post the same idempotency key; confirm no second batch and nobody re-mailed.
- [ ] Retry touches only failures.
- [ ] If Resend is *not* configured: confirm the honest failure —
      `email_provider_not_configured`, nothing sent, nothing pretended.

**Afterwards**

- [ ] Supabase logs and advisors: no new errors.
- [ ] Vercel runtime logs: no new 500s.
- [ ] `stripe_webhook_events` still receives (it was empty as of 2026-09-10 — unchanged by this
      release, but worth a look while you are here).

---

## 9. Standing hazards this release does not close

Carried from `PROJECT-STATUS.md`; none is a blocker for *this* release, and none is fixed by it.

- **F-00 — exposed credentials never rotated.** A service-role key, the JWT secret and the
  Postgres password were reachable behind a public preview URL for ~2 months. Still not rotated.
- **F-05 — no brute-force protection on admin login.** This release adds six new admin routes
  behind that same single static credential. It does not make F-05 worse in kind, but it does
  put more behind it.
- **DocuSeal webhook replay protection** exists in the database and in `supabase/migrations/`,
  but nothing in `src/` calls it.
- **The 90-day `payToken`** still travels in URLs and is accepted by eight surfaces.
- **One historical payment** remains unreconciled.
- **Waiver type-blindness** in `waiverStatusFor` versus the stricter gates.
- **No bounce webhook.** `sent` means the provider accepted it, not that it arrived.
