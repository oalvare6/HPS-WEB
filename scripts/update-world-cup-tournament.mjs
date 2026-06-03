/**
 * One-shot: sync World Cup tournament row with the 2026 flyer details.
 * Run: node --env-file=.env.local scripts/update-world-cup-tournament.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const SLUG = "world-cup-summer-tournament";
const FLYER_PATH = "/tournaments/world-cup-2026-flyer.png";

const DESCRIPTION = `Compete. Unite. Win.

$960 per team · Max 12 players per roster
Ages: High school boys - adults

Group A — 8 teams, Monday / Wednesday
Group B — 8 teams, Tuesday / Thursday
Game times: 6:00 PM, 7:00 PM, 8:00 PM, 9:00 PM

Group stage: June 8 – July 2
Playoffs: July 6 – July 14
Final match: Thursday, July 17

Assemble your team. Bring your best. Chase the championship.`;

const patch = {
  title: "World Cup 7v7 Soccer Tournament",
  description: DESCRIPTION,
  format: "High School Boys - Adults",
  status: "upcoming",
  start_date: "2026-06-08T00:00:00.000Z",
  end_date: "2026-07-17T00:00:00.000Z",
  time_start: "6:00 PM",
  time_end: "9:00 PM",
  recurrence: "Group A: Mon/Wed · Group B: Tue/Thu",
  location: "14062 Ambrose St, Houston TX",
  max_teams: 16,
  registration_open: true,
  payments_open: true,
  is_featured: true,
  display_order: 0,
  image_url: FLYER_PATH,
  image_preset: null,
  // Guest drop-in tier off until team payment flow ships.
  drop_in_fee_cents: 0,
  // Do NOT set entry_fee yet — current /pay charges per registration, not per team.
  entry_fee: null,
  entry_fee_cents: null,
};

const { data: existing, error: findErr } = await supabase
  .from("tournaments")
  .select("id, slug, title")
  .eq("slug", SLUG)
  .maybeSingle();

if (findErr) {
  console.error("Lookup failed:", findErr.message);
  process.exit(1);
}
if (!existing) {
  console.error(`No tournament with slug "${SLUG}". Create it in admin first or fix the slug.`);
  process.exit(1);
}

const { data: updated, error: updateErr } = await supabase
  .from("tournaments")
  .update(patch)
  .eq("id", existing.id)
  .select("id, title, slug, image_url, max_teams, drop_in_fee_cents")
  .single();

if (updateErr) {
  console.error("Update failed:", updateErr.message);
  process.exit(1);
}

console.log("Updated World Cup tournament:");
console.log(JSON.stringify(updated, null, 2));
