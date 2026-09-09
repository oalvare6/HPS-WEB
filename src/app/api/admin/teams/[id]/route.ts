import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    if (typeof body.name === "string") patch.name = body.name.trim();
    if ("captain_contact_id" in body) {
      patch.captain_contact_id =
        typeof body.captain_contact_id === "string" &&
        UUID_RE.test(body.captain_contact_id)
          ? body.captain_contact_id
          : null;
    }
    if ("color" in body) {
      patch.color = typeof body.color === "string" ? body.color : null;
    }
    if ("notes" in body) {
      patch.notes = typeof body.notes === "string" ? body.notes : null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No fields to update." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("teams")
      .update(patch)
      .eq("id", id)
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Update failed." },
        { status: 500 }
      );
    }
    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error("Admin team PATCH error:", err);
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
    // Both match FKs and the scorer FK are ON DELETE SET NULL, so deleting a
    // team mid-season would silently turn it into "TBD" in every fixture,
    // drop those results from the table for its opponents too, and orphan its
    // goals. Refuse, and say what is in the way.
    const { data: teamRow } = await supabaseAdmin
      .from("teams")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    const [{ count: matchCount }, { count: goalCount }] = await Promise.all([
      supabaseAdmin
        .from("matches")
        .select("id", { count: "exact", head: true })
        .or(`home_team_id.eq.${id},away_team_id.eq.${id}`),
      supabaseAdmin
        .from("match_scorers")
        .select("id", { count: "exact", head: true })
        .eq("team_id", id),
    ]);
    const inMatches = matchCount ?? 0;
    const inGoals = goalCount ?? 0;
    if (inMatches > 0 || inGoals > 0) {
      const name = teamRow?.name ?? "This team";
      const parts: string[] = [];
      if (inMatches > 0) parts.push(`${inMatches} ${inMatches === 1 ? "match" : "matches"}`);
      if (inGoals > 0) parts.push(`${inGoals} scorer ${inGoals === 1 ? "row" : "rows"}`);
      return NextResponse.json(
        {
          error: `${name} is in ${parts.join(" and ")}. Remove or reassign those on the Schedule tab first.`,
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.from("teams").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Admin team DELETE error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
