# Tournament email pay gate — build plan (ARCHIVED)

> **Shipped 2026-06-03 (T1–T4).** Regression reference only. Acceptance: `docs/PAY-GATE-ACCEPTANCE.md`.

> Original prompt below was for implementation; do not re-run unless fixing a regression.

**Operator decisions (locked 2026-06-03):**

| Topic | Decision |
|-------|----------|
| Scope | **All** tournaments with payments open (not World Cup only) |
| Waiver | **One waiver per person per year** (contact record); valid for **any** tournament; adult vs youth chosen in **step 2** |
| Auth | Must work **logged out**; if logged in → **skip email step**, use account email |
| WhatsApp | **Single** community link (`footer.whatsapp_url`) everywhere; **responsive** sizes (not oversized) |
| Register first | Clear copy + Register button + WhatsApp on blocker screens |
| Pay options | Unchanged (World Cup: full / share / captain-paid; others: existing entry/drop-in) |
| Privacy | **Different messages** per scenario (OK to reveal unknown email vs no waiver) |

**Migration:** `supabase/migrations/20260603120000_pay_email_lookup_indexes.sql`  
**Conventions:** `.cursor/rules/hps-phases.mdc`

---

## North star

Visitor opens `/pay?tournament=<slug>` (standard entry for all events).

1. **Step 1 — Email** (skipped if logged in; email prefilled/hidden).
2. **Step 2 — Waiver type:** Adult or Youth (for DocuSeal template match on *new* registrations only).
3. **Lookup** → one of the outcomes below → either **PayForm** (with `registrationId` + fresh `payToken`) or a **message screen** with Register + WhatsApp.

Returning player: same email → system sees waiver on file + pending registration → straight to pay.

---

## Lookup outcomes (API contract)

`POST /api/pay/eligibility`

Body:

```json
{
  "email": "player@example.com",
  "tournamentId": "<uuid>",
  "waiverType": "adult" | "youth"
}
```

Response `status` (discriminated union):

| status | When | UI |
|--------|------|-----|
| `unknown_email` | No `contacts` row | Register first + WhatsApp; link `/register?tournament=<slug>&type=adult\|youth` |
| `no_waiver` | Contact exists, `isContactWaiverValid` false for chosen type | Same as above — explain waiver required |
| `needs_registration` | Valid waiver on contact, **no** registration row for this tournament | Register for this event (waiver already on file — register should skip DocuSeal per Phase 7) |
| `needs_waiver` | Registration exists, `waiver_signed` false, contact waiver also invalid | Link to complete waiver / register flow |
| `ready_to_pay` | Registration pending + waiver signed (or synced from contact) | Mint `payToken`, show PayForm locked to that registration |
| `already_paid` | `payment_status = 'paid'` for this tournament | Success message + WhatsApp only |

Optional server behavior on `ready_to_pay`: if registration exists, waiver false, but **contact waiver valid** → copy contact waiver onto registration row (same as `/api/register` skip path) then return `ready_to_pay`.

**Rate limit:** simple in-memory or per-IP cap on this route (e.g. 30/min) to reduce email enumeration abuse.

---

## Waiver helper change

Add or extend in `src/lib/contacts.ts`:

```ts
// isContactWaiverValid — already enforces type + expiry (365d)
// Document: valid waiver grants eligibility for ANY tournament pay gate.
```

Do **not** require a prior registration on another tournament for waiver validity.

---

## UI structure

### New / refactored pieces

| File | Role |
|------|------|
| `src/lib/pay-eligibility.ts` | Pure resolver: email + tournamentId + waiverType → status + ids |
| `src/app/api/pay/eligibility/route.ts` | POST handler, admin-less, public |
| `src/components/pay/PayEmailGate.tsx` | Steps 1–2 + result screens |
| `src/components/shared/WhatsAppCommunityLink.tsx` | `variant: "inline" \| "card" \| "button"` — reads `getSiteSetting("footer.whatsapp_url")` |
| `src/components/pay/PayForm.tsx` | Shown only after gate clears OR `registrationId`+`payToken` in URL OR paid-flow cancel-back |

