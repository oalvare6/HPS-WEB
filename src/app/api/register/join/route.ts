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
import { isPaymentMethodChoice } from "@/lib/payment-method";
import { isOpenPlay } from "@/lib/event-kind";
import { loadOpenPlayEntitlement } from "@/lib/open-play-attendance";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/register/join
 *
 * The confirmed path for a signed-in player whose waiver is still valid (D5):
 * pick a team, say how you're paying, join the roster. No form, no second
 * waiver.
 *
 * Identity comes from the Supabase session, never from the request body — the
 * body carries only the event, the team choice and the payment method, so this
 * cannot be used to enroll somebody else.
 *
 * ## Why the payment method arrives here
 *
 * It used to be a second request. `QuickJoinCard` called this route, then called
 * `/api/register/payment-intent`, and swallowed any failure from the second one
 * — so a player who said "cash at the field" could land on the roster with
 * `payment_method` NULL and the owner would never learn to expect cash from
 * them. Writing it in the same insert removes the half-failed state entirely.
 *
 * It remains only a declaration. `payment_status` is `'pending'` either way; a
 * cash promise is not a payment.
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
      paymentMethod?: unknown;
    };
    const tournamentId = typeof body.tournamentId === "string" ? body.tournamentId : "";
    const requestedTeamId = typeof body.teamId === "string" ? body.teamId : null;
    // Anything unrecognised becomes NULL rather than a guess — NULL means "they
    // have not told us", which is the truth when we could not read the answer.
    const paymentMethod = isPaymentMethodChoice(body.paymentMethod)
      ? body.paymentMethod
      : null;

    if (!UUID_RE.test(tournamentId)) {
      return NextResponse.json({ error: "Pick an event to join." }, { status: 400 });
    }

    const { data: tournament, error: tErr } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, title, slug, registration_open, payments_open, is_draft, status, start_date, end_date, kind, entry_fee_cents, drop_in_fee_cents, free_entry_tournament_ids"
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

    // Already on this roster? Hand back the same pay link instead of creating a
    // duplicate row. A double-tap on a phone at the field is not a new player.
    //
    // This lookup runs BEFORE the waiver check on purpose. The waiver gate
    // guards *enrolment* — it must not fire for someone already on the roster,
    // who now reaches this route just to fill in the team they never picked. A
    // player whose registration is signed but whose contact-level waiver has
    // lapsed sits in exactly that state, and refusing them a team would be
    // refusing the wrong thing.
    const { data: existing } = await supabaseAdmin
      .from("registrations")
      .select("id, team_id")
      .eq("tournament_id", tournamentId)
      .eq("contact_id", contact.id)
      // Cancelled rows are not "already on this roster". Without this filter a
      // player who dropped out could never sign back up: the old row would be
      // found as `existing`, the insert would be skipped, and they would be
      // handed a pay link for a spot they no longer hold.
      .is("cancelled_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // The quick path is only quick because the waiver already exists. If it has
    // lapsed, say so plainly rather than enrolling someone with no waiver — the
    // screen sends them to the full signup, which collects a new signature.
    if (!existing?.id && !isContactWaiverValid(contact, waiverType)) {
      return NextResponse.json(
        { error: "Your waiver needs signing again. Continue with the full sign-up." },
        { status: 409 }
      );
    }

    const teamId = await resolveTeamIdForTournament(requestedTeamId, tournamentId);

    let registrationId: string;
    let settledFree = false;

    if (existing?.id) {
      registrationId = existing.id;
      const currentTeamId = existing.team_id ?? null;

      /*
        A team you already have is not yours to change from here.

        The picker on the signup screen fills in a blank — most of the roster
        has `team_id = NULL` and that is the hole it exists to close. Moving
        between teams is a different act: the owner balances the sides, and a
        player switching themselves the night before unbalances them silently.
        `SavedTeamPicker` locks once a team is set, so the only requests that
        reach this line with a different team are stale tabs and hand-rolled
        calls — both of which should be told the truth rather than quietly
        rewriting a roster.

        Admins are unaffected; they move players through /api/admin/*.
      */
      if (currentTeamId && currentTeamId !== teamId) {
        return NextResponse.json(
          {
            error:
              "You're already on a team for this event. Ask us at the field or on WhatsApp and we'll move you.",
            reason: "team_locked",
          },
          { status: 409 }
        );
      }

      // Only ever a first assignment now, so nothing to write when they had a
      // team already (the request agreed with it) or when they still haven't
      // chosen one.
      //
      // `payment_method` is deliberately NOT written here. This branch is the
      // team picker on an existing signup, and the picker sends no method — so
      // writing one would blank the choice of anyone setting their team. A
      // player already on the roster changes how they pay through
      // `PaymentChoice` → `/api/register/payment-intent`.
      if (!currentTeamId && teamId) {
        const { error: teamErr } = await supabaseAdmin
          .from("registrations")
          .update({ team_id: teamId })
          .eq("id", registrationId);
        if (teamErr) {
          console.error("[register/join] team update failed:", teamErr.message);
          return NextResponse.json(
            { error: "We couldn't save your team. Please try again." },
            { status: 500 }
          );
        }
      }
    } else {
      /*
        D7: does this person walk into tonight free?

        Evaluated here, from the database, and never from the request body — the
        rule is readable in the shipped bundle, so a client-supplied "I'm free"
        flag would be forgeable free entry.

        `waiver_required` is not handled as a branch because it cannot be
        reached: the block above already turned away anyone without a valid
        contact-level waiver with the "continue with the full sign-up" 409. The
        entitlement check re-derives it anyway rather than assuming, so the two
        gates can never drift apart.
      */
      let freeEntry: { viaTournamentId: string } | null = null;
      if (isOpenPlay(tournament)) {
        const entitlement = await loadOpenPlayEntitlement({
          contact,
          event: tournament,
          waiverType,
        });
        if (entitlement.kind === "free") {
          freeEntry = { viaTournamentId: entitlement.viaTournamentId };
          settledFree = true;
        }
      }

      const enrolled = await enrollContactInTournament({
        contact,
        tournamentId,
        waiverType,
        teamId,
        paymentMethod,
        freeEntry,
      });

      if (!enrolled.ok) {
        /*
          `already_registered` is the unique index catching a race the existing-
          row lookup above cannot: two taps close enough together that both read
          "no registration" before either wrote one. Reloading is the right
          instruction because the screen resolves state server-side and will
          land them on the "you're on the roster" card — telling them to "try
          again" would send them at an insert that can now never succeed.
        */
        const message =
          enrolled.reason === "missing_waiver"
            ? "Your waiver needs signing again. Continue with the full sign-up."
            : enrolled.reason === "already_registered"
              ? "You're already signed up for this one. Refresh the page to see where you stand."
              : "We couldn't add you to this roster. Please try again.";
        return NextResponse.json(
          { error: message, reason: enrolled.reason },
          {
            status:
              enrolled.reason === "missing_waiver" ||
              enrolled.reason === "already_registered"
                ? 409
                : 500,
          }
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
      /*
        D7: they are in, and they owe nothing.

        The client must not send them to checkout on the strength of having
        picked "card" — there is no session to send them to, and Stripe would
        reject the amount anyway. `payUrl` is still returned so the shape of
        this response never changes; it is simply not the right place to go.
      */
      settledFree,
      // Returned alongside the URL so the caller can also declare a payment
      // method (`/api/register/payment-intent`) without having to pick the
      // token back out of a query string it just received.
      payToken,
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
