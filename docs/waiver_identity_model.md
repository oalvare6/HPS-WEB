# Waiver identity model — Stage 1.3 Phase 0 trace

**Written 2026-09-09, before any Stage 1.3 code change.** Read with
`backend_audit_v1.md` F-04 and `remediation_stage_1_2_report.md` §16. This is the record
of what a waiver *is* in this codebase today, how the code decides an old one may be
reused, why that decision is unsafe, and the invariant the Stage 1.3 code enforces
instead. No personal data appears here; production facts are counts only.

The trace followed `POST /api/register` → contact upsert → registration insert →
historical waiver lookup → inheritance → DocuSeal submission → DocuSeal completion →
local "signed" state, and every other reader of `isContactWaiverValid`.

---

## CURRENT MODEL

### What a waiver is attached to

Waiver state is stored in **three places**, copied rather than referenced:

| Table | Columns | Meaning |
|---|---|---|
| `contacts` | `waiver_type`, `waiver_signed_at`, `waiver_expires_at`, `waiver_document_url`, `waiver_submission_id`, `waiver_source` | The **person-level** waiver. This is what "returning players never re-sign" (REBUILD-PLAN D9) reads. Written by `recordSignedWaiver` (promotion after any signature) and by the reuse writers below. |
| `registrations` | `waiver_type`, `waiver_signed`, `waiver_signed_at`, `waiver_document_url`, `docuseal_submission_id`, `docuseal_sign_url`, `docuseal_status` | The **per-registration** copy: "this signup is covered". Every gate that takes money (`payment-intent`, `/pay`, resume checkout) reads `registrations.waiver_signed`, reconciled against DocuSeal when false. |
| `waiver_signatures` | typed name, `signed_at`, `signer_relationship`, `ip`, `user_agent`, `waiver_version`, `registration_id`, `contact_id` | The producible record behind an **in-app** signature (A7). 0 rows in production; production has always used DocuSeal. |

The DocuSeal side holds the real document: one *submission* per signing attempt, created
server-side by three callers (`/api/register`, the admin "Sign now" route, the resume
`startWaiver` op), each with `send_email: false` and submitter `metadata.registration_id`
set to the registration it was created for.

### Who the waiver subject is

**The `contacts` row is the waiver subject**, and a contact is identified by **email**
(`citext`, unique). There is no `auth_user_id`, no guardian table, no child identity
separate from the contact. A Google sign-in resolves to a contact by email
(`getCurrentPlayer`).

- **Adult:** subject = signer = the contact. The DocuSeal submitter is created with the
  registration's email and the typed first/last name.
