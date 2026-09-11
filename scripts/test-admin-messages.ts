/**
 * Who a message goes to, and what it says (Stage 2.3 item B).
 *
 *   npx tsx scripts/test-admin-messages.ts
 *
 * These are the decisions that must be identical in the preview the owner
 * approves and the send that follows, so they live in one pure module and are
 * checked here without a database or a provider.
 *
 * The rule worth stating: nobody is dropped silently. A player with no email is
 * reported as SKIPPED, not omitted — "I messaged the unpaid players" and "I
 * messaged the unpaid players who happen to have an address on file" are
 * different claims, and only one of them is true.
 */
import assert from "node:assert/strict";
import {
  AUDIENCE_LABELS,
  MESSAGE_AUDIENCES,
  MESSAGE_TEMPLATES,
  isMessageAudience,
  isMessageTemplate,
  renderMessageBody,
  resolveAudience,
  unknownPlaceholders,
  describeOutcome,
  type MessageCandidate,
  type MessageRecipientRow,
} from "../src/lib/admin-messages";
import { isFinanciallySettled } from "../src/lib/admin-roster";

let checks = 0;
function check(name: string, ok: boolean, detail = ""): void {
  checks += 1;
  assert.ok(ok, `${name}${detail ? ` — ${detail}` : ""}`);
}

const future = new Date(Date.now() + 200 * 24 * 3600 * 1000).toISOString();
const past = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

function player(over: Partial<MessageCandidate> = {}): MessageCandidate {
  return {
    registrationId: over.registrationId ?? "r1",
    contactId: "c1",
    firstName: "Ann",
    lastName: "Adams",
    email: "ann@example.com",
    paymentStatus: "pending",
    teamId: null,
    contactExpiresAt: future,
    contactSource: "in_app",
    ...over,
  };
}

/* --- The settled definition is shared with the roster, not re-stated ------ */

check("paid counts as settled", isFinanciallySettled("paid"));
check("waived counts as settled — a comped player owes nothing", isFinanciallySettled("waived"));
check("partial does NOT count as settled", !isFinanciallySettled("partial"));
check("refunded does NOT count as settled", !isFinanciallySettled("refunded"));
check("pending does NOT count as settled", !isFinanciallySettled("pending"));

/* --- Audiences ------------------------------------------------------------ */

const roster: MessageCandidate[] = [
  player({ registrationId: "paid", paymentStatus: "paid", email: "paid@example.com" }),
  player({ registrationId: "waived", paymentStatus: "waived", email: "waived@example.com" }),
  player({ registrationId: "pending", paymentStatus: "pending", email: "pending@example.com" }),
  player({ registrationId: "partial", paymentStatus: "partial", email: "partial@example.com" }),
  player({ registrationId: "refunded", paymentStatus: "refunded", email: "refunded@example.com" }),
];

{
  const all = resolveAudience(roster, "all");
  check("'all' reaches everyone", all.recipients.length === 5, `${all.recipients.length}`);

  const unpaid = resolveAudience(roster, "unpaid");
  const ids = unpaid.recipients.map((r) => r.registrationId).sort();
  check(
    "'unpaid' means exactly what the roster calls outstanding",
    JSON.stringify(ids) === JSON.stringify(["partial", "pending", "refunded"]),
    ids.join(",")
  );
  check(
    "…so a waived player is never chased for money",
    !unpaid.recipients.some((r) => r.registrationId === "waived")
  );
  check(
    "…and a partial payer IS chased, because money is still owed",
    unpaid.recipients.some((r) => r.registrationId === "partial")
  );
}

{
  const covered = player({ registrationId: "covered", contactExpiresAt: future });
  const expired = player({
    registrationId: "expired",
    email: "expired@example.com",
    contactExpiresAt: past,
    regSignedAt: null,
  });
  const none = player({
    registrationId: "none",
    email: "none@example.com",
    contactExpiresAt: null,
    contactSource: null,
    regSignedAt: null,
  });
  const missing = resolveAudience([covered, expired, none], "waiver_missing");
  const ids = missing.recipients.map((r) => r.registrationId).sort();
  check(
    "'waiver_missing' uses the same waiverStatusFor the roster displays",
    JSON.stringify(ids) === JSON.stringify(["expired", "none"]),
    ids.join(",")
  );
}

{
  const a = player({ registrationId: "a", teamId: "team-1", email: "a@example.com" });
  const b = player({ registrationId: "b", teamId: "team-2", email: "b@example.com" });
  const team = resolveAudience([a, b], "team", { teamId: "team-1" });
  check("'team' reaches only that team", team.recipients.length === 1 && team.recipients[0].registrationId === "a");

  const noTeam = resolveAudience([a, b], "team", { teamId: null });
  check("'team' with no team chosen reaches nobody, rather than everybody", noTeam.recipients.length === 0);
}

