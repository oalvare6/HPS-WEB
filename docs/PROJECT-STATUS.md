# HPS project status

Last updated: 2026-06-03. Use this file to orient new sessions before reading phase rules.

## Shipped (do not re-implement)

| Track | Phases | Rules / docs |
|-------|--------|----------------|
| Admin + registration overhaul | 0–8 | git history `f95adfb` … `d8c15fc` |
| Player auth + smart pay | 9–15 | `docs/AUTH.md`, `docs/AUTH-RUNBOOK.md`, `scripts/smoke-auth.ts` |
| World Cup 2026 launch | WC-0–WC-7 | `.cursor/rules/world-cup-launch.mdc` (archive), `docs/WORLD-CUP-ACCEPTANCE.md`, `src/lib/world-cup-pricing.ts` |
| Open-play schema + admin | 16 | `.cursor/rules/hps-phases.mdc` — verify below |

### World Cup quick reference

- Slug: `world-cup-summer-tournament`
- Team fee: **$960** flat (`WORLD_CUP_TEAM_FEE_CENTS` in `src/lib/world-cup-pricing.ts`)
- DB sync: `scripts/update-world-cup-tournament.mjs`
- Pre-flight: `scripts/verify-world-cup-launch.mjs`

### Phase 16 verification (run once per environment)

If open-play admin or public behavior is missing, Phase 16 may not be on `main` yet:

```bash
node --env-file=.env.local -e "
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('tournaments').select('event_type').limit(1);
console.log(error ? 'MISSING: ' + error.message : 'event_type column OK', data);
"
```

Also confirm `/admin/tournaments/new` shows **Event type: Tournament / Open Play**.

---

## Active workstream — Open play (Phases 17–19)

**Goal:** Single-day open-play events on the existing `tournaments` table (`event_type='open_play'`).

| Phase | Title | Status |
|-------|--------|--------|
| 17 | Public surface (homepage, `/events`, detail CTAs, auto-hide) | **Next** |
| 18 | Simplified register + pay (no DocuSeal) | Pending |
| 19 | Public roster + North Star acceptance | Pending |

**Session handoff:** `.cursor/plans/open-play-session.md`  
**Rules (read every phase):** `.cursor/rules/hps-phases.mdc`

---

## Explicitly out of scope until open-play ships

- Refactoring admin auth (`app-signing`, `AdminGate`)
- Re-opening World Cup WC phases (unless production regression)
- New npm packages without operator approval

## Follow-ups

Append-only: `FOLLOWUPS.md`
