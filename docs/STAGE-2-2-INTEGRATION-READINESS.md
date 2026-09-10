# Stage 2.2 — Development database readiness

Status: **environment inspection complete; database-backed validation has not started.** No application, database, environment-file, Supabase configuration or deployment changes were made for this inspection.

## Findings verified in this workspace

- `.env.local` points to `jqkiswwunrnyqjgroqtn.supabase.co`, the production project identified by the repository's schema catalog and migration report. Its site URL is the production website. It must not be used for integration tests.
- That local file does not contain the Supabase anonymous key, service-role key or admin password needed for this standalone development setup. Existing integration credentials in the file were not printed or used.
- The repository has **41 migration files**, but no `supabase/config.toml`, local Supabase project link or seed configuration.
- No Docker-compatible runtime, PostgreSQL tools or running local PostgreSQL/Supabase service was found in the inspected standard locations, PATH or relevant listening ports.
- A cached Supabase CLI exists, but a read-only project-list request reports no usable management login. No Supabase connector is available in this session.
- The user prefers the previously documented preview branch, `ddjfsqqaywmmtvaqnfqn`, if available. Its health hostname currently fails DNS resolution (`ENOTFOUND`) from this machine. This does **not** prove deletion; its current management status could not be checked. The historical Stage 1.6 report records a successful 41-migration build on that branch.
- The older failed June preview branch must not be reused; the migration report explains its obsolete migration history.

No production endpoint was queried. The only remote probes attempted were an unauthenticated health request to the documented development hostname and the CLI management listing, which stopped for lack of login.

## Safest minimal next step

First verify in the Supabase dashboard whether the preferred preview branch still exists. If it is available, confirm its identity, migration ledger and ownership before using its own development credentials. Do not reset it or assume that historical test data can be deleted.

If it is unavailable, create a **standalone `hps-dev` Supabase project**, using PostgreSQL 17 if available, with no GitHub/Vercel deployment integration and no production data import. Apply the existing repository migrations to that explicitly selected empty development database. This avoids changing the production project's branching or deployment configuration and avoids installing a local container stack just to begin this pass.

