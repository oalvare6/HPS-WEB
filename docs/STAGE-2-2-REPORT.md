# Stage 2.2 — isolated `hps-dev`, built and validated at the database layer

**Status: COMPLETE. Signed off 2026-09-11 — `44/44` acceptance checks passed against `hps-dev`
through the running admin's own HTTP routes.**

Two halves, and both now hold. §2–§5 were proved by executing SQL against the real development
project. That was never enough on its own: none of it proves the Stage 2.1 admin renders or
queries correctly, because the remote session that did the work could not reach the project over
HTTP. The operator ran the local path (§8) and every check passed — authentication, the
12-player split, all five waiver branches, empty-versus-failed, one person as two distinguishable
registrations across events, the 2–1 result with its stats cross-check, and the cross-event team
refusal.

That distinction is the whole point of §8, and it earned itself: the bring-up surfaced two real
defects (§7) that the SQL work could not have found, because both lived between the app and the
database rather than inside either.

**Not covered, and not to be read as covered:** a real Stripe charge, refund or webhook
delivery; a DocuSeal callback; Google OAuth, skipped by decision; and browser rendering or
interaction, since the verifier drives HTTP routes rather than a browser.

Date: 2026-09-10. Branch: `claude/dazzling-wozniak-es39bo`. Production was never queried,
migrated, seeded or configured.

## 1. What changed since the plan was written

Two things the handoff documents could not have known.

**A Supabase management connector is available and authenticated.**
[STAGE-2-2-INTEGRATION-READINESS.md](STAGE-2-2-INTEGRATION-READINESS.md) recorded "no usable
management login… No Supabase connector is available in this session". That is no longer
true, and it changed the method: the project was created and all 41 migrations applied
through the connector's management API, with no Supabase CLI and **no database password**, so
no database secret passed through the session at all. The checklist's CLI sequence remains a
valid alternative; it is not what was used.

**The preferred preview branch is gone.** A read-only listing shows exactly one project in
the organisation — Production — and two branches: `main`, and the obsolete June
`cursor/league-schedule-standings-9f16` (ref `vwgdxrjkhpvuyokydtyf`, `MIGRATIONS_FAILED`,
`INACTIVE`) that the migration report says must not be reused. The documented preview ref
`ddjfsqqaywmmtvaqnfqn` does not appear at all. The standalone-project path was therefore the
right one.

## 2. The project

| | |
|---|---|
| Name / ref | **`hps-dev`** / `tfkdtwgxnumnuiiayrld` |
| PostgreSQL | **17.6.1.166** — the version Supabase runs, not the 16 a developer machine has |
| Region / cost | us-east-1 / **$0 per month** |
| Relationship to Production | **none.** A standalone project, not a branch: Production's branch list is identical before and after |
| State before migrating | 0 public tables, 0 functions, 0 Storage buckets, 0 Auth users |

Production ref `jqkiswwunrnyqjgroqtn` was never a target of any statement.

## 3. Migrations

All 41 files applied in filename order. The management API assigns its own version
timestamps and keeps the supplied name, so the ledger was then rewritten to the filenames —
without that repair a later `db push` would have re-run all 41 files, one of them
data-bearing. `scripts/stage22-migrations.ts --verify` reported 41/41 with latest
`20260910130000`.

**41 was the count at Stage 2.2.** Stage 2.3 added three more — the cross-event team guard, the
offline-payments schema and the message log — so the same command now expects **44**, latest
`20260911120000`, and `hps-dev`'s ledger was repaired the same way each time. Production still has
none of the 44.

**The build was compared, not assumed.** `scripts/test-migrations-from-empty.ts` passes 48/48
locally, including its own PG17 tripwire self-check, and `hps-dev` was then measured against
the same `docs/production-schema-catalog-2026-09-10.json` that suite uses:

| | tables | columns | constraints | indexes | policies | triggers | functions | extensions | buckets | table grants | column grants | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| production | 19 | 228 | 84 | 79 | 7 | 10 | 18 | 2 | 2 | 45 | 30 | 524 |
| expected fresh | 19 | 228 | 84 | 77 | 7 | 10 | 17 | 2 | 2 | 45 | 30 | 521 |
| **hps-dev** | **19** | **228** | **84** | **77** | **7** | **10** | **17** | **2** | **2** | **45** | **30** | **521** |

