# Handoff: player pay / register flow (for Claude)

**Date:** 2026-06-03  
**Repo:** houstonpremiersoccer.com (`HPS-WEB`)  
**Situation:** Cursor shipped Phases T1–T4 (tournament email pay gate). Operator tested locally and reports **broken UX** and an **email-check loop** that blocks checkout. This document is **information for you to reason from** — not a spec or fix list.

---

## 1. What the operator wants (product intent)

Read this as north star; implementation may need redesign, not patches.

### Single entry, email-first (logged out)

- Event pages should **not** show two competing actions (“Register” + “Pay entry fee”) as the primary path.
- **One primary CTA** (wording TBD — e.g. “Play” / “Join this event” / “Pay & play”).
- Flow when **not signed in:**
  1. User enters **email** (and possibly adult/youth for waiver template — operator dislikes extra steps if avoidable).
  2. If email is **known** and **facility waiver is valid** (365 days) → go **straight to pay** for **this tournament**.
  3. If email unknown or no valid waiver → user must **complete facility registration + waiver** (not “register for tournament” in a confusing sense).

### Facility vs tournament (data model vs UX copy)

- **Business rule (operator):** Registration is really to **Houston Premier Soccer / the facility**, not a separate legal signup per tournament.
- **Waiver:** One signed waiver per person (adult OR youth), **365 days**, valid for **any** tournament.
- **Per tournament:** User still needs a **registration row** for that event to pay roster/fees — but copy should not feel like “sign up again from scratch” if waiver is already on file.
- Second tournament with same email should feel like: **enroll in this event → pay**, not full re-registration theater.

### Signed-in users

- Header/account flows exist (Supabase player auth, Phases 9–15).
- Operator: signed-in UI should **not** emphasize “Register” (implies new account). Prefer language like **“Enroll”** / “Join this event” when adding a tournament to their profile.
- Signed-in users should **skip email entry**; system should use `getCurrentPlayer()` email and eligibility logic.

### Tournament context

- Operator: clicking through from an event should land on a flow that **shows that tournament’s info** (title, dates, fees, etc.) — not a generic pay screen that feels disconnected from the event they chose.
- Pay page today preselects tournament in `PayForm` but the **gate UI** is minimal (title only in gate; full card info may be missing during email steps).

### Checkout must complete

- **Critical bug (operator):** “Email check just loops” — user never reaches Stripe / `PayForm` checkout reliably.
- Reproduce locally: `npm run dev`, `/pay?tournament=world-cup-summer-tournament`, try logged-in and logged-out paths.

---

## 2. What Cursor shipped (T1–T4) — do not re-implement blindly

| Phase | Delivered |
|-------|-----------|
| T1 | `POST /api/pay/eligibility`, `src/lib/pay-eligibility.ts`, rate limit, migration indexes |
| T2 | `PayEmailGate`, `PayPageClient`, `/pay` gate unless `registrationId` + valid `payToken` |
| T3 | `WhatsAppCommunityLink`, `footer.whatsapp_url` everywhere |
| T4 | Register `?type=adult\|youth`, `buildPayResumeUrl`, `tournament-public-links.ts` |

**Migration (applied on operator DB):** `supabase/migrations/20260603120000_pay_email_lookup_indexes.sql`

**Eligibility API contract** (`POST /api/pay/eligibility`):

```json
{ "email": "...", "tournamentId": "<uuid>", "waiverType": "adult" | "youth" }
```

Responses: `unknown_email` | `no_waiver` | `needs_registration` | `needs_waiver` | `ready_to_pay` | `already_paid`

On `ready_to_pay`, API mints `payToken` (HMAC, `src/lib/app-signing.ts`) and may sync contact waiver → registration row.

---

## 3. Current user journeys (as built)

### `/pay?tournament=<slug>`

**Server:** `src/app/pay/page.tsx`

- If `registrationId` + `payToken` present and `verifyPayResumeToken` → **skip gate**, render `PayForm`.
- Else load tournament via `getPayableTournamentBySlug` (requires `payments_open`, not cancelled).
- Render `PayPageClient` → `PayEmailGate` until eligibility returns `ready_to_pay`, then `router.replace` to URL with token.

**Logged out gate steps:** email → adult/youth → POST eligibility → blocker OR redirect.

**Logged in:** auto POST eligibility on mount (`PayEmailGate` `useEffect` + `autoRan` ref).

### Event cards / detail

- `src/lib/tournament-public-links.ts`: default pay ` /pay?tournament=slug`, register `/register?tournament=slug`.
- `TournamentCard`, `FeaturedTournamentCard`, `events/[slug]` still show **two buttons** when both flags open: “Register Now” + “Pay Entry Fee”.

### `/register?tournament=<slug>&type=adult|youth`

- `RegistrationForm` preselects tournament + type from query.
- `POST /api/register`: upsert contact, insert registration, DocuSeal OR waiver-skip → `buildPayResumeUrl` with slug + tokens.

### World Cup (do not break)

- Slug: `world-cup-summer-tournament`
- `PayForm` team pay: full $960 / share / captain-paid ack — slug-gated in `src/lib/world-cup-pricing.ts`

---

## 4. Reported failures (operator verbatim themes)

1. **Email check loops** — cannot complete payment.
2. **Tournament context missing** — flow doesn’t “open” the event with full info.
3. **Two buttons** (pay + register) — should be one unified path.
4. **Wrong mental model in copy** — “register” vs facility enrollment; signed-in should say enroll-like language.
5. **Waiver logic** — should be facility/year/tournament-agnostic in UX even if DB has per-tournament registration rows.

