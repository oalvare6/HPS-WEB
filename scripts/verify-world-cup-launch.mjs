/**
 * WC-7 pre-flight: static wiring + optional live DB checks.
 *
 * Run: node --env-file=.env.local scripts/verify-world-cup-launch.mjs
 *
 * Exits 0 when all checks pass, 1 otherwise.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const WORLD_CUP_SLUG = "world-cup-summer-tournament";
const SPRING_SLUG = "spring-classic-2026";
const WORLD_CUP_ID = "a9deb6a8-c7bc-4193-b710-6e5202a3b56c";

const REQUIRED_FILES = [
  "public/tournaments/world-cup-2026-flyer.png",
  "src/lib/world-cup-pricing.ts",
  "src/components/shared/TournamentBannerImage.tsx",
  "src/lib/tournament-image.ts",
  "src/app/auth/callback/route.ts",
  "src/components/pay/PayForm.tsx",
  "src/app/api/stripe/checkout/route.ts",
  "src/app/api/register/captain-paid-ack/route.ts",
  "src/components/admin/RegistrationsList.tsx",
  "docs/WORLD-CUP-ACCEPTANCE.md",
  "scripts/update-world-cup-tournament.mjs",
  "scripts/complete-spring-classic.mjs",
];

let failed = 0;

function pass(msg) {
  console.log(`  OK  ${msg}`);
}

function fail(msg) {
  console.error(` FAIL ${msg}`);
  failed += 1;
}

function section(title) {
  console.log(`\n${title}`);
}

section("Static files");
for (const rel of REQUIRED_FILES) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) pass(rel);
  else fail(`missing ${rel}`);
}

section("world-cup-pricing.ts constants");
const pricingPath = path.join(root, "src/lib/world-cup-pricing.ts");
const pricingSrc = fs.readFileSync(pricingPath, "utf8");
if (pricingSrc.includes(`"${WORLD_CUP_SLUG}"`)) pass("WORLD_CUP_TOURNAMENT_SLUG");
else fail("WORLD_CUP_TOURNAMENT_SLUG");
if (pricingSrc.includes("96_000")) pass("WORLD_CUP_TEAM_FEE_CENTS = 96000");
else fail("WORLD_CUP_TEAM_FEE_CENTS");

section("Auth callback binds cookies to redirect");
const callbackPath = path.join(root, "src/app/auth/callback/route.ts");
const callbackSrc = fs.readFileSync(callbackPath, "utf8");
if (
  callbackSrc.includes("createSupabaseRouteHandlerClient") &&
  callbackSrc.includes("NextResponse.redirect")
) {
  pass("route handler client + redirect response");
} else {
  fail("auth/callback may not attach session cookies to redirect");
}

section("Admin registrations API includes team_name");
const regApiPath = path.join(root, "src/app/api/admin/registrations/route.ts");
const regApiSrc = fs.readFileSync(regApiPath, "utf8");
if (regApiSrc.includes("team_name")) pass("team_name in SELECT");
else fail("team_name missing from admin registrations GET");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log("\nDB checks skipped (set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
} else {
  const supabase = createClient(url, key);

  section("World Cup tournament row");
  const { data: wc, error: wcErr } = await supabase
    .from("tournaments")
    .select(
      "id, slug, title, status, start_date, drop_in_fee_cents, entry_fee_cents, image_url, registration_open, payments_open, is_featured"
    )
    .eq("slug", WORLD_CUP_SLUG)
    .maybeSingle();

  if (wcErr) fail(`World Cup lookup: ${wcErr.message}`);
  else if (!wc) fail(`no tournament slug ${WORLD_CUP_SLUG}`);
  else {
    pass(`found ${wc.title}`);
    if (wc.id === WORLD_CUP_ID) pass("id matches expected UUID");
    else fail(`id is ${wc.id}, expected ${WORLD_CUP_ID}`);
    if (wc.drop_in_fee_cents === 0) pass("drop_in_fee_cents = 0");
    else fail(`drop_in_fee_cents = ${wc.drop_in_fee_cents} (want 0)`);
    if (wc.entry_fee_cents == null) pass("entry_fee_cents null (custom team pricing)");
    else fail(`entry_fee_cents = ${wc.entry_fee_cents} (should stay null)`);
    if (wc.registration_open && wc.payments_open) pass("registration + payments open");
    else fail("registration_open or payments_open is false");
    if (wc.image_url?.includes("world-cup-2026-flyer")) pass("image_url points at flyer");
    else fail(`image_url: ${wc.image_url ?? "(null)"}`);
    if (String(wc.start_date).startsWith("2026-06-08")) pass("start_date Jun 8 2026");
    else fail(`start_date: ${wc.start_date}`);
  }

  section("Spring Classic completed");
  const { data: sc, error: scErr } = await supabase
    .from("tournaments")
    .select("slug, status, registration_open, payments_open, is_featured")
    .eq("slug", SPRING_SLUG)
    .maybeSingle();

  if (scErr) fail(`Spring Classic lookup: ${scErr.message}`);
  else if (!sc) fail(`no tournament slug ${SPRING_SLUG}`);
  else {
    if (sc.status === "completed") pass("status completed");
    else fail(`status = ${sc.status} (run scripts/complete-spring-classic.mjs)`);
    if (!sc.registration_open && !sc.payments_open && !sc.is_featured) {
      pass("registration/payments/featured closed");
    } else {
      fail(
        `registration_open=${sc.registration_open} payments_open=${sc.payments_open} is_featured=${sc.is_featured}`
      );
    }
  }
}

console.log(failed === 0 ? "\nAll checks passed.\n" : `\n${failed} check(s) failed.\n`);
process.exit(failed === 0 ? 0 : 1);
