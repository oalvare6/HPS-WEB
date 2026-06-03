/**
 * One-shot: mark Spring Classic 2026 completed and stop promoting it for
 * registration, payments, and homepage featured carousel.
 *
 * The event stays on /events and /events/spring-classic-2026 with a
 * "Completed" status — it is not removed from public listings.
 *
 * Run: node --env-file=.env.local scripts/complete-spring-classic.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const SLUG = "spring-classic-2026";

const patch = {
  status: "completed",
  registration_open: false,
  payments_open: false,
  is_featured: false,
};

const { data: existing, error: findErr } = await supabase
  .from("tournaments")
  .select("id, slug, title, status, registration_open, payments_open, is_featured")
  .eq("slug", SLUG)
  .maybeSingle();

if (findErr) {
  console.error("Lookup failed:", findErr.message);
  process.exit(1);
}
if (!existing) {
  console.error(`No tournament with slug "${SLUG}". Create it in admin or fix the slug.`);
  process.exit(1);
}

console.log("Before:");
console.log(JSON.stringify(existing, null, 2));

const { data: updated, error: updateErr } = await supabase
  .from("tournaments")
  .update(patch)
  .eq("id", existing.id)
  .select(
    "id, title, slug, status, registration_open, payments_open, is_featured, display_order"
  )
  .single();

if (updateErr) {
  console.error("Update failed:", updateErr.message);
  process.exit(1);
}

console.log("\nUpdated Spring Classic:");
console.log(JSON.stringify(updated, null, 2));
