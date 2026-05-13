import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { TEAM_MEMBER_ROLES, type TeamMemberRole } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ROLE = new Set<TeamMemberRole>(TEAM_MEMBER_ROLES);

export async function POST(req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id: teamId } = await params;
  if (!UUID_RE.test(teamId)) {
    return NextResponse.json({ error: "Invalid team id." }, { status: 400 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const contactId =
      typeof body.contact_id === "string" && UUID_RE.test(body.contact_id)
        ? body.contact_id
        : null;
    const role =
      typeof body.role === "string" && VALID_ROLE.has(body.role as TeamMemberRole)
        ? (body.role as TeamMemberRole)
        : "player";

    if (!contactId) {
      return NextResponse.json(
        { error: "contact_id is required." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("team_members").upsert(
      {
        team_id: teamId,
        contact_id: contactId,
        role,
      },
      { onConflict: "team_id,contact_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ added: true });
  } catch (err) {
    console.error("Add team member error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id: teamId } = await params;
  if (!UUID_RE.test(teamId)) {
    return NextResponse.json({ error: "Invalid team id." }, { status: 400 });
  }

  const url = new URL(req.url);
  const contactId = url.searchParams.get("contact_id");
  if (!contactId || !UUID_RE.test(contactId)) {
    return NextResponse.json(
      { error: "contact_id query param required." },
      { status: 400 }
    );
  }

  try {
    const { error } = await supabaseAdmin
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("contact_id", contactId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ removed: true });
  } catch (err) {
    console.error("Remove team member error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
