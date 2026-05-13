import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { normalizeEmail, normalizePhone } from "@/lib/contacts";
import { MAX_CONTACT_NOTES_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const { data: contact, error } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !contact) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    const [registrationsRes, dropInsRes, paymentsRes, teamMembersRes] =
      await Promise.all([
        supabaseAdmin
          .from("registrations")
          .select(
            "id, created_at, tournament_id, registration_type, payment_status, docuseal_status"
          )
          .eq("contact_id", id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("drop_ins")
          .select(
            "id, created_at, tournament_id, round_id, amount_cents, payment_status"
          )
          .eq("contact_id", id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("payments")
          .select(
            "id, created_at, amount, currency, status, tournament_id, tournament_name, drop_in_id"
          )
          .eq("contact_id", id)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("team_members")
          .select("team_id, role, joined_at, teams ( id, name, tournament_id )")
          .eq("contact_id", id),
      ]);

    return NextResponse.json({
      contact,
      registrations: registrationsRes.data ?? [],
      drop_ins: dropInsRes.data ?? [],
      payments: paymentsRes.data ?? [],
      team_members: teamMembersRes.data ?? [],
    });
  } catch (err) {
    console.error("Admin contact detail error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};

    if (typeof body.first_name === "string") {
      patch.first_name = body.first_name.trim();
    }
    if (typeof body.last_name === "string") {
      patch.last_name = body.last_name.trim();
    }
    if (typeof body.email === "string") {
      const e = normalizeEmail(body.email);
      if (!e) {
        return NextResponse.json({ error: "Email cannot be empty." }, { status: 400 });
      }
      patch.email = e;
    }
    if ("phone" in body) {
      patch.phone =
        typeof body.phone === "string" ? normalizePhone(body.phone) : null;
    }
    if ("dob" in body) {
      patch.dob = typeof body.dob === "string" && body.dob ? body.dob : null;
    }
    if ("notes" in body) {
      patch.notes =
        typeof body.notes === "string"
          ? body.notes.slice(0, MAX_CONTACT_NOTES_LENGTH)
          : null;
    }
    if (Array.isArray(body.tags)) {
      patch.tags = body.tags.filter((t): t is string => typeof t === "string");
    }
    if (typeof body.marketing_opt_in === "boolean") {
      patch.marketing_opt_in = body.marketing_opt_in;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("contacts")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Admin contact PATCH error:", error);
      return NextResponse.json(
        { error: error?.message ?? "Failed to update contact." },
        { status: 500 }
      );
    }

    return NextResponse.json({ contact: data });
  } catch (err) {
    console.error("Admin contact PATCH error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  try {
    const [{ count: regCount }, { count: dropCount }] = await Promise.all([
      supabaseAdmin
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("contact_id", id),
      supabaseAdmin
        .from("drop_ins")
        .select("*", { count: "exact", head: true })
        .eq("contact_id", id),
    ]);

    if ((regCount ?? 0) + (dropCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Contact has linked registrations or drop-ins. Merge with another contact instead.",
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.from("contacts").delete().eq("id", id);

    if (error) {
      console.error("Admin contact DELETE error:", error);
      return NextResponse.json(
        { error: error.message ?? "Failed to delete contact." },
        { status: 500 }
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Admin contact DELETE error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
