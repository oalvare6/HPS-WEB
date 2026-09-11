# Claude Code handoff: approved Stage 2.1, planned Stage 2.2

Working branch: **`astra/stage-2-1-admin`**. The owner authorized committing and pushing the current work for handoff only. Do not merge to `main`/Production, open a PR, deploy, or make database changes as part of this handoff.

## Read first

1. [STAGE-2-2-SETUP-CHECKLIST.md](STAGE-2-2-SETUP-CHECKLIST.md): exact isolated development setup, all 41 migration filenames, local environment values, synthetic seeding plan and acceptance checks.
2. [STAGE-2-2-INTEGRATION-READINESS.md](STAGE-2-2-INTEGRATION-READINESS.md): verified environment findings, limitations and pending validation matrix.
3. [STAGE-2-1-ADMIN-WORKSPACE.md](STAGE-2-1-ADMIN-WORKSPACE.md): approved UX, fixture preview instructions, screenshots, business rules and verification coverage.
4. [ASTRA-HANDOFF.md](ASTRA-HANDOFF.md): existing architecture and backend invariants, with historical Stage 2.0 context.

## What is approved and implemented

**Stage 2.1 is the approved frontend design direction. Preserve it unless real-data testing demonstrates an issue requiring a focused fix.** The admin workspace now includes event-focused navigation and attention links, searchable/filterable player lists with persistent URLs, one player-detail dialog, team progress, schedule/result/scorer workflows, accessible mobile dialogs/forms, and the existing payment ledger at `/admin/payments`.

Paid and waived/free count equally as financially accounted for. Payment progress is information, with no enforced half-paid eligibility threshold or event-state effect. Partial and refunded remain separate recorded statuses.

~~Message/reminder composition and detailed Cash/Zelle receipt capture remain clearly labeled prototypes.~~ **Both shipped 2026-09-11 as Stage 2.3 items B and A** — see [STAGE-2-3-PROPOSAL.md](STAGE-2-3-PROPOSAL.md). Messages are sent through an idempotent, server-resolved audience with per-recipient outcomes; Cash/Zelle receipts persist amount, method, received date, note and who took them, append-only. Public announcement posting and existing registration-status edits retain their existing behavior.

## Stage 2.2 has only been planned/documented

No development Supabase project has been created or connected; no database has been migrated or seeded. No real database-backed Stage 2.2 workflow has been validated. Stage 2.1 fixture checks must not be reported as Stage 2.2 integration coverage.

The documented preview branch's hostname did not resolve during inspection, and no usable management login was available. That does not prove the branch was deleted. The requested continuation is a standalone, isolated **`hps-dev`** Supabase project, following the setup checklist.

**Database approval is still pending.** The latest authorization is to commit/push the handoff, not to create/configure a project or apply migrations. Obtain explicit setup approval before those changes, unless the owner supplies it in the next instruction. Do not run commands from the checklist merely because this branch was pushed.

Once approved, create the separate development project, apply the existing 41 migrations only there, implement an explicit isolated app launcher and guarded synthetic seed runner, then verify:

- Registration → confirmation → native waiver → payment status → team → schedule → result/scorer → standings/statistics, including persisted IDs and reloads.
- Populated, empty, loading, failure, partial-payment, waived/free, refunded and missing-data cases.
- Exact URL filters, dashboard attention targets, scorer identity, edited/cleared results and existing downstream calculations.
- Actual provider coverage separately: seeded payment rows do not prove Stripe checkout/refund/webhook settlement, and native waivers do not prove a DocuSeal callback.

Keep backend contracts, authentication, waiver authority, payment logic, schema design and event-state behavior fixed unless a concrete integration mismatch is reviewed within authorized scope. General Resend communication and detailed Cash/Zelle receipts remain Stage 2.3 candidates.

## Isolation and publication boundaries

- The local `.env.local` inspected on this machine points to Production. It is ignored and not included in this handoff. Never launch integration tests using it, copy it to Development, or pull Production environment values.
- Production Supabase ref **`jqkiswwunrnyqjgroqtn`** is a denied target. Do not query, seed, migrate, repair or reset it for this work. Use only synthetic development identities and a manifest of created IDs.
- The proposed `.env.stage22.local`, Stage 2.2 launcher and database seed runner do not exist yet. The custom env filename is not automatically loaded by Next.js. Follow the checklist's explicit loading and exact development-ref validation.
- Existing reset-based PostgreSQL suites require a separate disposable database; do not aim them at the persistent development project.
- `vercel.json` disables automatic Git deployments **only for `astra/stage-2-1-admin`** to honor the owner's push-without-deploy instruction. Vercel's remote project settings and `main` are unchanged. Keep this guard for further pushes; another branch needs its own no-deploy review. [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).
- Commit source fixtures and their reusable verification scripts; keep generated browser storage-state files, traces, temporary copies, build output and secrets outside Git. The three `docs/stage-2-1/` images are intentional synthetic-data design documentation.

## Verification at handoff

Final checks ran in a temporary source copy with synthetic credentials and a localhost-only fixture service; no `.env` files were copied or integration credentials inherited.

- Optimized Next.js build: passed.
- TypeScript `tsc --noEmit`: passed.
- ESLint over `src` with zero warnings allowed: passed.
- All 21 non-PostgreSQL regression suites, including `test-admin-workspace.ts`: passed. The Stripe route suite initially passed all 10 assertions but its `tsx` CLI process hit a Windows/Node shutdown assertion; rerunning through Node's direct `--import` TypeScript loader passed with exit code 0. No application change was needed.
- Exact 41-file migration manifest, staged-file scope, secret-pattern scan and Git whitespace checks: verified before commit. No migration was executed.
- Existing Stage 2.1 browser evidence (admin fixture workflows and 46/46 public surface checks) remains documented in the workspace report; browser suites were not rerun for this documentation/publication handoff.

Build output included non-blocking cache-size and stale Browserslist-data notices. No dependencies were changed. PostgreSQL, real Supabase and external-provider integration checks remain pending.
