# Claude — read this first

This repo uses **Claude** (not Cursor) for the **next** pass on player pay/register UX.

**Primary handoff (read fully before changing code):**  
[`docs/HANDOFF-PLAYER-PAY-FLOW.md`](docs/HANDOFF-PLAYER-PAY-FLOW.md)

That file is **context only** — operator problems, what was shipped, architecture, suspected bugs, and file map. It does **not** prescribe a solution; reason from the codebase and operator intent.

**Conventions:** [`.cursor/rules/hps-phases.mdc`](.cursor/rules/hps-phases.mdc)  
**Shipped status:** [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md)  
**Pay gate regression checklist:** [`docs/PAY-GATE-ACCEPTANCE.md`](docs/PAY-GATE-ACCEPTANCE.md)  
**Archived build plan:** [`docs/archive/tournament-email-pay-gate-plan.md`](docs/archive/tournament-email-pay-gate-plan.md)

**Stack:** Next.js 15 App Router, React 19, Supabase, Stripe, DocuSeal. Player auth = Supabase; admin = HMAC cookie (do not refactor unless asked).

**Local dev:** `npm run dev` → http://localhost:3000 (needs `.env.local`).
