import { NextResponse } from "next/server";
import { createPayResumeToken } from "@/lib/app-signing";
import { getCurrentPlayer } from "@/lib/player-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { enrollContactInTournament } from "@/lib/pay-eligibility";
import { resolveTeamIdForTournament } from "@/lib/tournaments";
import { acceptsRegistrations } from "@/lib/tournament-state";
import { buildPayResumePath } from "@/lib/pay-resume-url";
import { isContactWaiverValid } from "@/lib/contacts";
import { defaultWaiverTypeFor } from "@/lib/signup-state";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/register/join
 *
 * The one-tap path for a signed-in player whose waiver is still valid (D5):
 * pick a team, join the roster, go to pay. No form, no second waiver.
 *
 * Identity comes from the Supabase session, never from the request body — the
 * body carries only the event and the team choice, so this cannot be used to
 * enroll somebody else.
 */
export async function POST(request: Request) {
  try {
    const player = await getCurrentPlayer();
    if (!player) {
      return NextResponse.json(
        { error: "Please sign in again and retry." },
        { status: 401 }
      );
    }

    const body = (await request.json()) as {
      tournamentId?: unknown;
      teamId?: unknown;
    };
    const tournamentId = typeof body.tournamentId === "string" ? body.tournamentId : "";
    const requestedTeamId = typeof body.teamId === "string" ? body.teamId : null;

    if (!UUID_RE.test(tournamentId)) {
      return NextResponse.json({ error: "Pick an event to join." }, { status: 400 });
    }

    const { data: tournament, error: tErr } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, title, slug, registration_open, payments_open, is_draft, status, start_date, end_date"
      )
      .eq("id", tournamentId)
      .maybeSingle();

    if (tErr) {
      console.error("[register/join] tournament lookup failed:", tErr.message);
      return NextResponse.json(
        { error: "We couldn't load that event. Please try again." },
        { status: 500 }
      );
    }
    if (!tournament?.id) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    if (!acceptsRegistrations(tournament)) {
      return NextResponse.json(
        { error: "This event is not taking sign-ups right now." },
        { status: 400 }
      );
    }

    const contact = player.contact;
    const waiverType = defaultWaiverTypeFor(contact);

    // The quick path is only quick because the waiver already exists. If it has
    // lapsed, say so plainly rather than enrolling someone with no waiver — the
    // screen sends them to the full signup, which collects a new signature.
    if (!isContactWaiverValid(contact, waiverType)) {
      return NextResponse.json(
        { error: "Your waiver needs signing again. Continue with the full sign-up." },
        { status: 409 }
      );
    }

    // Already on this roster? Hand back the same pay link instead of creating a
    // duplicate row. A double-tap on a phone at the field is not a new player.
    const { data: existing } = await supabaseAdmin
      .from("registrations")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const teamId = await resolveTeamIdForTournament(requestedTeamId, tournamentId);

    let registrationId: string;

    if (existing?.id) {
      registrationId = existing.id;
      if (teamId) {
        const { error: teamErr } = await supabaseAdmin
          .from("registrations")
          .update({ team_id: teamId })
          .eq("id", registrationId);
        if (teamErr) {
          console.warn("[register/join] team update failed:", teamErr.message);
        }
      }
    } else {
      const enrolled = await enrollContactInTournament({
        contact,
        tournamentId,
        waiverType,
        teamId,
      });

      if (!enrolled.ok) {
        return NextResponse.json(
          {
            error:
              enrolled.reason === "missing_waiver"
                ? "Your waiver needs signing again. Continue with the full sign-up."
                : "We couldn't add you to this roster. Please try again.",
          },
          { status: enrolled.reason === "missing_waiver" ? 409 : 500 }
        );
      }
      registrationId = enrolled.registrationId;
    }

    let payToken: string;
    try {
      payToken = createPayResumeToken(registrationId);
    } catch (e) {
      console.error("[register/join] pay token signing failed:", e);
      return NextResponse.json(
        { error: "Payment could not be prepared (server signing misconfiguration)." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      registrationId,
      payUrl: buildPayResumePath({
        registrationId,
        payToken,
        tournamentSlug: tournament.slug,
      }),
    });
  } catch (error) {
    console.error("[register/join] unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected server error. Please try again." },
      { status: 500 }
    );
  }
}
