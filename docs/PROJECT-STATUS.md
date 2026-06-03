# HPS project status

Last updated: 2026-06-03.

## Shipped on `main`

| Track | Scope | Docs / code |
|-------|--------|-------------|
| Phases 0–8 | Admin, registrants, teams, contacts | git `f95adfb` … `d8c15fc` |
| Phases 9–15 | Player auth, smart pay, diagnostics | `docs/AUTH.md`, `docs/AUTH-RUNBOOK.md` |
| World Cup WC-0–7 | Jun 2026 tournament launch | `docs/WORLD-CUP-ACCEPTANCE.md`, `src/lib/world-cup-pricing.ts` |

### World Cup quick reference

- Slug: `world-cup-summer-tournament`
- Team fee: **$960** (`WORLD_CUP_TEAM_FEE_CENTS`)
- Scripts: `scripts/update-world-cup-tournament.mjs`, `scripts/verify-world-cup-launch.mjs`

## Active work

**No numbered phase roadmap.** New work is defined per session with the operator.
Use `.cursor/rules/hps-phases.mdc` for stack and conventions only.

## Not built (removed from active planning)

Former “Phases 16–19” (open-play `event_type`, auto-hide lists, simplified register,
public roster) were **never implemented**. Do not assume that work exists.

## Follow-ups

Append-only: `FOLLOWUPS.md`
