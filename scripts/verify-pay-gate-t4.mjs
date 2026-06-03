/**
 * Phase T4 smoke checks (static / DB).
 *
 * Run: node --env-file=.env.local scripts/verify-pay-gate-t4.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const ok = (m) => console.log(`  OK  ${m}`);
const bad = (m) => {
  console.error(` FAIL ${m}`);
  failed++;
};

console.log("\nSource checks");

const registerPage = fs.readFileSync(
  path.join(root, "src/app/register/page.tsx"),
  "utf8"
);
if (registerPage.includes("preselectedType")) ok("register page passes preselectedType");
else bad("register page missing preselectedType");

const regForm = fs.readFileSync(
  path.join(root, "src/components/register/RegistrationForm.tsx"),
  "utf8"
);
if (regForm.includes("preselectedType")) ok("RegistrationForm reads preselectedType");
else bad("RegistrationForm missing preselectedType");

const registerRoute = fs.readFileSync(
  path.join(root, "src/app/api/register/route.ts"),
  "utf8"
);
if (registerRoute.includes("buildPayResumeUrl")) ok("register API uses buildPayResumeUrl");
else bad("register API missing buildPayResumeUrl");

const card = fs.readFileSync(
  path.join(root, "src/components/shared/TournamentCard.tsx"),
  "utf8"
);
if (card.includes("tournamentPrimaryCta")) ok("TournamentCard uses tournamentPrimaryCta");
else bad("TournamentCard missing tournamentPrimaryCta");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  console.log("\nPayments-open tournaments (pay link pattern)");
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("tournaments")
    .select("slug, payments_open, pay_url")
    .eq("payments_open", true)
    .limit(5);
  if (error) bad(error.message);
  else if (!data?.length) bad("no payments_open tournaments");
  else {
    ok(`${data.length} tournament(s)`);
    data.forEach((t) => {
      const expected = `/pay?tournament=${encodeURIComponent(t.slug)}`;
      console.log(`      ${t.slug} -> ${expected}`);
    });
  }
}

console.log(failed ? `\n${failed} check(s) failed.\n` : "\nT4 static checks passed.\n");
process.exit(failed ? 1 : 0);
