import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Merge two duplicate contacts. Repoints every dependent row from the loser
 * to the winner, then deletes the loser. Tags are unioned, marketing_opt_in
 * stays true if either was true, notes are concatenated.
 *
 * Body: { winner_id: string, loser_id: string }
 */
export async function POST(req: NextRequest) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as {
      winner_id?: string;
      loser_id?: string;
    };

    const winnerId = body.winner_id;
    const loserId = body.loser_id;

    if (!winnerId || !loserId || !UUID_RE.test(winnerId) || !UUID_RE.test(loserId)) {
      return NextResponse.json(
        { error: "winner_id and loser_id must both be valid UUIDs." },
        { status: 400 }
      );
    }
    if (winnerId === loserId) {
      return NextResponse.json(
        { error: "winner and loser must differ." },
        { status: 400 }
      );
    }

    const { data: winner } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", winnerId)
      .maybeSingle();
    const { data: loser } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", loserId)
      .maybeSingle();

    if (!winner || !loser) {
      return NextResponse.json(
        { error: "One or both contacts not found." },
        { status: 404 }
      );
    }

    // Repoint dependent rows. Order matters only insofar as we don't break
    // before deleting the loser.
    const repoints = [
      supabaseAdmin
        .from("registrations")
        .update({ contact_id: winnerId })
        .eq("contact_id", loserId),
      supabaseAdmin
        .from("drop_ins")
        .update({ contact_id: winnerId })
        .eq("contact_id", loserId),
      supabaseAdmin
        .from("drop_ins")
        .update({ paid_by_contact_id: winnerId })
        .eq("paid_by_contact_id", loserId),
      supabaseAdmin
        .from("payments")
        .update({ contact_id: winnerId })
        .eq("contact_id", loserId),
      supabaseAdmin
        .from("teams")
        .update({ captain_contact_id: winnerId })
        .eq("captain_contact_id", loserId),
    ];

    for (const r of repoints) {
      const { error } = await r;
      if (error) {
        console.error("[contacts merge] repoint failed:", error.message);
        return NextResponse.json(
          { error: `Repoint failed: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // team_members: handle the (team_id, contact_id) primary key conflict.
    // Move loser's memberships to winner only when no equivalent row exists.
    const { data: loserMemberships } = await supabaseAdmin
      .from("team_members")
      .select("team_id, role, notes, joined_at")
      .eq("contact_id", loserId);

    if (loserMemberships?.length) {
      for (const tm of loserMemberships) {
        const { data: existing } = await supabaseAdmin
          .from("team_members")
          .select("team_id")
          .eq("team_id", tm.team_id)
          .eq("contact_id", winnerId)
          .maybeSingle();

        if (existing) {
          await supabaseAdmin
            .from("team_members")
            .delete()
            .eq("team_id", tm.team_id)
            .eq("contact_id", loserId);
        } else {
          await supabaseAdmin
            .from("team_members")
            .update({ contact_id: winnerId })
            .eq("team_id", tm.team_id)
            .eq("contact_id", loserId);
        }
      }
    }

    const mergedTags = Array.from(
      new Set<string>([...(winner.tags ?? []), ...(loser.tags ?? []), "merged"])
    );
    const mergedNotes = [winner.notes, loser.notes].filter(Boolean).join("\n---\n");

    const winnerPatch: Record<string, unknown> = {
      tags: mergedTags,
      notes: mergedNotes || null,
      marketing_opt_in: winner.marketing_opt_in || loser.marketing_opt_in,
    };
    if (!winner.phone && loser.phone) winnerPatch.phone = loser.phone;
    if (!winner.dob && loser.dob) winnerPatch.dob = loser.dob;
    if (!winner.first_name && loser.first_name) winnerPatch.first_name = loser.first_name;
    if (!winner.last_name && loser.last_name) winnerPatch.last_name = loser.last_name;

    const { error: patchErr } = await supabaseAdmin
      .from("contacts")
      .update(winnerPatch)
      .eq("id", winnerId);
    if (patchErr) {
      console.error("[contacts merge] winner patch failed:", patchErr.message);
    }

    const { error: deleteErr } = await supabaseAdmin
      .from("contacts")
      .delete()
      .eq("id", loserId);

    if (deleteErr) {
      return NextResponse.json(
        { error: `Failed to delete loser: ${deleteErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ merged: true, winner_id: winnerId });
  } catch (err) {
    console.error("[contacts merge] error:", err);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}
