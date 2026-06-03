/**
 * Pre-flight before building tournament email pay gate (T1–T4).
 *
 * Run: node --env-file=.env.local scripts/verify-pay-email-gate-prereqs.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = path.join(
  root,
  "supabase/migrations/20260603120000_pay_email_lookup_indexes.sql"
);
const plan = path.join(root, "docs/archive/tournament-email-pay-gate-plan.md");

let failed = 0;
const ok = (m) => console.log(`  OK  ${m}`);
const bad = (m) => {
  console.error(` FAIL ${m}`);
  failed++;
};

console.log("\nFiles");
if (fs.existsSync(migration)) ok("pay email lookup migration");
else bad("missing migration 20260603120000_pay_email_lookup_indexes.sql");
if (fs.existsSync(plan)) ok("tournament-email-pay-gate-plan.md (archive)");
else bad("missing docs/archive/tournament-email-pay-gate-plan.md");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("\nDB checks skipped (need Supabase env)");
} else {
  const supabase = createClient(url, key);
  console.log("\nWhatsApp site setting");
  const { data: wa, error: waErr } = await supabase
    .from("site_settings")
    .select("key, value")
    .eq("key", "footer.whatsapp_url")
    .maybeSingle();
  if (waErr) bad(waErr.message);
  else if (wa?.value) ok(`footer.whatsapp_url = ${JSON.stringify(wa.value)}`);
  else bad("footer.whatsapp_url not in site_settings (migration seed should add it)");

  console.log("\nPayments-open tournaments (sample)");
  const { data: tourneys, error: tErr } = await supabase
    .from("tournaments")
    .select("id, slug, title, payments_open")
    .eq("payments_open", true)
    .limit(5);
  if (tErr) bad(tErr.message);
  else if (!tourneys?.length) bad("no payments_open tournaments");
  else {
    ok(`${tourneys.length} tournament(s) with payments_open`);
    tourneys.forEach((t) => console.log(`      - ${t.slug}`));
  }
}

console.log(failed ? `\n${failed} check(s) failed.\n` : "\nPay gate prereqs OK.\n");
process.exit(failed ? 1 : 0);
