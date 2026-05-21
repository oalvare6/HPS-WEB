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
 *
 * Used by the admin Registrations list's "Mark as Paid" row action and by the
 * Phase 3 Teams tab on the tournament view (assign / unassign a registrant).
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
      .select("id, payment_status, team_id")
      .single();

    if (error || !data) {
      const status = error?.code === "PGRST116" ? 404 : 500;
      return NextResponse.json(
        { error: error?.message ?? "Update failed." },
        { status }
      );
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
 * Hard-deletes the registration row. The associated contact and any linked
 * payment rows remain so we keep an audit trail. Used by the admin
 * Registrations list's "Unregister" row action.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const { error } = await supabaseAdmin
      .from("registrations")
      .delete()
      .eq("id", id);

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