- **Youth:** the *registration* is `registration_type = 'youth'`, `waiver_type = 'youth'`.
  The DocuSeal submitter is still created with the registration's **email and the player's
  (child's) name**; the parent or guardian signs it. The guardian is represented **nowhere
  structurally** — only as the free-text `signer_relationship` / `signed_name` on an in-app
  signature row, and inside DocuSeal's own audit log. The contact row for a youth
  registration therefore carries the **parent's mailbox and the child's name/DOB** (whatever
  was typed first; `upsertContactByEmail` never overwrites a filled field).

### Can more than one player share one email?

Yes, legitimately, and production already contains the case: a youth registration shares
a family email with an adult registration (session log 2026-08-17 §2 — the youth row had
to be *unlinked* from the contact so both could stay live under
`registrations_one_live_spot_idx`). The email→contact model cannot represent two people
behind one mailbox, so it collapses them into one contact with one waiver.

### How validity is computed

`isContactWaiverValid(contact, waiverType)` (`src/lib/contacts.ts`): `waiver_signed_at`
present **and** `waiver_type === waiverType` **and** `waiver_expires_at > now`.
`waiver_expires_at` is written at record time as `signed_at + 365 days`
(`getWaiverExpiryIso`, `WAIVER_VALIDITY_DAYS`). An adult waiver never satisfies a youth
signup and vice versa. The admin computes coverage separately (`waiverStatusFor`), which is
display-only and unchanged by this stage.

### How completion becomes local state

Three writers, all through `recordSignedWaiver` (`src/lib/waiver-capture.ts`):
`POST /api/docuseal/webhook` (`form.completed`), the DocuSeal poll in
`waiver-reconcile.ts` (run by `/register`, `/pay`, resume summary/checkout/waiver,
`payment-intent`, admin "Done — check", admin sync), and the in-app signature path.
`recordSignedWaiver` updates the registration, then promotes the same values onto the
contact — which is what makes the waiver reusable by anything that later reads the contact.

---

## CURRENT REUSE RULE

"Reuse" = a new registration is written `waiver_signed = true` (with the contact's
`waiver_signed_at`, `waiver_document_url` and `docuseal_submission_id` copied onto it)
**without any signing event for that registration**. Four code paths do it; what each one
actually proves about identity is the column that matters:

| Path | Trigger | Identity evidence used | What it proves |
|---|---|---|---|
| **A. `POST /api/register`** (`register/route.ts:234-295`) | Anonymous form submit | `upsertContactByEmail(payload.email)` → `isContactWaiverValid(contact, waiverType)` | **Nothing.** The caller typed an email address. Name and DOB on the form are not compared to the contact (and would not be sufficient if they were). |
| **B. `POST /api/register/join`** → `enrollContactInTournament` (`pay-eligibility.ts:198-255`) | Signed-in confirm (D5) | Supabase `auth.getUser()` → contact by that verified email → `isContactWaiverValid` | Control of the mailbox (Google), and that the enrolled row is written with that contact's `contact_id`. |
| **C. `runPayEligibilityCheck` → `syncRegistrationWaiverFromContact`** (`pay-eligibility.ts:257-310, 528-542`) | Signed-in `/pay?tournament=` render | Session email → contact; registration found by `contact_id` **or by email fallback** | Mailbox control; the email-fallback branch can sync onto a row linked to a *different* contact. |
| **D. `resolveSignupState`** (`signup-state.ts:106,120`) | Every signed-in status surface (`/register`, `/events/[slug]`, `/me`) | Same contact as B | Display only, but it is what *offers* B, and it hides `needs_waiver` on an unsigned row when the contact is valid. |

Path A is the SEC-01 defect. Paths B–D share one assumption — **one verified mailbox is one
person** — which is true for adults in this business and demonstrably false for youth
(the family-email case above).

Every reuse also copies `contact.waiver_submission_id` into
`registrations.docuseal_submission_id`, so one DocuSeal submission ends up referenced by
several registrations (audit F-04: 19 submission ids on 40 rows). That is what makes the
old webhook's `.single()` lookup fail, and it is a false statement on the inherited row —
that submission was not signed for it.

Expiry is respected by every path (`isContactWaiverValid` requires an unexpired
`waiver_expires_at`); an expired waiver is never inherited today. That part is correct and
is kept.

---

## SECURITY FAILURE

**Knowing an email address is enough to put a new registration under someone else's
signed waiver.** Concretely, with path A:

1. Any caller POSTs `/api/register` with a returning player's email (a tournament id is on
   every event page) and any name, DOB and emergency contact they like.
2. The row is inserted, then marked `waiver_signed = true` from the contact, and — until
   Stage 1.3 — the response carried a 90-day capability token for that row.
3. Result: a registration for whoever typed the form, "covered" by a document signed by
   somebody else, possibly with a different name and date of birth on the row than on the
   waiver. The exact exposure REBUILD-PLAN §2 describes: nothing producible for the person
   actually on the pitch.

Youth makes it worse, not better: a parent who signed for child A and a stranger who knows
the parent's email are indistinguishable to path A, and even the honest parent registering
child B inherits child A's waiver.

Secondary defects found on the same trace and closed in this stage:

- The webhook resolved the registration by `docuseal_submission_id` alone (non-unique after
  copying) and ignored the server-set `metadata.registration_id`; a duplicate delivery whose
  payload lacked `completed_at` would re-stamp `waiver_signed_at = now()` and silently extend
  validity.
