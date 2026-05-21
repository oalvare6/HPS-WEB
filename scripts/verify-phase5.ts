/**
 * One-off Phase 5 verification. Not part of production tooling.
 * Run: npx tsx --env-file=.env.local scripts/verify-phase5.ts
 */
import { supabaseAdmin } from "../src/lib/supabase-admin";
import {
  findContactCandidates,
  resolveContactLink,
} from "../src/lib/registration-contact-linking";
import { normalizeEmail, normalizePhone } from "../src/lib/contacts";

const TEST_EMAIL = `phase5-test-${Date.now()}@hps-verify.local`;
const TEST_PHONE = `555${String(Date.now()).slice(-7)}`;
const COLLISION_PHONE = "5559990001";

async function assertColumnExists(): Promise<void> {
  const { error } = await supabaseAdmin
    .from("registrations")
    .select("id, needs_admin_review")
    .limit(1);
  if (error) {
    throw new Error(
      `needs_admin_review column missing or inaccessible: ${error.message}`
    );
  }
  console.log("[ok] needs_admin_review column is queryable");
}

async function getOpenTournamentId(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .eq("registration_open", true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function cleanup(ids: {
  registrationIds: string[];
  contactIds: string[];
}): Promise<void> {
  for (const id of ids.registrationIds) {
    await supabaseAdmin.from("registrations").delete().eq("id", id);
  }
  for (const id of ids.contactIds) {
    await supabaseAdmin.from("contacts").delete().eq("id", id);
  }
}

async function testLinkingHelpers(): Promise<void> {
  const email = normalizeEmail(TEST_EMAIL);
  const phone = normalizePhone(TEST_PHONE);
  const { data: inserted, error } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: "Phase5",
      last_name: "Verify",
      email,
      phone,
      tags: ["phase5-verify"],
    })
    .select("id")
    .single();
  if (error || !inserted) {
    throw new Error(`fixture contact insert failed: ${error?.message}`);
  }

  try {
    const candidates = await findContactCandidates({ email, phone });
    const resolution = resolveContactLink(candidates);
    if (resolution.contactId !== inserted.id) {
      throw new Error(
        `expected contact ${inserted.id}, got ${resolution.contactId}`
      );
    }
    if (resolution.confidence !== "high") {
      throw new Error(`expected high confidence, got ${resolution.confidence}`);
    }
    if (resolution.needsAdminReview) {
      throw new Error("single match should not need admin review");
    }
    console.log("[ok] findContactCandidates + resolveContactLink (single match)");
  } finally {
    await supabaseAdmin.from("contacts").delete().eq("id", inserted.id);
  }
}

async function testAmbiguousResolution(): Promise<void> {
  const emailA = normalizeEmail(`phase5-a-${Date.now()}@hps-verify.local`);
  const emailB = normalizeEmail(`phase5-b-${Date.now()}@hps-verify.local`);
  const sharedPhone = COLLISION_PHONE;

  const { data: c1 } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: "Old",
      last_name: "PhoneOwner",
      email: emailA,
      phone: sharedPhone,
      tags: ["phase5-verify"],
    })
    .select("id")
    .single();

  const { data: c2 } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: "New",
      last_name: "EmailOwner",
      email: emailB,
      phone: null,
      tags: ["phase5-verify"],
    })
    .select("id")
    .single();

  if (!c1?.id || !c2?.id) {
    throw new Error("ambiguous fixture contacts failed to insert");
  }

  try {
    const candidates = await findContactCandidates({
      email: emailB,
      phone: sharedPhone,
    });
    const resolution = resolveContactLink(candidates);
    if (!resolution.needsAdminReview) {
      throw new Error("expected needsAdminReview true for 2 contacts");
    }
    if (resolution.confidence !== "low") {
      throw new Error(`expected low confidence, got ${resolution.confidence}`);
    }
    if (resolution.contactId !== c2.id) {
      throw new Error(
        `email match should win (contact ${c2.id}), got ${resolution.contactId}`
      );
    }
    console.log("[ok] ambiguous match prefers email contact + low confidence");
  } finally {
    await supabaseAdmin.from("contacts").delete().in("id", [c1.id, c2.id]);
  }
}

