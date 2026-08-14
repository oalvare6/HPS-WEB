/**
 * Waiver reconciliation — `src/lib/waiver-reconcile.ts` and the document-URL
 * extraction in `src/lib/waiver-capture.ts`.
 *
 * These two decide whether a player who signed a waiver is believed. Production
 * spent a month getting that wrong in the most expensive direction: the
 * DocuSeal webhook was answering 503 to every delivery, seven players signed
 * waivers the database never heard about, and each of them was told to sign
 * again on their next visit.
 *
 * The failure modes are severe in both directions:
 *   - Too eager, and a signed player triggers a DocuSeal API call on every page
 *     render for the rest of the season.
 *   - Too lazy, and a real signature stays invisible and the loop comes back.
 *
 * Run: npx tsx scripts/test-waiver-reconcile.ts
 */
import { planWaiverReconcile } from "../src/lib/waiver-reconcile";
import { documentUrlFrom } from "../src/lib/waiver-capture";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}\n      expected: ${e}\n      actual:   ${a}`);
  }
}

console.log("\nwaiver-reconcile — when to ask DocuSeal\n");

// The cost guard. This runs during page render, so a signed player revisiting
// their status must never bill an API call.
check(
  "already signed → never calls DocuSeal, even with a submission id",
  planWaiverReconcile(
    { waiver_signed: true, docuseal_submission_id: 10204562 },
    true
  ),
  { action: "skip", reason: "already_signed", signed: true }
);
check(
  "already signed outranks a missing API key",
  planWaiverReconcile({ waiver_signed: true, docuseal_submission_id: null }, false),
  { action: "skip", reason: "already_signed", signed: true }
);

// The actual rescue path: unsigned row, real submission, key present.
check(
  "unsigned with a submission and a key → ask DocuSeal",
  planWaiverReconcile(
    { waiver_signed: false, docuseal_submission_id: 10204562 },
    true
  ),
  { action: "ask_docuseal", submissionId: 10204562 }
);
check(
  "waiver_signed null is treated as unsigned, not as signed",
  planWaiverReconcile({ waiver_signed: null, docuseal_submission_id: 9961470 }, true),
  { action: "ask_docuseal", submissionId: 9961470 }
);

// An in-app signed registration has no submission id. Reporting that as
// "DocuSeal not configured" would send an operator hunting a config bug that
// does not exist, so no_submission must be checked first.
check(
  "no submission → no_submission, not not_configured",
  planWaiverReconcile({ waiver_signed: false, docuseal_submission_id: null }, false),
  { action: "skip", reason: "no_submission", signed: false }
);
check(
  "no submission with a key present is still no_submission",
  planWaiverReconcile({ waiver_signed: false, docuseal_submission_id: null }, true),
  { action: "skip", reason: "no_submission", signed: false }
);

check(
  "submission but no API key → not_configured",
  planWaiverReconcile(
    { waiver_signed: false, docuseal_submission_id: 10204562 },
    false
  ),
  { action: "skip", reason: "not_configured", signed: false }
);

// Submission id 0 is not a real DocuSeal id, but `!0` is true in JavaScript and
// an earlier draft of this used a truthiness check — which would have reported
// "no submission" for it. The guard is an explicit null check for that reason.
check(
  "submission id 0 is still a submission (truthiness trap)",
  planWaiverReconcile({ waiver_signed: false, docuseal_submission_id: 0 }, true),
  { action: "ask_docuseal", submissionId: 0 }
);

// Nothing may report signed:true unless the row actually says so — a false
// positive here puts an unsigned player on the pitch.
for (const [label, plan] of [
  [
    "unsigned + submission",
    planWaiverReconcile({ waiver_signed: false, docuseal_submission_id: 1 }, true),
  ],
  [
    "unsigned + no submission",
    planWaiverReconcile({ waiver_signed: false, docuseal_submission_id: null }, true),
  ],
  [
    "unsigned + no key",
    planWaiverReconcile({ waiver_signed: false, docuseal_submission_id: 1 }, false),
  ],
] as const) {
  check(
    `never claims signed for an unsigned row: ${label}`,
    plan.action === "skip" ? plan.signed : false,
    false
  );
}

console.log("\nwaiver-capture — finding the signed document\n");

// A waiver you cannot produce is not a waiver. Production has 104 rows with a
// NULL document URL; these are the shapes that must not slip through.
check(
  "combined_document_url wins",
  documentUrlFrom({
    combined_document_url: "https://docuseal.com/blobs/combined.pdf",
    documents: [{ name: "waiver", url: "https://docuseal.com/blobs/single.pdf" }],
  }),
  "https://docuseal.com/blobs/combined.pdf"
);
check(
  "falls back to the first document with a url",
  documentUrlFrom({
    combined_document_url: null,
    documents: [
      { name: "no-url" },
      { name: "waiver", url: "https://docuseal.com/blobs/single.pdf" },
    ],
  }),
  "https://docuseal.com/blobs/single.pdf"
);
check("null submission → null", documentUrlFrom(null), null);
check("empty submission → null", documentUrlFrom({}), null);
check(
  "documents present but none carry a url → null",
  documentUrlFrom({ combined_document_url: null, documents: [{ name: "x" }] }),
  null
);

console.log(`\n${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
