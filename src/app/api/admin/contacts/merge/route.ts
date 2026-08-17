import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Statuses that mean real money (or a real comp) is behind the row. */
const SETTLED = new Set(["paid", "waived"]);

type LiveReg = {
  id: string;
  contact_id: string;
  tournament_id: string;
  payment_status: string;
};

/**
 * Merge two duplicate contacts: keep one person, absorb the other. Repoints
 * every dependent row from the duplicate to the kept contact, then deletes
 * the duplicate. Tags are unioned, notes concatenated, empty fields filled in.
 *
 * The one-live-spot index made the old version crash in EXACTLY the
 * duplicate-person case it exists for: when both copies held a live
 * registration for the same event, the blind repoint hit 23505 and the merge
 * died as a raw 500. Now those collisions are resolved first — the row
 * without money behind it is retired (cancelled + noted, never deleted) so
 * the repoint always succeeds.
 *
 * Body: { winner_id: string, loser_id: string }
 * (kept contact / absorbed contact — the UI says "Keep this one")
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
        { error: "Pick two different people to merge." },
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

    // ── Resolve one-live-spot collisions BEFORE repointing ──────────────
    // Wherever both copies hold a live registration for the same event, one
    // of the pair has to give up its spot or the repoint below hits the
    // unique index. Money decides which survives: a settled row always
    // outranks an unsettled one; on a tie the kept contact's row survives.
    const { data: liveRegsRaw } = await supabaseAdmin
      .from("registrations")
      .select("id, contact_id, tournament_id, payment_status")
      .in("contact_id", [winnerId, loserId])
      .is("cancelled_at", null)
      .not("tournament_id", "is", null);

    const liveRegs = (liveRegsRaw ?? []) as LiveReg[];
    const byTournament = new Map<string, LiveReg[]>();
    for (const reg of liveRegs) {
      const group = byTournament.get(reg.tournament_id) ?? [];
      group.push(reg);
      byTournament.set(reg.tournament_id, group);
    }

    for (const group of byTournament.values()) {
      const winnerRows = group.filter((r) => r.contact_id === winnerId);
      const loserRows = group.filter((r) => r.contact_id === loserId);
      if (winnerRows.length === 0 || loserRows.length === 0) continue;

      // Order each side settled-first so index 0 is the best row that side
      // holds; then keep the better of the two heads.
      const rank = (r: LiveReg) => (SETTLED.has(r.payment_status) ? 0 : 1);
      winnerRows.sort((a, b) => rank(a) - rank(b));
      loserRows.sort((a, b) => rank(a) - rank(b));
      const keepLosers =
        rank(loserRows[0]) < rank(winnerRows[0]); // loser's row has money, winner's doesn't
      const toRetire = keepLosers
        ? [winnerRows[0], ...loserRows.slice(1)]
        : [loserRows[0], ...winnerRows.slice(1)];

      for (const reg of toRetire) {
        const { error: retireErr } = await supabaseAdmin
          .from("registrations")
          .update({
            cancelled_at: new Date().toISOString(),
            notes: `Retired during contact merge ${new Date().toISOString().slice(0, 10)}: duplicate spot for the same person on this event.`,
          })
          .eq("id", reg.id)
          .is("cancelled_at", null);
        if (retireErr) {
          return NextResponse.json(
            { error: `Could not resolve a duplicate registration first: ${retireErr.message}` },
            { status: 500 }
          );
        }
      }
    }

    // ── Repoint every dependent row ─────────────────────────────────────
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
      // The old code forgot these: a merged-away person's signed waivers
      // must follow them, or the record of who signed what is orphaned.
      supabaseAdmin
        .from("waiver_signatures")
        .update({ contact_id: winnerId })
        .eq("contact_id", loserId),
      // team_members has held zero rows ever (B3 drops it); a plain repoint
      // keeps the merge safe if that ever changes.
      supabaseAdmin
        .from("team_members")
        .update({ contact_id: winnerId })
        .eq("contact_id", loserId),
    ];

    for (const r of repoints) {
      const { error } = await r;
      if (error) {
        console.error("[contacts merge] repoint failed:", error.message);
        return NextResponse.json(
          { error: `Merge could not finish: ${error.message}. Nothing was deleted.` },
          { status: 500 }
        );
      }
    }

    // ── Fold the duplicate's details into the kept contact ──────────────
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

    // Keep the best waiver evidence either copy holds: a real document beats
    // no document, and any waiver beats none. (This is how a typo-duplicate
    // that actually signed the waiver stops reading as "needs waiver" after
    // the merge.)
    const loserHasBetterWaiver =
      (loser.waiver_document_url && !winner.waiver_document_url) ||
      (loser.waiver_signed_at && !winner.waiver_signed_at);
    if (loserHasBetterWaiver) {
      winnerPatch.waiver_type = loser.waiver_type;
      winnerPatch.waiver_signed_at = loser.waiver_signed_at;
      winnerPatch.waiver_expires_at = loser.waiver_expires_at;
      winnerPatch.waiver_document_url = loser.waiver_document_url;
      winnerPatch.waiver_submission_id = loser.waiver_submission_id;
      winnerPatch.waiver_source = loser.waiver_source;
    }

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
        { error: `The duplicate could not be removed: ${deleteErr.message}` },
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
