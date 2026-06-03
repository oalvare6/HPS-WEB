# Open Play — Session Handoff (Phases 17–19)

> Paste into a new Cursor session. **One phase per turn.** World Cup (WC-0–WC-7) and Phases 0–15 are shipped — do not redo unless fixing a regression.

**Rules file:** `.cursor/rules/hps-phases.mdc`  
**Status board:** `docs/PROJECT-STATUS.md`

---

## Prerequisite — Phase 16

Phase 16 adds `tournaments.event_type` (`tournament` | `open_play`) and admin form radio. If not on `main`, run **Phase 16** from `hps-phases.mdc` before Phase 17.

Quick check: `/admin/tournaments/new` has Event type radio; Supabase has `event_type` column.

---

## North star (Phases 17–19)

1. Open-play event appears on homepage + `/events` with **Open Play** pill while `end_date >= today`.
2. After `end_date` passes, it **vanishes** from homepage and `/events` (query-side; no cron).
3. `/events/<slug>` stays live forever.
4. Visitor registers with **simplified form** (liability checkbox, no DocuSeal) → Stripe Checkout in ≤2 clicks.
5. After the event, detail page shows **public roster** (first name + last initial, paid only).

---

## Phase 17 — Public surface (start here if Phase 16 verified)

**Touch:** `src/lib/tournaments.ts`, `TournamentCard.tsx`, `FeaturedTournamentCard.tsx`, `src/app/events/[slug]/page.tsx`

**Do not touch:** register API, `PayForm`, admin auth.

**Manual test:** Create open-play event 4 days out → featured + pill → set `end_date` yesterday in DB → hidden from lists, detail page still loads.

---

## Phase 18 — Register + pay

**Touch:** `src/app/register/page.tsx`, `src/components/register/RegistrationForm.tsx`, `src/app/api/register/route.ts`; audit `checkout` + `stripe.ts`.

**Manual test:** Submit open-play register → no DocuSeal → Stripe → paid registration with `waiver_type='open_play'`. Tournament register still uses DocuSeal.

---

## Phase 19 — Public roster + acceptance

**Touch:** new `src/components/events/PublicRoster.tsx`, `getPublicRoster()` in `tournaments.ts`, event detail page.

**Manual test:** Full North Star in `hps-phases.mdc` Phase 19 + Phase 15 auth regression (8-step checklist in `docs/AUTH-RUNBOOK.md`).

---

## Do not break (built on top of prior work)

- **World Cup:** slug-gated logic in `src/lib/world-cup-pricing.ts` and `PayForm` — unrelated to open play.
- **Player auth:** `createSupabaseRouteHandlerClient` on `/auth/callback` — do not revert to cookie-less redirects.
- **Admin `drop_ins` table:** different from open-play events; leave admin drop-in tool alone.
- **Tournament team workflow:** still applies when `event_type='tournament'`.

---

## End-of-phase report

Use the template at the bottom of `hps-phases.mdc` after each phase.
