# Tournament email pay gate — acceptance (T1–T4)

Shipped 2026-06-03. Regression reference only.

## What shipped

- `/pay?tournament=<slug>` — email + adult/youth gate (skipped when `registrationId` + valid `payToken`, or after eligibility `ready_to_pay`).
- `POST /api/pay/eligibility` — statuses: `unknown_email`, `no_waiver`, `needs_registration`, `needs_waiver`, `ready_to_pay`, `already_paid`.
- Contact waiver (365d, adult/youth) valid across tournaments; sync to registration on pay when needed.
- `WhatsAppCommunityLink` — single URL from `footer.whatsapp_url` (admin: `/admin/site`).
- Register links from gate: `/register?tournament=<slug>&type=adult|youth`; waiver skip still returns pay resume URL with slug.

## Pre-flight (local)

```bash
node --env-file=.env.local scripts/verify-pay-email-gate-prereqs.mjs
node --env-file=.env.local scripts/verify-pay-gate-t4.mjs
```

## Manual smoke

| Step | Pass? |
|------|-------|
| Logged out: `/pay?tournament=world-cup-summer-tournament` shows email gate | |
| Unknown email → register blocker + WhatsApp | |
| Valid waiver + pending reg → pay options (World Cup kinds unchanged) | |
| Logged in: no email field; auto eligibility | |
| `/pay?registrationId=…&payToken=…` (valid) skips gate | |
| Register with waiver on file → “Pay here” → `PayForm` (no DocuSeal) | |
| Event card pay link uses `?tournament=slug` | |

## Code map

| Area | Path |
|------|------|
| Eligibility API | `src/app/api/pay/eligibility/route.ts` |
| Resolver | `src/lib/pay-eligibility.ts` |
| Gate UI | `src/components/pay/PayEmailGate.tsx`, `PayPageClient.tsx` |
| Pay page | `src/app/pay/page.tsx` |
| WhatsApp | `src/components/shared/WhatsAppCommunityLink.tsx` |
| Event links | `src/lib/tournament-public-links.ts` |
| Pay resume URLs | `src/lib/pay-resume-url.ts` |
| Migration | `supabase/migrations/20260603120000_pay_email_lookup_indexes.sql` |

Archived build plan: `docs/archive/tournament-email-pay-gate-plan.md`