### `/pay/page.tsx`

- If `registrationId` + valid `payToken` in URL → render PayForm directly (no gate).
- Else if logged in → auto-run eligibility with player email + default or remembered waiver type → skip email UI when possible.
- Else → render `PayEmailGate` above PayForm (PayForm hidden until `ready_to_pay`).

### WhatsApp surfaces (same URL, sized appropriately)

| Surface | Variant |
|---------|---------|
| Floating FAB | existing `WhatsAppButton` — keep; ensure z-index doesn’t cover pay CTA |
| Pay email gate — blocker states | `card` |
| Pay email gate — footer hint | `inline` |
| `/pay` hero | `inline` |
| `/pay/success` | `card` |
| `/register` (World Cup instructions + generic) | `inline` or `card` |
| `/events/[slug]` pay CTA area | `inline` |
| `/contact` | **Fix:** remove hardcoded URL; use site setting |
| Register-first blocker copy | `button` + Register link |

---

## Phases (implement in order)

### Phase T1 — API + lib + migration

**Files:** migration (done), `pay-eligibility.ts`, `api/pay/eligibility/route.ts`, unit-level tests optional.

**Manual test:** POST with test emails for each `status` (use Supabase / admin seed data).

---

### Phase T2 — PayEmailGate + Pay page integration

**Files:** `PayEmailGate.tsx`, `pay/page.tsx`, wire PayForm show/hide.

**Manual test:**

1. Logged out, email with valid waiver + pending reg → pay options without login.
2. Logged out, unknown email → register message + WhatsApp.
3. Logged in → no email field; lands on pay or correct blocker.
4. Paid registration → already_paid screen.

---

### Phase T3 — WhatsApp component + site-wide pass

**Files:** `WhatsAppCommunityLink.tsx`, update register/pay/success/event/contact pages; tune FAB size on mobile.

**Manual test:** Change URL in `/admin/site` → all surfaces update after cache revalidate.

---

### Phase T4 — Register path + regression

**Files:** Ensure `/register` with waiver on file still skips DocuSeal and returns pay URL; event cards still link `/pay?tournament=slug`.

**Manual test:** Full journey: new email → register → waiver → pay; second tournament with same email → email gate → pay only. World Cup $960 paths unchanged.

---

## Copy templates (blocker screens)

**unknown_email / no_waiver**

> We don't have a signed waiver for this email. Register for [Tournament title], sign the waiver, then come back here to pay. Questions? Join our WhatsApp community.

Buttons: **Register for this event** | **Join WhatsApp**

**needs_registration**

> Your waiver is on file. Register for [Tournament title] to join the roster, then return here to pay.

**already_paid**

> You're paid up for [Tournament title]. See you on the field. Join WhatsApp for schedules and updates.

---

## Session prompt (copy below)

```
Implement tournament email pay gate per .cursor/plans/tournament-email-pay-gate.md.

Start with Phase T1 only. PLAN first (files, functions, manual test checklist).

Locked requirements:
- All payment-open tournaments use email gate on /pay (unless registrationId+payToken already present).
- Waiver: contact-level, 365 days, adult/youth step 2; valid for any tournament.
- Logged-in users skip email; use getCurrentPlayer() email.
- POST /api/pay/eligibility with statuses: unknown_email, no_waiver, needs_registration, needs_waiver, ready_to_pay, already_paid.
- WhatsApp: single footer.whatsapp_url via shared component; responsive variants.
- World Cup pay kinds unchanged after gate.
- Different user-visible messages per status (OK).

Apply migration 20260603120000_pay_email_lookup_indexes.sql if not applied.
Do not refactor admin auth. One phase per turn; stop after T1 for manual test.
```

---

## Out of scope

- Per-tournament WhatsApp URLs
- Auto-creating registration without player submitting register form (use needs_registration + register with waiver skip)
- Login required for pay