521 is production's 524 minus the three production-only objects the suite already
allow-lists (two `matches` indexes and `set_updated_at_match_scorers`).

**That comparison earned its keep.** Function body digests are an md5 of the
whitespace-collapsed source, and two did not match: applying SQL with `--` comments stripped
changes what PostgreSQL stores. `finalize_checkout_payment` and `record_resume_link_request`
were reapplied verbatim, and all 17 function digests are now byte-identical to production's.
A count-only check would have missed it.

Storage: `tournament-images` public, `waiver-signatures` private, and the
`Public read tournament images` policy genuinely exists — the checklist is right that a
migration NOTICE about a skipped policy is not a passing Storage check.

## 4. Synthetic data

`scripts/sql/stage22-seed.sql`. Everything is fictional: reserved `example.com` addresses and
555-01xx numbers. No production row was read to build it.

**It refuses to run anywhere else.** A connection string the operator is trusted to get right
is no guard at all — it fails exactly when someone is tired and pasting the wrong URI. So the
script asks the *database* to identify itself: `site_settings['stage22.dev_project_ref']` must
name the approved project. Production has no such row, so pointing the file at Production
raises before it writes. Re-running deletes only rows carrying the `stage22` prefix and
rebuilds them; nothing is truncated and nothing outside the prefix is touched.

Seeded: 4 events (populated, empty, name-overlapping, open play), 12 contacts and
registrations, 2 teams, 5 rounds, 6 fixtures, 5 payment-ledger fixtures, 8 waiver signatures.
A closing count confirms **0 rows exist anywhere outside the `stage22-` prefix**.

Two things were deliberately created by direct write because **no application route can
produce them** — the only direct writes taken, and the reason the approval for them was
needed. `/api/admin/payments` is GET-only and nothing in `src/` inserts a payment outside
`finalize_checkout_payment`, so the ledger rows are seeded; and expired / legacy-import /
override waiver evidence has no UI that produces it. The successful match result was **not**
seeded, because the result-entry workflow has to be proved through `save_match_result` rather
than by writing the rows the RPC would have written.

## 5. What was validated, in SQL, against `hps-dev`

**The documented payment split.** 12 live registrations: 5 paid, 2 waived/free, 3 pending,
1 partial, 1 refunded → **7 financially accounted for, 5 outstanding**, matching the
checklist exactly. Waived counts equally with paid (the roster route's `SETTLED` set is
`{paid, waived}`). Partial and refunded remain separately identifiable: the five outstanding
are three pending plus one partial plus one refunded, and must never be described as five
people who never paid. No half-paid threshold exists anywhere in the data.

**Waiver evidence, every branch of `waiverStatusFor`.**

| player | stored evidence | reads as |
|---|---|---|
| 1–8 | in-app signature, `waiver_signatures` row present | covered — signed |
| 9 | expired coverage | **needs waiver** — expiry is honoured |
| 10 | legacy import, no document | **covered** — the missing document is a quiet tag, never "needs waiver" |
| 11 | admin override | covered — override |
| 12 | nothing | needs waiver |

10 covered, 2 missing. This is the operator's 2026-08-17 policy holding against real rows.

**Integrity.**

| check | result |
|---|---|
| second live registration for one person in one event | **rejected, SQLSTATE 23505** — the "you're already signed up" case |
| the same person in a different event | allowed |
| cancelling frees the spot (`cancelled_at`, never `payment_status`) | re-registration accepted |
| a completed match with no score | **rejected, SQLSTATE 23514** |
| `save_match_result` given a match from another event | rejected: "That match is not in this event." |
| `save_match_result` given a scorer on neither team | rejected, and **0 partial rows left behind** |
| a team belonging to another event | **not enforced by the database** — see §6 |

**Score math, through the real RPC.** Team A beat Team B 2–1 on a fresh league fixture:

| team | P | W | D | L | GF | GA | GD | Pts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Rojos | 1 | 1 | 0 | 0 | 2 | 1 | +1 | **3** |
| Azules | 1 | 0 | 0 | 1 | 1 | 2 | −1 | **0** |

