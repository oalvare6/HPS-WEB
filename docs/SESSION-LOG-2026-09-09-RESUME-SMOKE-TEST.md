# Session log — 2026-09-09 — F-01 / F-02 deployed and smoke-tested in production

**Read after** `remediation_stage_1_2_report.md`. This is the record of what happened when that
work met production: two migrations applied by hand, three merges to `main`, one live
end-to-end run of the magic-link flow by a browser agent, two defects found and fixed the same
afternoon. Nothing in this log changes the design in the report; it changes what is *known*.

## 1. What shipped

| PR | Commit on `main` | What |
|---|---|---|
| [#4](https://github.com/oalvare6/HPS-WEB/pull/4) | `838282c` | F-01 resume capability, F-02 payment finalization, Resend adapter. Migrations `20260909120000_*` and `20260909120100_*` applied to production **by the operator, by hand**, before the merge. Verified afterwards: both functions present, all four tables present, ledger untouched. |
| [#5](https://github.com/oalvare6/HPS-WEB/pull/5) | `bca287b` | Form bodies parsed from raw text; `?link=malformed` distinct from `?link=invalid`; one token-free refusal warning. |
| [#6](https://github.com/oalvare6/HPS-WEB/pull/6) | `1b5009a` | A refused exchange no longer clears a live session cookie. |

Production is `1b5009a` on `www.houstonpremiersoccer.com` as of 17:39Z.

## 2. The run

Executed by a browser agent with the operator's accounts (site, Vercel, Namecheap, Supabase,
Resend), against one throwaway registration: **"Resume Test"**, `omaralvarezz01+resume@gmail.com`,
Community Cup - Fall 2026, team 3rd Ward FC, adult, DocuSeal submission `11010831` sent and
never signed. Database and log checks were done from this session over the read-only
connectors. No production row was edited by hand; every write below was made by the
application through the flow under test.

| Part | Checks | Result |
|---|---|---|
| A. Fixture | Pending registration created through `/register`; DocuSeal reached, not signed | PASS |
| B. Neutral endpoint | `POST /api/pay/eligibility` for the fixture email, an unknown email, a registered-elsewhere email, and a repeat inside the cooldown | PASS: four byte-identical bodies |
| C. Delivery | Resend log | PASS: exactly one Delivered email, to the fixture address only, from `noreply@houstonpremiersoccer.com` |
| D. Exchange and session | Link → interstitial → session → summary; cookie; reuse; waiver start; cancel ×2; sign-out; no-cookie 401 | **First attempt FAILED** (§3). Retry after #5 PASS. Reuse **exposed a second defect** (§4). Final run after #6: all of D0–D14 PASS |
| E. Database | Token, session, throttle and registration rows | PASS (§5) |
| F. Logs | Vercel runtime logs, 3 h window | PASS: zero 5xx, zero errors, one expected `[resume-exchange] refused` warning per deliberate reuse |

### D, final run, step by step

| Step | Saw |
|---|---|
| D0 fresh link | `/pay/resume` with "Your spot — Community Cup - Fall 2026", 3rd Ward FC, waiver "Not signed yet", $80.00 outstanding, no "Pay by card" while the waiver is unsigned |
| D10b re-click the used link in a second tab | Second tab lands on `/pay/resume?link=invalid` **showing the summary**; first tab still signed in after reload |
| D11 "Sign my waiver" | Opens the existing DocuSeal submission on `docuseal.com`; nothing signed |
| D12 cancel, then repeat the POST | Page shows "Spot cancelled"; second `POST /pay/resume/api/cancel` → `200 {"ok":true,"alreadyCancelled":true}` |
| D13 sign out | `/pay/resume?signed_out=1`, "You're signed out" |
| D14 cancel with no session | `401 {"error":"Your link has expired. Request a new one from the pay page."}` |

Not verified by automation: the cookie's `Path`, `Secure` and `SameSite` attributes. The
agent could confirm the cookie exists and is HttpOnly (the summary renders, `document.cookie`
cannot see it) but its tooling cannot read the cookie store. A human glance at DevTools →
Application → Cookies closes that; the code sets `Path=/pay/resume; Secure; SameSite=Lax`
(`src/lib/resume-session.ts`, asserted by `scripts/test-resume-routes.ts`).

## 3. Defect 1: the first magic link answered "already used"

**Symptom.** The first real link landed on `/pay/resume?link=invalid`. The token row showed
`consumed_at IS NULL`, unexpired, and no session. The server had compared the wrong hash.

**What was ruled out first, and how.** The agent read the email's button `href`: host
`www.houstonpremiersoccer.com`, path `/pay/resume/exchange`, a 43-character `t=` value, no
Resend or Google wrapper. It computed sha256 of that value and it **equalled the stored
`token_hash`**. Resend's open and click tracking are not configured. So the email carried the
right token and the fault was on our side of the POST.

**Cause.** `readBody` in `src/lib/resume-routes.ts` used `request.formData()` for the
interstitial's `application/x-www-form-urlencoded` body. On Vercel's Node runtime that
returned no `token`, the `catch` swallowed it, the empty string was hashed and looked up, and
the honest answer to "does this hash exist" was no. Locally it worked, which is why 38 route
assertions were green.

**Fix (#5).** Parse urlencoded bodies from `request.text()` with `URLSearchParams`;
`formData()` only for multipart. And separate the two failure meanings so this cannot be
misread again: a token the server never received (empty or short) → `?link=malformed`, a
well-formed token the database refuses → `?link=invalid`. One warning per refusal names
reason, token length and content type, never the token.

## 4. Defect 2: re-clicking a used link signed the player out

**Symptom.** With a live session in tab 1, opening the same used link in tab 2 gave
`?link=invalid` as intended, and tab 1 then showed "This link has expired".

**Cause.** The refusal path sent `Set-Cookie: hps_resume=; Max-Age=0` alongside the redirect.
Cookies are per browser, not per tab; a refused token says nothing about the session the
browser already holds.

**Fix (#6).** The refusal sets no cookie at all. A signed-in player who re-clicks lands on
their registration page; a signed-out one sees the "already used" copy. Two assertions added:
neither a refused nor a malformed exchange sets any cookie, and the first session still
authenticates after a refused re-use.

## 5. Database evidence (read-only, after the final run)

| Object | State |
|---|---|
| `registration_access_tokens` for the fixture | 3 rows, 64-char hashes. #1 (16:25Z) never consumed, expired at 16:45Z (defect 1). #2 (17:16Z) consumed 17:18Z. #3 (17:46Z) consumed 17:47Z |
| `registration_sessions` for the fixture | 2 rows, both four scopes, both linked to their token. #1 (17:18Z) never revoked; its cookie was wiped by defect 2, so it idles to expiry at 17:18Z tomorrow. #2 (17:47Z) `last_used_at` 17:51:24Z, `revoked_at` 17:51:24Z (D13) |
| `resume_link_requests`, last 3 h | 5 rows: 3 distinct email digests, 1 IP digest. Part B's repeat inside the cooldown wrote nothing, as designed |
| the fixture registration | `payment_status = 'pending'`, `payment_method NULL`, `waiver_signed = false`, `cancelled_at = 17:51:00Z`, `docuseal_status = 'sent'` |
| `payments` for the fixture | 0 rows |

Every value is the one the design predicts. Nothing on the resume surface marked anything
paid or signed.

## 6. Left for the operator

- **Cancel the fixture from the admin** when convenient: "Resume Test", Community Cup, 3rd
  Ward FC. It is already `cancelled_at`-set by the test; the admin row will read as cancelled.
  The DocuSeal submission `11010831` can be archived on their side or left; nothing reads it.
- **The $80 record** (`803e3697-…` / `bbd7fa9b-…`) is still pending. Converge it per report
  §13 step 6 (dry run, then `HPS_RECONCILE_APPLY=1 … --apply`) or replay the event from Stripe.
- **F-00 credential rotation** per `credential_containment_plan.md`. Not started.
- **Session #1 above** expires on its own; there is no admin control for resume sessions and
  none is needed at this scale.
- **Stripe test event** (report §13 step 5, last item) was not sent in this run; the first real
  card payment will be the proof. Watch `stripe_webhook_events` for `outcome = 'finalized'`.

## 7. Lessons worth keeping

- **A runtime difference, not a logic bug, took the flow down on day one.** The unit tests were
  right about the code and wrong about Vercel. When a body-parsing primitive has known
  runtime variance (`formData()` does), parse from text.
- **Make the two "no" answers different.** "You sent nothing" and "what you sent is unknown"
  looked identical to the player and to the operator; ten minutes of the diagnosis was
  telling them apart. The split is now permanent.
- **Test reuse with a live session, not just reuse alone.** The reuse test passed on its own
  terms and still found the worse bug, because the agent noticed the other tab.
- **Verify the sender before the receiver.** The sha256-of-the-href check took the email out
  of the suspect list in one step. Same instinct as the DocuSeal webhook note in `CLAUDE.md`.
