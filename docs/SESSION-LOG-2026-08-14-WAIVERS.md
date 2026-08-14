# Session log — 2026-08-14 (second session): the waiver round trip

**Read [`docs/REBUILD-PLAN.md`](./REBUILD-PLAN.md) first, then this file.** It follows
[`docs/SESSION-LOG-2026-08-14.md`](./SESSION-LOG-2026-08-14.md), which covers the auth-URL
and canonical-host work earlier the same day.

Live on https://www.houstonpremiersoccer.com as `main` @ **`0f76493`**.
Community Cup starts **2026-08-21 — 7 days out.**

---

## 1. The headline

**The DocuSeal webhook had never delivered a single event to this application.** Players
signed their waiver, came back to the site, and were told to sign it again.

There were **two independent faults**, and the first was hiding the second:

| | Fault | Effect |
|---|---|---|
| **A** | Webhook URL was the **apex** domain, `https://houstonpremiersoccer.com/...` | Vercel 307s apex → www **at the edge**. DocuSeal does not follow redirects: it recorded each 307 as a delivered event and dropped the body. |
| **B** | `DOCUSEAL_WEBHOOK_SECRET` was never set in Vercel | The endpoint returns 503 before reading the payload. Would have rejected anything that did arrive. |

The fingerprint, measured before the fix:

```
DocuSeal Events Log       10 of 10 deliveries = 307     ← logged as SUCCESS
DocuSeal "Failed" tab     empty — "There are no events"
All 8 stuck submissions   COMPLETED on DocuSeal's side, with valid metadata
registrations             8 rows stuck at docuseal_status='sent'
waiver_document_url       NULL for all 105 rows
```

**A webhook can fail in a way that looks perfectly healthy from both ends.** DocuSeal's
dashboard showed a green check on every delivery. Our logs showed nothing at all, because
nothing arrived. Neither side had a reason to raise an alarm.

⚠ **Neither fault was fixable in code.** The apex→www redirect is a Vercel *domain-level*
rule issued before middleware runs — `src/lib/canonical-host.ts` already documented this and
deliberately allow-lists the apex rather than redirecting it.

---

## 2. How the diagnosis went wrong first, and what to learn

The first pass concluded the missing secret was the root cause, on the strength of a real
measurement: `POST https://www.houstonpremiersoccer.com/api/docuseal/webhook` → **503**.

That measurement was accurate and the conclusion was wrong. **The test was run against the
`www` host — the one host DocuSeal never sends to.** It proved what the endpoint does, not
what the sender experiences.

**The rule this earns:** when a third-party integration fails, establish *the URL the sender
is actually configured with* before testing anything, and read *the sender's own delivery
log*. That log was the only place in either system where the 307s were visible.

A second wrong inference was made later and caught: that the `fix(routing): serve on one
host` commit (`7d64d8a`) created the redirect. It did not. That commit issues **308**s and
only for `.vercel.app` aliases; the apex 307 comes from Vercel and predates it. The timeline
settles it — waivers stopped landing around **2026-07-22**, that commit shipped **2026-08-14**.
A cause cannot postdate its effect. ⚠ **Do not revert `7d64d8a`** — it is what stopped five
hosts from splitting sessions and admin cookies.

---

## 3. Operator decisions locked this session

| # | Decision |
|---|---|
| D11 | **Keep DocuSeal** as the waiver path, fixed properly. In-app signing (A7) stays as the fallback for registrations with no DocuSeal submission. |
| D12 | **The waiver is a hard gate on roster membership.** A player is not on the roster until it is signed. `/pay` will not take money on an unconfirmed waiver. |
| D13 | **Pay-later is explicit and unblocking.** Players join a team and sit unpaid; nothing stops them signing up. Reports only. |

---

## 4. Code shipped — five commits

| Commit | What |
|---|---|
| `b6ad5ca` | Verify waivers with DocuSeal instead of trusting the webhook; pay-later |
| `f9ad915` | Correct the root cause in the docs — apex URL, not the missing secret |
| `89ef9ac` | Merge |
| `049c757` | Stop the health probe claiming deliveries are arriving |
| `0f76493` | Empty commit to rebuild and pick up the new env var |

### 4a. The structural fix — `src/lib/waiver-reconcile.ts`

The app used to learn about a signature exactly one way: the webhook. It now **asks DocuSeal
directly** whenever it is about to make a decision from `waiver_signed` — on `/register` and
on `/pay`. Same principle A4 already used for the owner at the field ("Done — check"); the
player's own round trip never got it.