---

## 5. Hypotheses for the loop (unverified — investigate)

Use these as starting points, not conclusions.

### A. Logged-in auto-run + `router.replace` remount

`PayEmailGate.tsx`:

- Logged-in: initial step `"checking"`, `useEffect` sets `autoRan` and calls `runEligibility`.
- On `ready_to_pay`, calls `onReadyToPay` → `PayPageClient.handleReadyToPay` → `router.replace(buildPayResumePath(...))`.
- If parent re-renders **before** server sets `skipGate` true, or client navigates but gate remounts with fresh `autoRan.current = false`, **eligibility may fire repeatedly** → spinner loop.

### B. `skipGate` false after redirect

- Token not in URL, wrong `registrationId`, expired token, or `APP_SIGNING_SECRET` mismatch → still shows gate after replace.
- Check `verifyPayResumeToken` in `src/lib/app-signing.ts` vs token minting in eligibility route.

### C. `ready_to_pay` without stable registration

- Eligibility returns `ready_to_pay` but Stripe checkout or `PayForm` fails next step (separate from gate loop).

### D. React Strict Mode / Suspense double mount

- `autoRan` ref may not survive remounts in dev; could double-call API.

**Repro commands:**

```bash
npm run dev
node --env-file=.env.local scripts/test-pay-eligibility-api.mjs you@example.com adult
```

Watch Network tab for repeated `POST /api/pay/eligibility` and URL bar for flickering `registrationId`/`payToken`.

---

## 6. Key files (read order suggestion)

| Priority | Path | Role |
|----------|------|------|
| 1 | `src/components/pay/PayEmailGate.tsx` | Gate UI + loop suspect |
| 2 | `src/components/pay/PayPageClient.tsx` | Gate vs PayForm switch |
| 3 | `src/app/pay/page.tsx` | Server skipGate, tournament resolve |
| 4 | `src/lib/pay-eligibility.ts` | Status resolver + DB |
| 5 | `src/app/api/pay/eligibility/route.ts` | Public API |
| 6 | `src/components/pay/PayForm.tsx` | Stripe checkout, World Cup |
| 7 | `src/app/api/register/route.ts` | Registration + waiver skip |
| 8 | `src/components/register/RegistrationForm.tsx` | Register UI |
| 9 | `src/lib/contacts.ts` | `isContactWaiverValid` (365d) |
| 10 | `src/lib/tournament-public-links.ts` | Event CTAs |
| 11 | `src/components/shared/TournamentCard.tsx` | Dual buttons |
| 12 | `src/lib/player-auth.ts` | `getCurrentPlayer()` |

**Helpers:** `src/lib/pay-resume-url.ts`, `src/lib/pay-eligibility-types.ts`, `src/lib/pay-eligibility-rate-limit.ts`

**Docs:** `docs/PAY-GATE-ACCEPTANCE.md`, `docs/archive/tournament-email-pay-gate-plan.md`

---

## 7. Data model (relevant tables)

- **`contacts`** — canonical person; `email` (citext); waiver fields (`waiver_type`, `waiver_signed_at`, `waiver_expires_at`, …).
- **`registrations`** — person × tournament; `contact_id`, `tournament_id`, `waiver_signed`, `payment_status` (`pending` | `paid` | …).
- **`tournaments`** — `slug`, `registration_open`, `payments_open`, fees, etc.

Eligibility order (see `resolvePayEligibility`):

1. No contact → `unknown_email`
2. Paid registration → `already_paid`
3. Invalid contact waiver for chosen type → `no_waiver` or `needs_waiver` if reg exists
4. Valid waiver, no reg → `needs_registration`
5. Valid waiver, pending reg → sync waiver if needed → `ready_to_pay` + token

---

## 8. Auth & env

- Player: Supabase SSR, `getCurrentPlayer()` / `getUser()` — never `getSession()` on server.
- Admin: HMAC cookie — out of scope unless operator asks.
- Required env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SIGNING_SECRET` (pay tokens; `ADMIN_SESSION_SECRET` accepted as legacy alias), Stripe, DocuSeal.

See `docs/AUTH.md`, `docs/AUTH-RUNBOOK.md`.

---

## 9. What NOT to do unless operator asks

- Rebuild Phases 9–15 auth from scratch.
- Change World Cup pricing/checkout kinds without regression plan.
- Refactor admin auth.
- Add npm packages without approval.
- Implement old “open-play Phases 16–19” (never existed in repo).

---

## 10. Verification scripts (existing)

```bash
node --env-file=.env.local scripts/verify-pay-email-gate-prereqs.mjs
node --env-file=.env.local scripts/verify-pay-gate-t4.mjs
node --env-file=.env.local scripts/test-pay-eligibility-api.mjs <email> adult
```

---

## 11. Git note

Commit on `main` (2026-06-03) bundles T1–T4 + archive docs + this handoff. Operator will continue work in **Claude** on the same branch.

---

## 12. Open questions for operator (optional to ask)

- Exact label for single CTA?
- Is adult/youth step required at pay time if waiver already on file at contact level?
- Should signed-in users ever see the email gate?
- Should `/events/[slug]` be the only entry (pay gate as section) vs separate `/pay` route?

---

*End of handoff.*