- Path C's email-fallback lookup could sync a contact's waiver onto a registration linked to
  a different contact.

---

## TARGET INVARIANT

> **A matching email address identifies; it never authorises waiver reuse.**
> A registration is covered by a waiver only when (1) a signing event for *that*
> registration was verified through the provider path (DocuSeal webhook with a valid
> signature, DocuSeal poll, or a recorded in-app signature), or (2) a still-valid **adult**
> waiver on the contact that the new registration is *linked to* is claimed by a caller
> whose identity is **authenticated by Supabase Auth for that same contact**. Nothing else
> inherits. Registration itself never fails because reuse was refused — the row is created
> and the waiver stays required.

The linkage the data model can actually defend, and the one Stage 1.3 uses:

| Caller identity | Waiver type | Reuse? | Why |
|---|---|---|---|
| Anonymous (typed email) | any | **No** | Email is an identifier, not proof. |
| Resume session (magic link / post-registration cookie) | any | **No** | Proves authority over one registration, not identity across a person's history. |
| Legacy HMAC token | any | **No** (retired entirely in Phase 3) | — |
| Supabase session whose contact **is** the registration's `contact_id` | **adult** | **Yes**, if unexpired and same type | The contact row is the waiver subject; Google proves control of the mailbox that *is* that contact's identity today. Residual assumption: one verified mailbox = one adult person. |
| Supabase session, same contact | **youth** | **No** — fresh youth waiver per registration | The model cannot tell one child from another behind one parent mailbox, and the guardian relationship is not recorded. The waiver subject cannot be shown to be the same person. |
| Supabase session, registration linked to a **different** contact (phone relink, legacy null) | any | **No** | The row's subject is not the session's contact. |

All four reuse paths (A–D) are routed through one pure decision, `decideWaiverReuse` in
`src/lib/waiver-reuse.ts`, so the rule cannot drift between the display surfaces and the
writers. Inherited rows no longer copy `docuseal_submission_id`; they keep the document
link (evidence) and `waiver_signed_at` (the date the contact signed).

---

## UNRESOLVED BUSINESS QUESTIONS

Listed for the operator; none of them is decided in code beyond the conservative default
above.

1. **Youth annual waiver.** Should a parent's signed youth waiver for a child carry to that
   child's next event within 365 days? Today's model cannot identify the child (no child
   record; the contact holds the parent's mailbox and the first-typed name). Stage 1.3
   requires a fresh youth waiver per registration. If annual youth reuse is wanted, Track B3
   (`people` with a guardian/child relationship, or at minimum child name + DOB bound to the
   signature) is the prerequisite; a name-and-DOB match on today's columns was considered
   and rejected as insufficient.
2. **Shared family mailboxes.** Two players behind one email cannot both be contacts. The
   D4 decision (phone as identity) resolves this for adults; the youth case still needs a
   guardian link. Until then the admin must unlink a second player's row by hand, as was
   done on 2026-08-17.
3. **Admin override and imported waivers.** `waiver_source = 'admin_override'` (39 of 57
   contact waivers at the audit) and `'import'` carry no signer identity at all. They are
   still accepted for adult reuse because the operator vouched for them (D9). The operator
   may want overrides excluded from *self-service* reuse once real documents are backfilled
   (B4).
4. **Phone-based relinking.** `linkRegistrationToContact` can re-point a registration to a
   contact with a different email when the phone matches, and a later DocuSeal completion
   then promotes the waiver onto that contact. Whether a phone match is enough to attribute
   a signed document to a person is a policy question tied to D4; the row is flagged
   `needs_admin_review` today and reuse is refused when the contact ids differ.
5. **Waiver validity window.** 365 days from signature is the only rule in code and in the
   waiver text. If the operator wants a season-based window instead, that is a text change
   (bump `WAIVER_TEXT_VERSION`) plus `WAIVER_VALIDITY_DAYS`.