The webhook is now an optimisation, not a dependency. **That is the durable fix.** Both faults
were configuration, invisible from inside the app and unfixable from inside it; the only
defence that survives that is not needing the webhook to be right.

- Never throws — every caller is a page render.
- 6s timeout on the DocuSeal call so a stalled request cannot hang a player's page.
- `planWaiverReconcile()` is pure and tested: it never calls DocuSeal for an already-signed
  row (this runs on render — a signed player revisiting would otherwise bill a request per
  page view), and reports `no_submission` before `not_configured` so an in-app-signed
  registration doesn't send an operator hunting a config bug that isn't there.

### 4b. `needs_waiver` resumes the existing submission

It used to link to in-app signing regardless. Now it links to the player's stored
`docuseal_sign_url`, so they finish the document they already opened rather than creating a
second one. Falls back to in-app only when there is no submission. Carries an
**"I already signed — check again"** link, which just reloads the page — the page re-checks
with DocuSeal on every load, so the button cannot disagree with the screen.

### 4c. `GET /api/docuseal/webhook` — a configuration probe

Returns `ready`, `webhookSecretConfigured`, `apiKeyConfigured` as booleans. Added because this
failure was invisible for a month behind a platform that keeps **one hour** of logs. Safe to
leave public: booleans only, and the endpoint fails closed.

⚠ Its `alsoCheck` field exists because the first version of this probe repeated the original
wrong inference. **A receiver can only report on requests that arrive.** A green light here is
necessary, never sufficient.

### 4d. Pay-later — UI only, no schema change

`payment_status` already had `'pending'` and `'partial'`, team was already written at signup,
and the Roster already reported by team. What was missing was the player-facing half: signup
ended on a bare Stripe form, so anyone not paying that day closed the tab unsure they had a
spot. Their row existed the whole time. **The system knew; the player didn't.**

Adds an enrolled banner ("You're on the roster for X — playing for Y") and an explicit
**"I'll pay later — save my spot."**

### 4e. ⚠ The trap that cost the most time

**`PayForm` must be the only thing inside its Suspense boundary on `/pay`.**

It calls `useSearchParams()`, so React renders it behind Suspense. Rendering *anything*
alongside that boundary — sibling in the same section, its own `<section>`, server component
or client component — leaves the fallback `<template>` stranded in the DOM and **the Pay
button never renders at all.** Reproduced on a clean production build, not just dev.

The enrolled banner and pay-later card are therefore passed **into** PayForm as the `enrolled`
prop. Do not compose them around it. Commented at all three sites.

Two things that wasted time here and are worth not repeating:

- `git stash`/`pop` against a **running** dev server corrupts the webpack cache on Windows and
  produces phantom 500s. Stop the server first.
- An HMR-triggered re-render resolved the boundary once, which briefly looked like the bug was
  latency rather than structure. **Verify against `npm run build` + `next start`**, not `next dev`.

---

## 5. Dashboard changes made this session

| Where | From | To |
|---|---|---|
| Vercel env vars | `DOCUSEAL_WEBHOOK_SECRET` absent | Added, **Sensitive, Production only** |
| DocuSeal webhook URL | `https://houstonpremiersoccer.com/api/docuseal/webhook` | `https://www.houstonpremiersoccer.com/api/docuseal/webhook` |

⚠ **Order matters, and it is the opposite of intuition.** Set the secret and **deploy it**
before changing the URL. The 307s were being logged as successes, so DocuSeal had never burned
a retry on this endpoint; flipping the URL first turns every delivery into a genuine 503 —
retried, counted, and potentially enough to get the endpoint auto-disabled.

⚠ **Server-side env vars bind at build time.** Adding the variable did not change the running
function; the dashboard "Redeploy" did not start a build either. An empty commit
(`0f76493`) was the reliable way to force one. **Confirm with the probe, not the dashboard** —
`webhookSecretConfigured` reads the running function's actual environment.

---

## 6. Verified, not assumed

```
GET  /api/docuseal/webhook   {"ready":true,"webhookSecretConfigured":true,
                              "apiKeyConfigured":true}
POST /api/docuseal/webhook   401 {"error":"Invalid signature."}   ← was 503
```

The **401 is the meaningful one**: the endpoint cleared the missing-secret guard and is
actively verifying HMAC.

**Sync Waivers recovery**, measured against a before-snapshot taken deliberately for the
comparison:

| | Before | After |
|---|---|---|
| Stuck at `docuseal_status='sent'` | 8 | **1** |
| Rows marked signed | 97 | **104** |
| **With a retrievable document** | **0** | **7** |

