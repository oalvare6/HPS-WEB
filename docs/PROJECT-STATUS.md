# HPS project status

Last updated: 2026-06-03.

## Shipped on `main`

| Track | Scope | Docs / code |
|-------|--------|-------------|
| Phases 0–8 | Admin, registrants, teams, contacts | git `f95adfb` … `d8c15fc` |
| Phases 9–15 | Player auth, smart pay, diagnostics | `docs/AUTH.md`, `docs/AUTH-RUNBOOK.md` |
| World Cup WC-0–7 | Jun 2026 tournament launch | `docs/WORLD-CUP-ACCEPTANCE.md`, `src/lib/world-cup-pricing.ts` |
| Pay gate T1–T4 | Email/waiver gate on `/pay`, eligibility API, WhatsApp unify | `docs/PAY-GATE-ACCEPTANCE.md` |

### World Cup quick reference

- Slug: `world-cup-summer-tournament`
- Team fee: **$960** (`WORLD_CUP_TEAM_FEE_CENTS`)
- Scripts: `scripts/update-world-cup-tournament.mjs`, `scripts/verify-world-cup-launch.mjs`

### Pay gate quick reference

- Entry: `/pay?tournament=<slug>` (gate); bypass: `registrationId` + valid `payToken`
- API: `POST /api/pay/eligibility`
- WhatsApp: `footer.whatsapp_url` in `/admin/site`
- Verify: `scripts/verify-pay-email-gate-prereqs.mjs`, `scripts/verify-pay-gate-t4.mjs`

## Active work

**Player pay/register UX fix** — operator handoff for Claude: `CLAUDE.md`, `docs/HANDOFF-PLAYER-PAY-FLOW.md` (email gate loop, single CTA, enroll copy, tournament context). Pay gate T1–T4 code is on `main` but needs redesign/debug.

Stack conventions: `.cursor/rules/hps-phases.mdc`

## Not built (removed from active planning)

Former “Phases 16–19” (open-play `event_type`, auto-hide lists, simplified register,
public roster) were **never implemented**. Do not assume that work exists.

## Follow-ups

Append-only: `FOLLOWUPS.md`

## Archive

Completed session plans: `docs/archive/`  
World Cup Cursor rule (reference only): `.cursor/rules/world-cup-launch.mdc`