Individual totals 2 and 1, aggregated by `contact_id` rather than by typed name. Then:
editing the result **removed the old scorer rows** (the previous scorer dropped to zero);
a second match aggregated the same person to 3 goals by identity; an own goal was recorded
on the **benefiting** team and excluded from top scorers while still counting in the score;
a non-table playoff round stayed **out of the league table** (3 completed matches, 2 counting)
while its goals still appeared in top scorers, which is the documented behaviour; and
clearing a result removed every scorer row and reset status and scores to `scheduled` / null.

**Anonymous access.** Tested by assuming the `anon` role the browser key maps to: it reads
the public tournament and **0 rows** from contacts, registrations, payments,
waiver_signatures and teams. `match_scorers.contact_id` carries no SELECT for `anon` or
`authenticated`, while `scorer_name` and `goals` do — scorer identity is withheld from
browser keys exactly as intended.

## 6. Findings

**A team from another event was not refused by the database. ~~Open.~~ CLOSED by Stage 2.3
item C, 2026-09-11.** No constraint forbade `registrations.team_id` pointing at a team belonging
to a different tournament; the admin API was the sole enforcement point. Nothing was wrong at
the time — the route did check — but the invariant rested on application code alone, so a second
writer or a future route would have reintroduced it silently.

`supabase/migrations/20260911090000_registration_team_same_event.sql` now enforces it in the
database, as a trigger rather than a composite foreign key: the declarative form would add a
second `registrations`→`teams` relationship and make every embed between them answer PGRST201,
and being MATCH SIMPLE it would skip the check entirely whenever `tournament_id` is null. The
trigger also fires on `tournament_id`, so moving a rostered player to another event is caught
too. Both layers now refuse it, which is the right end state: the route gives the owner a
readable message, the trigger means no future writer can bypass it.

**Security advisors report only pre-existing conditions that production shares:** thirteen
RLS-enabled tables with no policy (that *is* the design — nothing but the service-role key may
read them), a mutable `search_path` on the `set_updated_at_*` helpers, and `citext` installed
in `public`. No backend contract was changed to quiet them.

## 7. What the local bring-up found

Both defects were in the Stage 2.2 tooling, not in the application, and both had the same
shape: something that could only be checked against the real thing was instead assumed, and the
assumption failed quietly rather than loudly.

**The API keys were never checked, only the URL was.** Every query failed with `Invalid API
key` while `--check` reported the target verified. Matching project refs prove the URL points at
the right project; they say nothing about whether the keys open it, and a rejected key is
invisible until the first query — so the admin came up looking healthy and then answered
`Invalid API key` to everything.

Two things made it possible. The setup script hardcoded hps-dev's anon key, which goes stale the
moment it is rotated; and the secret key was accepted on **shape alone** — anything starting
`sb_secret_` passed. Those keys encode no project, so a secret key belonging to a *different*
project would have been written to the env file without complaint. Offline validation cannot
catch that, and no amount of care would have made it catch that.

Worth recording precisely because the first suspect was wrong: the failing paths — `site-settings`
and `tournaments` — both import `supabaseAdmin`, so all three errors came from the **server**
key. The hardcoded anon key was a genuine latent defect but was not the cause.

The fix is a live preflight. No key value lives in source; the setup script asks for both and
verifies them against the project before writing anything, and `stage22-dev.ts --check` repeats
it. The public key must authenticate and read **no** private rows; the server key must
authenticate and read them. Row count, not status, separates them — RLS with no policy returns
`200 []`, not an error.

**And the preflight itself nearly shipped broken.** Tested with two fabricated keys it reported
"Both keys authenticate": the sandbox's egress proxy answers `403 Host not in allowlist`, which
is not a 401, so a gateway denial scored as success. That is the exact failure the preflight
exists to prevent. Only a recognisable PostgREST response now counts as an answer; anything else
is reported **unverified**, never as passing.

**The verifier reported seeded data as missing.** With the keys fixed,
`/api/admin/tournaments` returned 200 and the run reported all four events absent. They were
never absent. The route returns `{ tournaments: [...] }`; the verifier assumed a bare array, and
`Array.isArray(body) ? body : []` turned the mismatch into an empty list.