Supabase preview branches are ephemeral and can be deleted when their PR closes. Persistent branches are intended for longer-lived development environments, but a new branch also inherits project configuration and deployed Edge Functions; it should not be assumed to contain only isolated database tables. [Supabase branching documentation](https://supabase.com/docs/guides/deployment/branching).

A full local Supabase stack remains a viable alternative if preferred. It needs a Docker-compatible runtime and project initialization, neither of which is currently configured here. Plain PostgreSQL alone does not exercise the application's PostgREST, Auth and Storage integration. [Supabase local development documentation](https://supabase.com/docs/guides/local-development/cli-workflows).

No project was created, restored, linked or configured. This recommendation precedes those changes, as requested.

## Connection and isolation plan

1. Store only the confirmed development project's connection values in a separate ignored local file, such as `.env.stage22.local`: API URL, anonymous key, service-role key, local admin credentials and a dedicated app-signing secret. Keep secrets out of chat and documentation.
2. Use an isolated local app copy with explicit development environment values and a localhost site URL. Next.js does not automatically load the suggested custom file; the launcher must load it deliberately. Do not inherit the production-facing `.env.local`, production Stripe/DocuSeal credentials or production signing secrets.
3. Reject the known production project ref before any app launch, migration or seed operation. Verify the selected development project's identity and schema through read-only queries first.
4. Use Supabase's actual PostgREST and Storage services. Seed synthetic `stage22` test identities and retain a manifest of created IDs; do not copy customer records. Prefer existing application routes for workflow writes.
5. Exercise the existing in-app waiver signing path with DocuSeal credentials absent; verify the `waiver_signatures` record, rendered `/waiver/<id>` document and computed coverage. Native signing does not upload a Storage object. Test imported/missing/expired evidence separately. A DocuSeal provider round trip would require a separately isolated test account and is not implied by an in-app signing test.
6. Validate database-backed payment **statuses** through the existing admin endpoint. Actual Stripe checkout/refund settlement is a separate sandbox test and must never use the credentials currently in `.env.local`. Do not add a second payment writer.
7. Do not run the existing reset-based PostgreSQL test harness against a shared or persistent development database: those suites clear/rebuild schemas. They require an independently disposable database.

## Database-backed acceptance matrix — pending

| Area | Cases and evidence required |
|---|---|
| Registration | Register and explicitly confirm synthetic players through the existing flow. Verify one live registration per person/event, duplicate handling, cancellation history and cross-event identity links. |
| Populated / empty | One populated tournament, a separate event with overlapping player names, an empty tournament and an open-play event. Empty lists must be distinguishable from failed loads. |
| Waiver | New in-app signature; valid, expired and missing coverage; coverage without a document; guest coverage. Compare contact, registration and signature records with API-computed waiver evidence. |
| Financial status | Twelve players: 5 paid, 2 waived/free, 3 pending, 1 partial, 1 refunded. Expect 7 financially accounted for and 5 outstanding under the current roster contract. No half-paid threshold. Verify updates survive reload and do not fabricate card receipts. |
| Teams | Assigned/unassigned players, captain assignment, moving a player and rejection of another event's team. Compare team progress with exact underlying registration IDs. |
| URL / dashboard | Search by name, email and phone; team plus status combinations; attention links; same names in two events; reload and back navigation; removed/missing selected records. Compare rendered IDs to database query results. |
| Schedule | Multiple rounds, past missing results, canceled rounds, postponed matches, undated fixtures and dates inherited from a round. Verify event-state labels still come from the existing resolver. |
| Result / scorers | Save both scores and registered scorer contact IDs through the existing `save_match_result` RPC. Verify committed match and scorer rows, team records, standings and public statistics. Test editing, clearing, own goals and non-table rounds; preserve the World Cup published-table exception. |
| Failure / loading | Delay and reject selected HTTP requests while using the real database for successful paths. Test unauthorized reads/writes, failed status updates, failed result saves and retry. Drafts must survive; failures must not display fabricated zero totals or success. |
| Missing data | Missing emergency contact, missing email/phone, absent team, review flag without a reason and absent payment method. No invented evidence or method. |

These are planned checks, not completed results. Stage 2.1's fixture browser passes do not prove database integration.

## Prototype-only and Stage 2.3 candidates

Message composition, recipient selection and reminders remain non-sending previews. Cash/Zelle receipt capture remains non-persistent. Existing public announcement posting and registration-status edits retain their existing backend behavior.

Proposed Stage 2.3 work, after Stage 2.2 is validated:

- General Resend delivery/reminder backend, with recipient controls, idempotent sends, delivery outcomes and retry visibility.
- Cash/Zelle receipt persistence and audit history, with method, amount, timestamp and operator identity; retain the existing payment authority.
- Actionable review reasons and resolution/audit records, if real-data testing confirms the current flag-only payload is insufficient.
- Any narrowly scoped contract or integrity fixes demonstrated by Stage 2.2; no speculative schema rewrite.

Production migration-ledger repair remains a separately authorized operation. It is not part of Stage 2.2 or an automatic prerequisite to developing against an isolated database.

## Inspection outcome

The standalone development setup is now documented in [the Stage 2.2 setup checklist](STAGE-2-2-SETUP-CHECKLIST.md). The user has requested documentation only and requires approval before any project or database changes. The checklist is a future execution plan, not a record of completed setup.

Nothing was connected or seeded. No database-backed workflow was claimed as tested, and no real-data application bug was claimed as reproduced. The confirmed blockers are the production-facing local environment, missing usable development credentials and the inaccessible documented preview hostname.

The Stage 2.1 UI and code were preserved. Production data/configuration were untouched. No push, merge, PR, deployment, database reset, migration application or remote configuration change occurred.