{
  const a = player({ registrationId: "a", email: "a@example.com" });
  const b = player({ registrationId: "b", email: "b@example.com" });
  const picked = resolveAudience([a, b], "explicit", { registrationIds: ["b"] });
  check("'explicit' reaches exactly the people named", picked.recipients.length === 1 && picked.recipients[0].registrationId === "b");
  const none = resolveAudience([a, b], "explicit", { registrationIds: [] });
  check("'explicit' with nobody named reaches nobody", none.recipients.length === 0);
}

/* --- Nobody is dropped silently ------------------------------------------ */

{
  const withEmail = player({ registrationId: "has", email: "has@example.com" });
  const without = player({ registrationId: "none", email: null });
  const blank = player({ registrationId: "blank", email: "   " });
  const malformed = player({ registrationId: "bad", email: "not-an-address" });
  const walkIn = player({ registrationId: "walkin", email: "5550100@walk-in.local" });

  const out = resolveAudience([withEmail, without, blank, malformed, walkIn], "all");
  check("only the real address is written to", out.recipients.length === 1, `${out.recipients.length}`);
  check("and the other four are REPORTED, not omitted", out.skipped.length === 4, `${out.skipped.length}`);
  check(
    "each skip carries a reason an operator can read",
    out.skipped.every((s) => s.reason.length > 0 && !/^[a-z_]+$/.test(s.reason))
  );
  check(
    "a walk-in placeholder address is never mailed",
    !out.recipients.some((r) => r.email.includes("walk-in.local"))
  );
}

{
  // The same person on two registrations must not get the message twice.
  const one = player({ registrationId: "r1", email: "same@example.com" });
  const two = player({ registrationId: "r2", email: "SAME@example.com" });
  const out = resolveAudience([one, two], "all");
  check("one address gets one message, case-insensitively", out.recipients.length === 1);
  check("and the duplicate is reported as skipped", out.skipped.length === 1);
  check(
    "addresses are normalised to lower case before sending",
    out.recipients[0].email === "same@example.com"
  );
}

/* --- Rendering ------------------------------------------------------------ */

{
  const rendered = renderMessageBody("Hi {{first_name}} ({{name}}), about {{event}}.", {
    firstName: "Ann",
    name: "Ann Adams",
    event: "Spring Cup",
  });
  check("every known placeholder is filled", rendered === "Hi Ann (Ann Adams), about Spring Cup.", rendered);

  const repeated = renderMessageBody("{{first_name}} {{first_name}}", {
    firstName: "Ann",
    name: "Ann Adams",
    event: "x",
  });
  check("a placeholder used twice is filled twice", repeated === "Ann Ann", repeated);

  const unknownLeft = renderMessageBody("Hi {{nickname}}", {
    firstName: "Ann",
    name: "Ann Adams",
    event: "x",
  });
  check(
    "an unknown placeholder is left EXACTLY as typed, never guessed",
    unknownLeft === "Hi {{nickname}}",
    unknownLeft
  );
  check(
    "and the preview can warn about it",
    JSON.stringify(unknownPlaceholders("Hi {{nickname}} and {{first_name}}")) === JSON.stringify(["{{nickname}}"])
  );
}

/* --- Vocabulary ----------------------------------------------------------- */

for (const a of MESSAGE_AUDIENCES) {
  check(`audience ${a} is recognised`, isMessageAudience(a));
  check(`audience ${a} has a human label`, Boolean(AUDIENCE_LABELS[a]));
}
check("an unknown audience is rejected", !isMessageAudience("everyone-ever"));

for (const [key, tpl] of Object.entries(MESSAGE_TEMPLATES)) {
  check(`template ${key} is recognised`, isMessageTemplate(key));
  check(`template ${key} has a subject and a body`, Boolean(tpl.subject && tpl.body));
}
check("an unknown template is rejected", !isMessageTemplate("ransom-note"));

/* --- Outcome summary ------------------------------------------------------ */

{
  const rows = (statuses: string[]): MessageRecipientRow[] =>
    statuses.map((s, i) => ({
      id: String(i),
      registration_id: null,
      email: `${i}@example.com`,
      name: null,
      status: s as MessageRecipientRow["status"],
      error: null,
      provider_id: null,
      attempts: 1,
      sent_at: null,
    }));

  check("a clean send reads as sent only", describeOutcome(rows(["sent", "sent"])) === "2 sent");
  check(
    "failures are named rather than rounded away",
    describeOutcome(rows(["sent", "failed"])) === "1 sent, 1 failed"
  );
  check(
    "and anything still queued is visible",
    describeOutcome(rows(["sent", "failed", "queued"])) === "1 sent, 1 failed, 1 still queued"
  );
}

console.log(`admin messages: ${checks} checks passed`);
console.log("  audiences resolve from the same settled/waiver rules the roster displays,");
console.log("  and nobody is dropped from a send without being reported.");
