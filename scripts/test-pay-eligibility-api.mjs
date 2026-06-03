/**
 * Manual helper for Phase T1 — POST /api/pay/eligibility
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-pay-eligibility-api.mjs <email> [adult|youth]
 *
 * Requires dev server: npm run dev (default base http://localhost:3000)
 * Override: PAY_ELIGIBILITY_TEST_BASE_URL
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const waiverType = process.argv[3] === "youth" ? "youth" : "adult";
const base =
  process.env.PAY_ELIGIBILITY_TEST_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

if (!email) {
  console.error(
    "Usage: node --env-file=.env.local scripts/test-pay-eligibility-api.mjs <email> [adult|youth]"
  );
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

const body = {
  email,
  tournamentId: tournament.id,
  waiverType,
};

console.log(`POST ${base}/api/pay/eligibility`);
console.log("Body:", JSON.stringify(body, null, 2));
console.log(`Tournament: ${tournament.title} (${tournament.slug})\n`);

const res = await fetch(`${base}/api/pay/eligibility`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = text;
}

console.log(`Status: ${res.status}`);
console.log(JSON.stringify(json, null, 2));