async function testRegisterApi(baseUrl: string, tournamentId: string): Promise<void> {
  const stamp = Date.now();
  const cleanEmail = `phase5-clean-${stamp}@hps-verify.local`;
  const cleanPhone = `555${String(stamp).slice(-7)}`;

  const cleanRes = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "adult",
      firstName: "Phase5",
      lastName: "Clean",
      email: cleanEmail,
      phone: cleanPhone,
      dob: "1990-01-15",
      emergencyName: "EC",
      emergencyPhone: "5550000002",
      tournamentId,
    }),
  });
  const cleanJson = (await cleanRes.json()) as {
    success?: boolean;
    error?: string;
    signUrl?: string;
  };
  if (!cleanRes.ok || !cleanJson.success) {
    throw new Error(
      `clean register failed (${cleanRes.status}): ${cleanJson.error ?? "unknown"}`
    );
  }

  const { data: cleanReg } = await supabaseAdmin
    .from("registrations")
    .select("id, contact_id, needs_admin_review")
    .eq("email", cleanEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cleanReg?.contact_id) {
    throw new Error("clean registration missing contact_id");
  }
  if (cleanReg.needs_admin_review === true) {
    throw new Error("clean registration should not need admin review");
  }
  console.log(`[ok] POST /api/register clean path (reg ${cleanReg.id})`);

  const collisionPhone = "5559990001";
  const oldEmail = `phase5-old-${stamp}@hps-verify.local`;
  const newEmail = `phase5-new-${stamp}@hps-verify.local`;

  const { data: oldContact } = await supabaseAdmin
    .from("contacts")
    .insert({
      first_name: "Old",
      last_name: "Phone",
      email: oldEmail,
      phone: collisionPhone,
      tags: ["phase5-verify"],
    })
    .select("id")
    .single();

  const collisionRes = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "adult",
      firstName: "Phase5",
      lastName: "Collision",
      email: newEmail,
      phone: collisionPhone,
      dob: "1990-01-15",
      emergencyName: "EC",
      emergencyPhone: "5550000003",
      tournamentId,
    }),
  });
  const collisionJson = (await collisionRes.json()) as {
    success?: boolean;
    error?: string;
  };
  if (!collisionRes.ok || !collisionJson.success) {
    throw new Error(
      `collision register failed (${collisionRes.status}): ${collisionJson.error ?? "unknown"}`
    );
  }

  const { data: collisionReg } = await supabaseAdmin
    .from("registrations")
    .select("id, contact_id, needs_admin_review")
    .eq("email", newEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: newContact } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("email", newEmail)
    .maybeSingle();

  if (!collisionReg?.contact_id || !newContact?.id) {
    throw new Error("collision registration or new contact missing");
  }
  if (collisionReg.contact_id !== newContact.id) {
    throw new Error(
      `collision should link to email contact ${newContact.id}, got ${collisionReg.contact_id}`
    );
  }
  if (collisionReg.needs_admin_review !== true) {
    throw new Error(
      "collision registration should have needs_admin_review=true (migration applied?)"
    );
  }
  console.log(
    `[ok] POST /api/register phone-collision path (reg ${collisionReg.id}, review flagged)`
  );

  const ids = [cleanReg.id, collisionReg.id, cleanReg.contact_id, newContact.id];
  if (oldContact?.id) ids.push(oldContact.id);
  await cleanup({
    registrationIds: [cleanReg.id, collisionReg.id],
    contactIds: [
      cleanReg.contact_id,
      newContact.id,
      ...(oldContact?.id ? [oldContact.id] : []),
    ],
  });
}

async function main() {
  console.log("Phase 5 verification starting...");
  let migrationApplied = true;
  try {
    await assertColumnExists();
    console.log("[ok] migration applied");
  } catch (err) {
    migrationApplied = false;
    console.log(
      `[warn] ${err instanceof Error ? err.message : err}`
    );
    console.log(
      "[warn] Apply supabase/migrations/20260521170000_add_registration_needs_admin_review.sql in Supabase SQL editor, then re-run."
    );
  }

  await testLinkingHelpers();
  await testAmbiguousResolution();

  const tournamentId = await getOpenTournamentId();
  const baseUrl = process.env.PHASE5_TEST_BASE_URL ?? "http://localhost:3000";

  if (!tournamentId) {
    console.log("[skip] no open tournament — POST /api/register skipped");
  } else {
    let serverUp = false;
    try {
      const ping = await fetch(`${baseUrl}/api/register`, { method: "GET" });
      serverUp = ping.status !== undefined;
    } catch {
      serverUp = false;
    }
    if (!serverUp) {
      console.log(
        `[skip] dev server not reachable at ${baseUrl} — start with npm run dev and re-run with PHASE5_TEST_BASE_URL`
      );
    } else if (!migrationApplied) {
      console.log(
        "[skip] POST /api/register collision test needs migration (needs_admin_review column)"
      );
    } else {
      await testRegisterApi(baseUrl, tournamentId);
    }
  }

  console.log("Phase 5 verification finished.");
}

main().catch((err) => {
  console.error("[fail]", err instanceof Error ? err.message : err);
  process.exit(1);
});