Seven of eight recovered, each with `waiver_document_url` populated — **the first non-NULL
values that column has ever held.** Signed-at timestamps came back as DocuSeal's real
completion times (Jordan Alvarez `12:44:32`, matching the 12:44 PM entry in DocuSeal's log),
so the legal record reflects when players actually signed, not when we found out.

**Both paid-but-unsigned players are closed** — Travis Carter and Omar Villatoro paid on
Aug 5 with nothing on file; both now have signed waivers with documents.

**Adrian Minero** (submission `8924315`) did not recover, and that is the correct answer:
DocuSeal reports the submission incomplete. He genuinely never finished signing. World Cup,
so not urgent.

**Stripe was audited and is clean** — endpoint on `www`, Active, **0% error rate**, subscribed
to `checkout.session.completed`, and both Aug 5 deliveries returned 200 `{"received": true}`.
The money path was never broken. A database integrity check independently found **zero drift**:
no succeeded payment whose registration still said unpaid.

Local gates: `tsc` clean · lint clean · clean production build · **71/71** across five scripts
(`test-tournament-state` 16, `test-signup-state` 16, `test-roster-totals` 8,
`test-canonical-host` 15, `test-waiver-reconcile` 16).

---

## 7. Still open — ordered

1. **97 registrations are marked signed with no retrievable document.** Sync Waivers only
   scans `docuseal_status='sent'`, so it fixed the 8 and left the historical rows alone. The
   PDFs exist in DocuSeal; the links were never stored. This is the last piece of the audit's
   "full legal exposure, zero legal protection" finding still standing. **Extending
   `/api/admin/sync-waivers` to also sweep `signed`-without-document rows is a small change to
   an existing route** and would take this from 7 to ~104. The 7 that just landed prove the
   mechanism works. Worth doing before 2026-08-21.
2. **No real end-to-end signature has travelled the fixed path yet.** Every piece is verified
   independently, but no `form.completed` has arrived since the URL change. Success = a 200 in
   DocuSeal's Events Log and the ✓ appearing without anyone touching admin.
3. **Consider rotating the DocuSeal HMAC secret.** It did not pass through the Claude Code
   session; whether it passed through the browser-extension chat is unverified. Cheap now.
   ⚠ Order: new value into Vercel and **deployed** first, then regenerate in DocuSeal.
4. **No database backups.** Carried. Free plan excludes them; Pro is $25/mo.
5. **Exposed credentials still valid at source** — service-role key, JWT secret, Postgres
   password, public 2026-06-19 → 2026-08-14. Carried. Post-tournament, but do not let it slide.
6. **Community Cup roster:** 7 teams, 4 signups, 3 with a team. Waivers now all on file.
7. **Waiver text unreviewed** (`src/lib/waiver-text.ts`) and **legal pages unreviewed**. Carried.

---

## 8. Traps for whoever picks this up

- **Check the sender's configured URL and its delivery log before testing an integration.**
  Testing the endpoint proves what the endpoint does, not what the sender experiences. This
  cost the first pass of this session.
- **The apex domain silently 307s.** Any third-party webhook configured against
  `houstonpremiersoccer.com` instead of `www.houstonpremiersoccer.com` dies invisibly. Stripe
  was checked and is fine. Check any future integration.
- **Do NOT revert `7d64d8a`** (canonical host). §2.
- **`PayForm` must be alone inside its Suspense boundary.** §4e.
- **Stop the dev server before `git stash`** on Windows. §4e.
- **Verify streaming/Suspense behaviour against a production build**, not `next dev`. §4e.
- **Env vars need a rebuild, not a redeploy click.** Confirm with the probe. §5.
- Everything in [`docs/SESSION-LOG-2026-08-14.md`](./SESSION-LOG-2026-08-14.md) §7 still applies —
  especially "do not disable legacy API keys" and "do not put `/auth/signout` back in the
  middleware matcher".

---

## 9. Files worth knowing about (new this session)

| Path | What |
|---|---|
| `src/lib/waiver-reconcile.ts` | Asks DocuSeal directly. The durable fix. |
| `src/components/pay/EnrolledPanels.tsx` | Roster banner + pay-later exit. Must stay synchronous. |
| `scripts/test-waiver-reconcile.ts` | 16 cases over the reconcile branch table. |
| `scripts/_mint-pay-token.ts` | Dev-only: mints a **localhost** pay-resume link for testing `/pay`. Production rejects these. |
| `src/app/api/docuseal/webhook/route.ts` | Gained a `GET` configuration probe. |
