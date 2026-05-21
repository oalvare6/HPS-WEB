/**
 * Live POST /api/register tests. Run with dev server up:
 *   npx tsx --env-file=.env.local scripts/test-register-phase5.ts
 */
import { supabaseAdmin } from "../src/lib/supabase-admin";

const BASE = process.env.PHASE5_TEST_BASE_URL ?? "http://localhost:3000";

async function getOpenTournamentId(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .eq("registration_open", true)
    .limit(1)
    .maybeSingle();
  if (!data?.id) throw new Error("no open tournament");
  return data.id;
}

async function register(body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success?: boolean; error?: string };
  return { status: res.status, json };
}

async function main() {
  const tournamentId = await getOpenTournamentId();
  const stamp = Date.now();

  console.log("[1] clean path...");
  const cleanEmail = `phase5-clean-${stamp}@hps-verify.local`;
  const cleanPhone = `555${String(stamp).slice(-7)}`;
  const clean = await register({
    type: "adult",
    firstName: "Phase5",
    lastName: "Clean",
    email: cleanEmail,
    phone: cleanPhone,
    dob: "1990-01-15",
    emergencyName: "EC",
    emergencyPhone: "5550000002",
    tournamentId,
  });
  if (!clean.json.success) {
    throw new Error(`clean failed: ${clean.status} ${clean.json.error}`);
  }

  const { data: cleanReg, error: cleanSelErr } = await supabaseAdmin
    .from("registrations")
    .select("id, contact_id, needs_admin_review")
    .eq("email", cleanEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cleanSelErr?.message?.includes("needs_admin_review")) {
    const { data: fallback } = await supabaseAdmin
      .from("registrations")
      .select("id, contact_id")
      .eq("email", cleanEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!fallback?.contact_id) throw new Error("clean reg missing contact_id");
    console.log(`[ok] clean: reg ${fallback.id}, contact_id set (migration not applied)`);
  } else {
    if (!cleanReg?.contact_id) throw new Error("clean reg missing contact_id");
    console.log(
      `[ok] clean: reg ${cleanReg.id}, contact_id=${cleanReg.contact_id}, review=${cleanReg.needs_admin_review}`
    );
  }

  console.log("[2] phone collision path...");
  const collisionPhone = "5559990001";
  const oldEmail = `phase5-old-${stamp}@hps-verify.local`;
  const newEmail = `phase5-new-${stamp}@hps-verify.local`;

  await supabaseAdmin.from("contacts").insert({
    first_name: "Old",
    last_name: "Phone",
    email: oldEmail,
    phone: collisionPhone,
    tags: ["phase5-verify"],
  });

  const collision = await register({
    type: "adult",
    firstName: "Phase5",
    lastName: "Collision",
    email: newEmail,
    phone: collisionPhone,
    dob: "1990-01-15",
    emergencyName: "EC",
    emergencyPhone: "5550000003",
    tournamentId,
  });
  if (!collision.json.success) {
    throw new Error(`collision failed: ${collision.status} ${collision.json.error}`);
  }

  const { data: newContact } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("email", newEmail)
    .maybeSingle();

  const { data: collisionReg, error: colSelErr } = await supabaseAdmin
    .from("registrations")
    .select("id, contact_id, needs_admin_review")
    .eq("email", newEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (colSelErr?.message?.includes("needs_admin_review")) {
    const { data: fallback } = await supabaseAdmin
      .from("registrations")
      .select("id, contact_id")
      .eq("email", newEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback?.contact_id !== newContact?.id) {
      throw new Error(
        `collision contact_id mismatch: expected ${newContact?.id}, got ${fallback?.contact_id}`
      );
    }
    console.log(
      `[partial] collision: reg linked to email contact ${fallback?.contact_id}; needs_admin_review column not applied yet`
    );
  } else {
    if (collisionReg?.contact_id !== newContact?.id) {
      throw new Error("collision should link to new email contact");
    }
    if (collisionReg.needs_admin_review !== true) {
      throw new Error("collision should flag needs_admin_review=true");
    }
    console.log(
      `[ok] collision: reg ${collisionReg.id}, review=${collisionReg.needs_admin_review}`
    );
  }

  console.log("Register API tests done.");
}

main().catch((e) => {
  console.error("[fail]", e instanceof Error ? e.message : e);
  process.exit(1);
});
