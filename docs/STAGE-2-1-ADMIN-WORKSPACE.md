# Stage 2.1 — Owner/admin workspace

**Stage 2.1 is the owner-approved frontend design direction.** The owner has authorized committing and pushing this work to `astra/stage-2-1-admin` for Claude Code handoff; no PR, merge or deployment is authorized. Backend contracts, authentication, Supabase schema, Stripe/payment processing, waiver authority, event-state rules and Production configuration are unchanged. See [the current Claude handoff](CLAUDE-STAGE-2-HANDOFF.md) before continuing.

Screenshots: [Overview](stage-2-1/overview.png), [Players](stage-2-1/players.png), [mobile result entry](stage-2-1/result-mobile.png).

## Review with sample data

From the repository, run:

```powershell
node scripts/preview-admin-workspace.mjs
```

Open `http://127.0.0.1:3021/admin`. The local sample login is **fixture / fixture**. An optional port can be supplied, for example `node scripts/preview-admin-workspace.mjs 3022`.

The preview copies source into a temporary directory, links the installed dependencies and runs a localhost-only fixture database. It does not copy `.env` files or inherit integration credentials. It has its own build output and does not interfere with a normal development server. Restart the command to include source changes. Ctrl+C stops it.

This preview rejects database writes. Forms and dialogs can be inspected; successful mutations are verified using browser response mocks. Sample records include 12 registered players (5 paid, 2 waived/free, 5 unpaid), missing waivers, missing details, a review flag, unassigned players, two teams, played games, an upcoming game and a past fixture awaiting a result.

## What changed

- **Overview:** current/upcoming events, unpaid and waiver shortcuts, next games, missing results and a searchable cross-event attention list. Historical events remain accessible. Failed requests show an error and retry rather than misleading zero counts.
- **Event workspace:** Players, Teams, Schedule & results, Announcements and Event settings. Removed the duplicate registration/payment totals above the roster. Public visibility and homepage indicators use the existing event resolver.
- **Players:** search by name/contact/team; team and status filters; URLs preserve the view on refresh and when following dashboard links. One detail dialog contains waiver coverage, actual recorded payment status, declared method, linked card records, emergency details, team assignment and a People lookup. Roster removal requires confirmation and uses the existing cancellation endpoint.
- **Teams:** registered, waiver-complete, financially-accounted-for and unpaid counts. Counts link to the relevant player list. Team-wide message previews are available; existing team/captain editing is secondary.
- **Schedule/results:** round selection, direct result links, both score controls together on mobile, registered scorer selection and pinned save actions. The existing single result request updates the schedule and shared standings/scorer views. The World Cup published-table exception is preserved. Canceled rounds and postponed matches are excluded from the overview's game queue.
- **Forms/navigation:** compact admin-only visual system; event search and date-state filters; persistent form actions; visible People form labels; labeled event inputs; dialog focus containment and restoration. Fast typing updates client URL state without a navigation round trip.
- **Card records:** existing ledger, export and sync controls now live at `/admin/payments`, linked from Overview.

## Business rules and prototypes

**No half-paid threshold exists in this UI.** Payment progress is informational; it does not affect eligibility, event status or warnings. Paid and waived/free registrations are financially accounted for. The sample roster therefore shows **7 accounted for and 5 unpaid**. Partial and refunded remain distinct recorded statuses and appear in the outstanding list as dictated by the roster API.

Message previews appear in the overview, player lists/details, teams, schedule and announcements. They allow template selection, recipient selection and text editing but have no Send action. Public announcement posting remains the existing operational feature; it does not email players.

The Cash/Zelle receipt form is explicitly a prototype and saves nothing. The separate existing registration-status update remains available. It does not create a receipt, charge a card, issue a refund or record payment method/amount/date.

Review flags are shown honestly: the roster endpoint supplies a flag but no explanation. The UI does not invent a reason. General reminder delivery, receipt tracking, richer audit history and backend data-model work remain deferred.

## Verification

- TypeScript and ESLint pass; optimized Next.js build passes in an isolated temporary copy.
- All 20 existing non-PostgreSQL regression suites pass, covering payments, signup/resume, waivers, event states, roster totals, scheduling and standings.
- `npx tsx scripts/test-admin-workspace.ts` checks accounted/unpaid partitions, independent waiver state, guest filters, scoped links and canceled rounds and postponed matches.
- Existing public browser agreement suite: **46/46 passed**, with no hydration/runtime errors.
- Admin browser verification covers login, desktop/mobile layouts, rapid search, reload persistence, team shortcuts, waived/free details, message previews, failed-save recovery, result saving and public-header restoration. Separate mocked mutation checks cover successful waived status changes, canceled/confirmed roster removal, registered scorer contact IDs, failed result drafts and retries.
- PostgreSQL integration suites were not run: the settlement harness reports no local PostgreSQL server. No development Supabase or production service was used.

The repeatable browser check is `scripts/verify-admin-workspace.cjs`. It targets only a localhost fixture preview. It requires Chrome at the path configured in the script and optional `playwright-core` tooling, which is not added to application dependencies. For example, in PowerShell:

```powershell
npm install --prefix "$env:TEMP/hps-browser-tools" --no-save --package-lock=false playwright-core
$env:HPS_PLAYWRIGHT_MODULE = "$env:TEMP/hps-browser-tools/node_modules/playwright-core"
node scripts/verify-admin-workspace.cjs
```

It writes screenshots and the verification result to a temporary directory printed on completion. Database mutation calls are intercepted by the browser test.
