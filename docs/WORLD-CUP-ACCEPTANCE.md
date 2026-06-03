# World Cup launch — acceptance checklist (WC-7)

Run this on **production** (houstonpremiersoccer.com) after deploy, or on a staging URL
with Stripe test mode and the same Supabase project.

**Pre-flight (local or CI):**

```bash
npm run build
node --env-file=.env.local scripts/verify-world-cup-launch.mjs
```

**DB scripts (run once per environment if not already applied):**

```bash
node --env-file=.env.local scripts/update-world-cup-tournament.mjs
node --env-file=.env.local scripts/complete-spring-classic.mjs
```

**Auth smoke (optional, sends email to `AUTH_SMOKE_EMAIL`):**

```bash
AUTH_SMOKE=1 AUTH_SMOKE_EMAIL=you@example.com npx tsx --env-file=.env.local scripts/smoke-auth.ts
```

---

## 1. Portrait flyer (WC-0)

| Step | Pass? |
|------|-------|
| Homepage featured World Cup card shows the **full portrait flyer** (not cropped to a wide banner). | |
| `/events/world-cup-summer-tournament` hero shows the same full flyer. | |
| Description mentions **$960**, roster size, groups, and **Jun 8** start. | |

---

## 2. Spring Classic completed; World Cup featured (WC-2)

| Step | Pass? |
|------|-------|
| `/events` lists Spring Classic (`spring-classic-2026`) with **Completed** status. | |
| Spring Classic is **not** in the homepage featured carousel. | |
| World Cup is featured / clearly upcoming; start date **Jun 8, 2026**. | |

---

## 3. Player auth (WC-1) — P0

Use a **fresh email** for magic link; use a separate account for OAuth.

| Step | Pass? |
|------|-------|
| Magic link: click email link → lands on `/me` (or `next`) → header shows **account menu with first name**. | |
| Reload any page → still signed in. | |
| Google sign-in → same (account menu + `/me`). | |
| Apple sign-in → same, **or** document exact Supabase/provider error from `/login` and `/admin/diagnostics`. | |

If OAuth fails: confirm Supabase **Redirect URLs** include `https://houstonpremiersoccer.com/auth/callback` (and staging origin if applicable). See `docs/AUTH-CONFIG.md`.

---

## 4. Register + waiver (WC-3)

Open `/register?tournament=world-cup-summer-tournament`.

| Step | Pass? |
|------|-------|
| Instruction block visible: everyone registers (captain too), waiver required, **$960** team fee options, groups assigned by HPS, **no team name on register**. | |
| Complete adult or youth registration → redirects to **DocuSeal** (waiver flow unchanged). | |
| After waiver → lands on `/pay?registrationId=...&payToken=...`. | |

---

## 5. Pay UI — not generic entry / $20 guest (WC-4)

**Logged out:** `/pay?tournament=world-cup-summer-tournament`

| Step | Pass? |
|------|-------|
| Three World Cup options: **Pay full team $960**, **Pay my share** (8–12), **My captain already paid** (disabled without registration link). | |
| No **Full Tournament Entry** / **Guest Drop-in $20** cards. | |

**Regression:** `/pay?tournament=spring-classic-2026` (or another tournament) still shows generic entry/drop-in if configured.

---

## 6. Pay full team $960 + team name (WC-5, WC-6)

Stripe **test mode** card `4242 4242 4242 4242`.

| Step | Pass? |
|------|-------|
| Select **Pay full team**, team name **Test FC**, checkout **$960.00**. | |
| Payment succeeds → `/pay/success`. | |
| Admin → World Cup tournament → **Registrants** tab → row shows **Test FC** in Team column. | |

---

## 7. Pay share — 10 players → $96 (WC-5)

| Step | Pass? |
|------|-------|
| New registrant (new email) through waiver → pay. | |
| **Pay my share**, roster **10**, preview **$96.00**, Stripe checkout **$96.00**. | |
| Payment succeeds. | |

---

## 8. Captain already paid — no Stripe (WC-5)

| Step | Pass? |
|------|-------|
| Registrant with waiver complete on `/pay?registrationId=...&payToken=...`. | |
| Select **My captain already paid**, enter team name, submit. | |
| **No** Stripe redirect; confirmation / success path. | |
| Admin registrant: `payment_status` pending (or as designed); team name stored; notes mention captain-paid ack if applicable. | |

---

## 9. Regression

| Step | Pass? |
|------|-------|
| Admin login (`/admin`) still works (HMAC cookie — unchanged). | |
| Unrelated tournament register + pay unchanged. | |
| World Cup `drop_in_fee_cents = 0` — no guest drop-in on World Cup pay. | |

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Operator | | | |
| Dev | | | |

When all rows pass, World Cup launch bar (WC-0–WC-7) is complete. Open-play work (Phases 16–19) may start per `hps-phases.mdc`.
