import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const tournamentId = url.searchParams.get("tournament_id");

  try {
    let query = supabaseAdmin
      .from("teams")
      .select(
        `id, tournament_id, name, captain_contact_id, color, notes, created_at,
         tournament:tournaments ( id, title ),
         captain:contacts!teams_captain_contact_id_fkey ( id, first_name, last_name, email ),
         members:team_members ( contact_id, role, contact:contacts ( id, first_name, last_name, email ) )`
      )
      .order("name", { ascending: true })
      .limit(500);

    if (tournamentId && UUID_RE.test(tournamentId)) {
      query = query.eq("tournament_id", tournamentId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Admin teams fetch error:", error);
      return NextResponse.json(
        { error: error.message ?? "Failed to load teams." },
        { status: 500 }
      );
    }

    return NextResponse.json({ teams: data ?? [] });
  } catch (err) {
    console.error("Admin teams error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const tournamentId =
      typeof body.tournament_id === "string" && UUID_RE.test(body.tournament_id)
        ? body.tournament_id
        : null;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const captainContactId =
      typeof body.captain_contact_id === "string" &&
      UUID_RE.test(body.captain_contact_id)
        ? body.captain_contact_id
        : null;
    const color = typeof body.color === "string" ? body.color : null;
    const notes = typeof body.notes === "string" ? body.notes : null;

    if (!tournamentId) {
      return NextResponse.json(
        { error: "tournament_id is required." },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { error: "name is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("teams")
      .insert({
        tournament_id: tournamentId,
        name,
        captain_contact_id: captainContactId,
        color,
        notes,
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Insert failed." },
        { status: 500 }
      );
    }

    if (captainContactId) {
      await supabaseAdmin
        .from("team_members")
        .upsert(
          {
            team_id: data.id,
            contact_id: captainContactId,
            role: "captain",
          },
          { onConflict: "team_id,contact_id" }
        );
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error("Admin teams POST error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
