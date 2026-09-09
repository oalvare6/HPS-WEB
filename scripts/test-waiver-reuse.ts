/**
 * Stage 1.3 SEC-01 — waiver identity. Tests 1–7 of the stage spec, plus the
 * full branch table of `decideWaiverReuse` / `planRegistrationWaiver` and the
 * pay-gate resolver that sits on top of them.
 *
 * The invariant under test: a matching email address IDENTIFIES a person and
 * never AUTHORISES reuse of that person's waiver. Reuse needs a Supabase
 * session resolved to the very contact that holds the waiver, that contact's
 * own registration row, an ADULT waiver, unexpired and of the requested type.
 * Registration itself never fails because reuse was refused.
 *
 * Run: npx tsx scripts/test-waiver-reuse.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  decideWaiverReuse,
  describeWaiverReuseRefusal,
  type WaiverReuseContact,
  type WaiverReuseLinkage,
  type WaiverReuseRefusal,
} from "../src/lib/waiver-reuse";
import { planRegistrationWaiver } from "../src/lib/registration-waiver-plan";
import { resolvePayEligibility } from "../src/lib/pay-eligibility";
import { resolveSignupState } from "../src/lib/signup-state";
import { IN_APP_WAIVER_SCOPE, RESUME_SCOPES } from "../src/lib/resume-access";
import { isContactWaiverValid } from "../src/lib/contacts";
import { Harness } from "./_test-fakes";

const t = new Harness();

const NOW = Date.parse("2026-09-09T12:00:00.000Z");
const CONTACT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONTACT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function contact(patch: Partial<WaiverReuseContact> = {}): WaiverReuseContact {
  return {
    id: CONTACT_A,
    waiver_type: "adult",
    waiver_signed_at: "2026-03-01T00:00:00.000Z",
    waiver_expires_at: "2027-03-01T00:00:00.000Z",
    waiver_document_url: "https://docuseal.test/d/adult.pdf",
    ...patch,
  };
}

const LINKAGES: WaiverReuseLinkage[] = [
  "anonymous_email",
  "resume_session",
  "legacy_token",
  "authenticated_contact",
];

function reason(input: Parameters<typeof decideWaiverReuse>[0]): WaiverReuseRefusal | "allowed" {
  const d = decideWaiverReuse({ now: NOW, ...input });
  return d.allowed ? "allowed" : d.reason;
}

async function main() {
  /* ---------------- Test 1 / 2: email alone never reuses ---------------- */
  {
    const valid = contact();
    t.check("fixture: the contact's adult waiver is valid by the contacts rule", isContactWaiverValid(valid, "adult", NOW));

    t.eq(
      "1. anonymous signup with a waived contact's email → reuse refused (linkage_insufficient)",
      reason({ contact: valid, waiverType: "adult", linkage: "anonymous_email" }),
      "linkage_insufficient"
    );
    t.eq(
      "1b. ...and even naming the contact's own row does not help without identity",
      reason({ contact: valid, waiverType: "adult", linkage: "anonymous_email", registrationContactId: CONTACT_A }),
      "linkage_insufficient"
    );
    t.eq(
      "2. matching email alone: the decision has no email input at all — only linkage can unlock it",
      Object.keys({ contact: valid, waiverType: "adult", linkage: "anonymous_email" }).includes("email"),
      false
    );
    t.eq(
      "2b. a resume session (authority over one registration) cannot reuse either",
      reason({ contact: valid, waiverType: "adult", linkage: "resume_session", registrationContactId: CONTACT_A }),
      "linkage_insufficient"
    );
    t.eq(
      "2c. the retired HMAC token linkage is refused by name so it can never be re-added quietly",
      reason({ contact: valid, waiverType: "adult", linkage: "legacy_token", registrationContactId: CONTACT_A }),
      "linkage_insufficient"
    );
  }

  /* ---------------- Test 3: name alone never reuses ---------------- */
  {
    // The decision does not read names. A contact object carrying a matching
    // name (as the /register payload does) changes nothing without identity.
    const withName = { ...contact(), first_name: "Alex", last_name: "Rivera" };
    t.eq(
      "3. matching first/last name with an anonymous request → still refused",
      reason({ contact: withName, waiverType: "adult", linkage: "anonymous_email" }),
      "linkage_insufficient"
    );
    const src = fs.readFileSync(path.join(__dirname, "../src/lib/waiver-reuse.ts"), "utf8");
    t.check(
      "3b. lib/waiver-reuse.ts never reads first_name/last_name/email",
      !/first_name|last_name|\.email\b/.test(src)
    );
  }

  /* ---------------- Test 4: the one defensible linkage ---------------- */
  {
    const valid = contact();
    const d = decideWaiverReuse({
      contact: valid,
      waiverType: "adult",
      linkage: "authenticated_contact",
      registrationContactId: CONTACT_A,
      now: NOW,
    });
    t.eq("4. authenticated contact + own row + valid adult waiver → allowed", d.allowed, true);
    if (d.allowed) {
      t.eq("4b. the copied signed date is the CONTACT's date, never 'now'", d.signedAt, valid.waiver_signed_at);
      t.eq("4c. expiry copied from the contact", d.expiresAt, valid.waiver_expires_at);
      t.eq("4d. document link copied", d.documentUrl, valid.waiver_document_url);
    }
    t.eq(
      "4e. row about to be inserted for this contact (registrationContactId omitted) → allowed",
      reason({ contact: valid, waiverType: "adult", linkage: "authenticated_contact" }),
      "allowed"
    );
    t.eq(
      "4f. authenticated, but the row belongs to another contact → registration_contact_mismatch",
      reason({ contact: valid, waiverType: "adult", linkage: "authenticated_contact", registrationContactId: CONTACT_B }),
      "registration_contact_mismatch"
    );
    t.eq(
      "4g. authenticated, but the row has no contact link (legacy row) → refused, fails closed",
      reason({ contact: valid, waiverType: "adult", linkage: "authenticated_contact", registrationContactId: null }),
      "registration_contact_mismatch"
    );
    t.eq(
      "4h. no contact at all → no_contact",
      reason({ contact: null, waiverType: "adult", linkage: "authenticated_contact" }),
      "no_contact"
    );
    t.eq(
      "4i. a contact with a document link missing still reuses (the link is evidence, not the gate)",
      reason({ contact: contact({ waiver_document_url: null }), waiverType: "adult", linkage: "authenticated_contact" }),
      "allowed"
    );
  }

  /* ---------------- Test 5: expiry ---------------- */
  {
    const expired = contact({ waiver_expires_at: "2026-09-01T00:00:00.000Z" });
    for (const linkage of LINKAGES) {
      const got = reason({ contact: expired, waiverType: "adult", linkage, registrationContactId: CONTACT_A });
      t.check(`5. expired waiver is never inherited (${linkage} → ${got})`, got !== "allowed");
    }
    t.eq(
      "5b. authenticated + expired → the reason is waiver_expired",
      reason({ contact: expired, waiverType: "adult", linkage: "authenticated_contact", registrationContactId: CONTACT_A }),
      "waiver_expired"
    );
    t.eq(
      "5c. expiring exactly now counts as expired (no off-by-one in the player's favour)",
      reason({ contact: contact({ waiver_expires_at: new Date(NOW).toISOString() }), waiverType: "adult", linkage: "authenticated_contact" }),
      "waiver_expired"
    );
    t.eq(
      "5d. one second of validity left → still allowed",
      reason({ contact: contact({ waiver_expires_at: new Date(NOW + 1000).toISOString() }), waiverType: "adult", linkage: "authenticated_contact" }),
      "allowed"
    );
    t.eq(
      "5e. never signed → waiver_missing",
      reason({ contact: contact({ waiver_signed_at: null }), waiverType: "adult", linkage: "authenticated_contact" }),
      "waiver_missing"
    );
    t.eq(
      "5f. signed but no expiry on file → waiver_missing (never assumed valid)",
      reason({ contact: contact({ waiver_expires_at: null }), waiverType: "adult", linkage: "authenticated_contact" }),
      "waiver_missing"
    );
    t.eq(
      "5g. unparseable expiry → waiver_missing",
      reason({ contact: contact({ waiver_expires_at: "not a date" }), waiverType: "adult", linkage: "authenticated_contact" }),
      "waiver_missing"
    );
    t.eq(
      "5h. adult waiver asked to cover a youth registration → refused (youth rule, before type)",
      reason({ contact: contact(), waiverType: "youth", linkage: "authenticated_contact" }),
      "youth_requires_fresh_waiver"
    );
    t.eq(
      "5i. youth waiver on file, adult registration → waiver_type_mismatch",
      reason({ contact: contact({ waiver_type: "youth" }), waiverType: "adult", linkage: "authenticated_contact" }),
      "waiver_type_mismatch"
    );
    // The readable reasons and the contacts-module rule can never disagree.
    const samples: WaiverReuseContact[] = [
      contact(),
      contact({ waiver_expires_at: "2026-09-01T00:00:00.000Z" }),
      contact({ waiver_signed_at: null }),
      contact({ waiver_expires_at: null }),
      contact({ waiver_type: "youth" }),
      contact({ waiver_expires_at: new Date(NOW).toISOString() }),
    ];
    const agree = samples.every(
      (c) =>
        decideWaiverReuse({ contact: c, waiverType: "adult", linkage: "authenticated_contact", now: NOW }).allowed ===
        isContactWaiverValid(c, "adult", NOW)
    );
    t.check("5j. authenticated adult decision equals isContactWaiverValid on every sample", agree);
  }

  /* ---------------- Test 6: registration never fails on refusal ---------------- */
  {
    const valid = contact();
    const anonymous = planRegistrationWaiver({ contact: valid, waiverType: "adult", linkage: "anonymous_email", docusealConfigured: true, now: NOW });
    t.eq("6. anonymous signup → plan is 'sign with DocuSeal', not an error", anonymous.mode, "docuseal");
    t.eq("6b. ...carrying the refusal for the log", anonymous.mode !== "reuse" ? anonymous.refusal : null, "linkage_insufficient");
    t.eq("6c. DocuSeal plan scopes are exactly the resume scopes", [...anonymous.scopes], [...RESUME_SCOPES]);
    t.check("6d. DocuSeal plan never grants waiver:sign", !anonymous.scopes.includes(IN_APP_WAIVER_SCOPE));

    const inApp = planRegistrationWaiver({ contact: valid, waiverType: "adult", linkage: "anonymous_email", docusealConfigured: false, now: NOW });
    t.eq("6e. DocuSeal unconfigured → in-app signing plan", inApp.mode, "in_app");
    t.check("6f. only the in-app plan carries waiver:sign", inApp.scopes.includes(IN_APP_WAIVER_SCOPE));
    t.eq("6g. in-app plan scopes = resume scopes + waiver:sign, nothing else", [...inApp.scopes].sort(), [...RESUME_SCOPES, IN_APP_WAIVER_SCOPE].sort());

    const reuse = planRegistrationWaiver({ contact: valid, waiverType: "adult", linkage: "authenticated_contact", registrationContactId: CONTACT_A, docusealConfigured: true, now: NOW });
    t.eq("6h. authenticated owner → reuse plan", reuse.mode, "reuse");
    t.check("6i. reuse plan never grants waiver:sign", !reuse.scopes.includes(IN_APP_WAIVER_SCOPE));

    // Every refusal reason yields a signing plan; none throws or blocks.
    const refusals: Array<[string, Parameters<typeof planRegistrationWaiver>[0]]> = [
      ["expired", { contact: contact({ waiver_expires_at: "2026-01-01T00:00:00.000Z" }), waiverType: "adult", linkage: "authenticated_contact", docusealConfigured: true, now: NOW }],
      ["other contact's row", { contact: valid, waiverType: "adult", linkage: "authenticated_contact", registrationContactId: CONTACT_B, docusealConfigured: true, now: NOW }],
      ["youth", { contact: contact({ waiver_type: "youth" }), waiverType: "youth", linkage: "authenticated_contact", docusealConfigured: true, now: NOW }],
      ["never signed", { contact: contact({ waiver_signed_at: null, waiver_expires_at: null }), waiverType: "adult", linkage: "authenticated_contact", docusealConfigured: false, now: NOW }],
    ];
    for (const [label, input] of refusals) {
      const plan = planRegistrationWaiver(input);
      t.check(`6j. refused reuse (${label}) → registration proceeds to signing (${plan.mode})`, plan.mode === "docuseal" || plan.mode === "in_app");
    }
    for (const r of ["no_contact", "youth_requires_fresh_waiver", "linkage_insufficient", "registration_contact_mismatch", "waiver_missing", "waiver_type_mismatch", "waiver_expired"] as WaiverReuseRefusal[]) {
      t.check(`6k. player-facing wording exists for ${r}`, describeWaiverReuseRefusal(r).length > 10);
    }
  }

  /* ---------------- Test 7: minors ---------------- */
  {
    // A parent's contact holds a valid YOUTH waiver signed for a child. The
    // schema has no child identity, so the same parent (authenticated, own row)
    // still signs a fresh youth waiver for the next registration.
    const parent = contact({ waiver_type: "youth" });
    t.check("fixture: the youth waiver is valid by the contacts rule", isContactWaiverValid(parent, "youth", NOW));
    for (const linkage of LINKAGES) {
      t.eq(
        `7. youth registration never inherits (${linkage})`,
        reason({ contact: parent, waiverType: "youth", linkage, registrationContactId: CONTACT_A }),
        "youth_requires_fresh_waiver"
      );
    }
    const plan = planRegistrationWaiver({ contact: parent, waiverType: "youth", linkage: "authenticated_contact", registrationContactId: CONTACT_A, docusealConfigured: true, now: NOW });
    t.eq("7b. youth signup by the authenticated parent → DocuSeal plan, not reuse", plan.mode, "docuseal");
    t.eq(
      "7c. the youth refusal wins over every other check (even a stranger's row)",
      reason({ contact: parent, waiverType: "youth", linkage: "anonymous_email", registrationContactId: CONTACT_B }),
      "youth_requires_fresh_waiver"
    );
  }

  /* ---------------- The pay gate on top of the decision ---------------- */
  {
    const valid = {
      ...contact(),
      waiver_document_url: "https://docuseal.test/d/adult.pdf" as string | null,
      waiver_submission_id: null as number | null,
    };
    const unsignedOwnRow = { id: REG, payment_status: "pending" as const, waiver_signed: false, contact_id: CONTACT_A };

    const anon = resolvePayEligibility({ contact: valid, registration: unsignedOwnRow, waiverType: "adult", linkage: "anonymous_email" });
    t.eq("pay gate: anonymous + unsigned own row → needs_waiver (no sync)", anon.status, "needs_waiver");
    t.check("pay gate: anonymous never asks the caller to copy the waiver", !anon.syncWaiverFromContact);

    const authed = resolvePayEligibility({ contact: valid, registration: unsignedOwnRow, waiverType: "adult", linkage: "authenticated_contact" });
    t.eq("pay gate: authenticated owner + unsigned own row → ready_to_pay", authed.status, "ready_to_pay");
    t.eq("pay gate: ...and the caller is told to sync the waiver onto the row", authed.syncWaiverFromContact, true);

    const stranger = resolvePayEligibility({ contact: valid, registration: { ...unsignedOwnRow, contact_id: CONTACT_B }, waiverType: "adult", linkage: "authenticated_contact" });
    t.eq("pay gate: authenticated, but the unsigned row is another contact's → needs_waiver", stranger.status, "needs_waiver");

    const legacy = resolvePayEligibility({ contact: valid, registration: { ...unsignedOwnRow, contact_id: null }, waiverType: "adult", linkage: "authenticated_contact" });
    t.eq("pay gate: authenticated, legacy row with no contact link → needs_waiver (fails closed)", legacy.status, "needs_waiver");

    const signedRow = resolvePayEligibility({ contact: valid, registration: { ...unsignedOwnRow, waiver_signed: true }, waiverType: "adult", linkage: "anonymous_email" });
    t.eq("pay gate: a row signed in its own right pays regardless of linkage", signedRow.status, "ready_to_pay");
    t.check("pay gate: ...without any sync", !signedRow.syncWaiverFromContact);

    const youth = resolvePayEligibility({ contact: { ...valid, waiver_type: "youth" }, registration: unsignedOwnRow, waiverType: "youth", linkage: "authenticated_contact" });
    t.eq("pay gate: youth registration, authenticated parent → needs_waiver", youth.status, "needs_waiver");

    const noRow = resolvePayEligibility({ contact: valid, registration: null, waiverType: "adult", linkage: "anonymous_email" });
    t.eq("pay gate: anonymous with a waived contact and no row → no_waiver, never needs_registration", noRow.status, "no_waiver");
    const noRowAuthed = resolvePayEligibility({ contact: valid, registration: null, waiverType: "adult", linkage: "authenticated_contact" });
    t.eq("pay gate: authenticated owner with no row → needs_registration (a Confirm is still required)", noRowAuthed.status, "needs_registration");
  }

  /* ---------------- /register's state resolver ---------------- */
  {
    const valid = contact();
    const open = { canRegister: true, canPay: true };
    const unsignedOwn = { id: REG, payment_status: "pending" as const, waiver_signed: false, team_id: null, payment_method: null, contact_id: CONTACT_A };
    t.eq(
      "signup state: signed-in owner, unsigned own row, valid adult waiver → owes_payment (rescue)",
      resolveSignupState({ contact: valid, registration: unsignedOwn, waiverType: "adult", ...open }).kind,
      "owes_payment"
    );
    t.eq(
      "signup state: signed-in player, unsigned row that belongs to another contact → needs_waiver",
      resolveSignupState({ contact: valid, registration: { ...unsignedOwn, contact_id: CONTACT_B }, waiverType: "adult", ...open }).kind,
      "needs_waiver"
    );
    t.eq(
      "signup state: youth waiver on file, no row → full signup (never quick-join)",
      resolveSignupState({ contact: contact({ waiver_type: "youth" }), registration: null, waiverType: "youth", ...open }).kind,
      "full_signup"
    );
    t.eq(
      "signup state: youth row unsigned, parent's youth waiver valid → needs_waiver",
      resolveSignupState({ contact: contact({ waiver_type: "youth" }), registration: unsignedOwn, waiverType: "youth", ...open }).kind,
      "needs_waiver"
    );
  }

  t.done();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
