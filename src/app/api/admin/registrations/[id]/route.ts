import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import type { RegistrationPaymentStatus } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAYMENT_STATUSES: RegistrationPaymentStatus[] = [
  "pending",
  "paid",
  "partial",
  "waived",
  "refunded",
];

function isPaymentStatus(value: unknown): value is RegistrationPaymentStatus {
  return (
    typeof value === "string" &&
    (PAYMENT_STATUSES as string[]).includes(value)
  );
}

/**
 * PATCH /api/admin/registrations/[id]
 *
 * Whitelisted updatable fields:
 *  - payment_status: one of RegistrationPaymentStatus
 *  - team_id: uuid or null. When non-null, the team's tournament_id must match
 *    the registration's tournament_id (no cross-tournament rosters).
 *  - emergency_name / emergency_phone: filled in from the Roster when a
 *    player has none on file. Written to the person as well as this row —
 *    an emergency contact belongs to the human, not to one signup, and the
 *    quick-join path copies it from the person's record, so filling it here
 *    stops the same gap reappearing at the next event.
 *
 * Used by the admin Roster (paid toggle, team picker, emergency contact) and
 * by the Teams tab (assign / unassign a player).
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if ("payment_status" in body) {
    if (!isPaymentStatus(body.payment_status)) {
      return NextResponse.json(
        { error: "Invalid payment_status." },
        { status: 400 }
      );
    }
    patch.payment_status = body.payment_status;
  }

  let emergencyName: string | undefined;
  let emergencyPhone: string | undefined;
  if ("emergency_name" in body) {
    if (typeof body.emergency_name !== "string") {
      return NextResponse.json(
        { error: "Invalid emergency_name." },
        { status: 400 }
      );
    }
    emergencyName = body.emergency_name.trim().slice(0, 120);
    patch.emergency_name = emergencyName;
  }
  if ("emergency_phone" in body) {
    if (typeof body.emergency_phone !== "string") {
      return NextResponse.json(
        { error: "Invalid emergency_phone." },
        { status: 400 }
      );
    }
    emergencyPhone = body.emergency_phone.trim().slice(0, 40);
    patch.emergency_phone = emergencyPhone;
  }

  let teamIdToSet: string | null | undefined = undefined;
  if ("team_id" in body) {
    if (body.team_id === null) {
      teamIdToSet = null;
    } else if (typeof body.team_id === "string" && UUID_RE.test(body.team_id)) {
      teamIdToSet = body.team_id;
    } else {
      return NextResponse.json(
        { error: "Invalid team_id." },
        { status: 400 }
      );
    }
    patch.team_id = teamIdToSet;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No updatable fields supplied." },
      { status: 400 }
    );
  }

  if (typeof teamIdToSet === "string") {
    const { data: reg, error: regErr } = await supabaseAdmin
      .from("registrations")
      .select("tournament_id")
      .eq("id", id)
      .single();

    if (regErr || !reg) {
      const status = regErr?.code === "PGRST116" ? 404 : 500;
      return NextResponse.json(
        { error: regErr?.message ?? "Registration not found." },
        { status }
      );
    }

    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("tournament_id")
      .eq("id", teamIdToSet)
      .single();

    if (teamErr || !team) {
      return NextResponse.json(
        { error: "Team not found." },
        { status: 404 }
      );
    }

    if (team.tournament_id !== reg.tournament_id) {
      return NextResponse.json(
        { error: "Team belongs to a different tournament." },
        { status: 400 }
      );
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .update(patch)
      .eq("id", id)
      .select("id, payment_status, team_id, contact_id")
      .single();

    if (error || !data) {
      const status = error?.code === "PGRST116" ? 404 : 500;
      return NextResponse.json(
        { error: error?.message ?? "Update failed." },
        { status }
      );
    }

    /*
      Promote the emergency contact to the person. Best-effort: the row the
      owner is looking at is already correct, and a failure here only means
      the next signup asks again. Deliberately last so a contacts hiccup
      cannot fail a paid/team change.
    */
    if (data.contact_id && (emergencyName !== undefined || emergencyPhone !== undefined)) {
      const contactPatch: Record<string, string> = {};
      if (emergencyName !== undefined) contactPatch.emergency_name = emergencyName;
      if (emergencyPhone !== undefined) contactPatch.emergency_phone = emergencyPhone;
      const { error: contactErr } = await supabaseAdmin
        .from("contacts")
        .update(contactPatch)
        .eq("id", data.contact_id);
      if (contactErr) {
        console.warn(
          "[admin registrations] emergency contact promotion failed:",
          contactErr.message
        );
      }
    }

    return NextResponse.json({
      id: data.id,
      payment_status: data.payment_status,
      team_id: data.team_id,
    });
  } catch (err) {
    console.error("Admin registration PATCH error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/registrations/[id]
 *
 * Removes a person from the roster the same way a player cancel does: stamps
 * `cancelled_at` and keeps the row. This used to hard-delete — the only
 * writer in the system that destroyed registration history while everything
 * else (player cancel, the dedupe cleanup) records it, and one click away
 * from actions that don't. Reversible with a single UPDATE if the person is
 * re-added.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from("registrations")
      .select("notes")
      .eq("id", id)
      .maybeSingle();
    const note = "Removed from the roster by an admin.";
    const notes = existing?.notes?.trim()
      ? `${existing.notes.trim()}\n${note}`
      : note;

    const { error } = await supabaseAdmin
      .from("registrations")
      .update({ cancelled_at: new Date().toISOString(), notes })
      .eq("id", id)
      .is("cancelled_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Admin registration DELETE error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