The one-line parse bug is not the interesting part. **A verifier that reports its own inability
to read a response as missing data is worse than no verifier**: it sends someone hunting for a
problem that does not exist, and it would just as readily disguise a real regression as a shape
change. Reading a payload now either succeeds or raises a contract error naming the keys that
actually arrived; it never yields a silent empty array. Every other envelope was then checked
against its route rather than assumed again — only `tournaments` was wrong.

Re-reading that code turned up a third, quieter problem: the cross-event integrity check was
patching a *main*-event registration with a *main*-event team, which is not cross-event at all
and would have passed for the wrong reason. It now pairs an overlap-event registration with a
main-event team.

Both fixes carry tests, and both tripwires were checked the way this repository checks tripwires
— by reintroducing the bug and confirming the suite fails. `test-stage22-verify-contract.ts`
runs the real verifier against a stub speaking the real envelopes; with the original bug back it
reproduces the reported symptom exactly (`FAIL event present: stage22-main-cup`).

## 8. What is NOT proved, and how to finish it

Nothing in §2–§5 exercises the Stage 2.1 admin. The remote session's egress policy denies
`*.supabase.co` (the gateway answers 403 to CONNECT), so the app could not reach `hps-dev`;
only the management connector could. **Every check in §5 could pass while the admin still
failed** — a PGRST201 ambiguous embed, a broken cookie, or a roster route that miscounts
`waived` would all survive SQL and die in the browser. That is the gap the local run closes,
and it is why the SQL results must never be presented as UI coverage.

On a machine with normal network access:

```powershell
npx tsx scripts/stage22-setup-env.ts     # asks for BOTH keys; neither is echoed
npx tsx scripts/stage22-dev.ts --check   # verifies target AND that the keys authenticate
npx tsx scripts/stage22-dev.ts           # isolated app on http://127.0.0.1:3022
npx tsx scripts/stage22-verify-local.ts  # automated acceptance run, second terminal
```

The database is already seeded, so there is nothing to create by hand. The verifier signs in
through `/api/admin/login` and asserts, against the app's own routes, the same facts §5 proved
in SQL — the 12-player split, waived counting equally, partial and refunded staying distinct,
all five waiver branches, empty-versus-failed, one person appearing as two distinguishable
registrations across events, the 2–1 result and its stats cross-check, and the cross-event team
refusal that only the API enforces. It exits non-zero on any failure.

**Result, 2026-09-11: `44/44` passed** — "Stage 2.2 acceptance: 44/44 checks passed against
tfkdtwgxnumnuiiayrld. The Stage 2.1 admin agrees with the real database." Run twice, identical
both times.

The cross-event team refusal, which had never executed against a real route, answered HTTP 400:
an overlap-event registration was refused a main-event team. That closes the last open row of
the acceptance matrix.

Still outside Stage 2.2 in every case, and not to be represented otherwise: a real Stripe
charge, refund or webhook delivery; a DocuSeal callback; Google OAuth, which was skipped by
decision and is **untested**; and any browser rendering, layout or interaction check — the
verifier drives HTTP routes, not a browser.

## 9. Stage 2.3 candidates

**All of these were built on 2026-09-11 and are recorded in
[STAGE-2-3-PROPOSAL.md](STAGE-2-3-PROPOSAL.md).** The invariant question this section raised — how
manual payments sit against "no second writer of `payments`" — was answered by the owner: the rule
governs card money, so offline receipts got their own table and writer. The candidates as they
stood:

Unchanged from the plan, plus what this pass found: a general Resend delivery backend
(a transport already exists at `src/lib/email/resend-sender.ts` but implements only the
one-time resume-link contract, so this extends rather than builds); Cash/Zelle receipt
persistence with method, amount, timestamp and operator identity — note the existing
invariant forbids a second writer of `payments` **for card money**, which does not by itself
settle how manual payments should be recorded, and that decision should be made explicitly
rather than inferred; actionable review reasons, since the roster payload supplies a flag and
no explanation; and the cross-event team constraint from §6.
