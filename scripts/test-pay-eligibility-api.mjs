/**
 * Manual helper — POST /api/pay/eligibility (resume-link request)
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-pay-eligibility-api.mjs <email>
 *
 * Requires dev server: npm run dev (default base http://localhost:3000)
 * Override: PAY_ELIGIBILITY_TEST_BASE_URL
 *
 * Since the F-01 remediation this endpoint answers every caller with the same
 * neutral body and never returns a token, an id or a status. Run it twice with
 * a known and an unknown email: both responses must be byte-identical.
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const base =
  process.env.PAY_ELIGIBILITY_TEST_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/test-pay-eligibility-api.mjs <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);
const { data: tournament, error } = await supabase
  .from("tournaments")
  .select("id, slug, title")
  .eq("payments_open", true)
  .limit(1)
  .maybeSingle();

if (error || !tournament) {
  console.error("No payments_open tournament:", error?.message ?? "none");
  process.exit(1);
}

const body = { email, tournamentId: tournament.id };

console.log(`POST ${base}/api/pay/eligibility`);
console.log(`Tournament: ${tournament.title} (${tournament.slug})\n`);

const res = await fetch(`${base}/api/pay/eligibility`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`Status: ${res.status}`);
console.log(text);
if (/token|registrationId|firstName|"status"/.test(text)) {
  console.error("\nFAIL: response leaks a capability or status.");
  process.exit(1);
}
