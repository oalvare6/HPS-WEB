import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeEmail } from "@/lib/contacts";
import { verifyPayResumeToken } from "@/lib/app-signing";
import { isWorldCupTournamentSlug } from "@/lib/world-cup-pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CAPTAIN_PAID_NOTE =
  "World Cup: player confirmed captain already paid the $960 team fee. Admin: verify and mark paid.";

function mergeNotes(existing: string | null, line: string): string {
  if (!existing?.trim()) return line;
  if (existing.includes(line)) return existing;
  return `${existing.trim()}\n${line}`;
}

type CaptainPaidAckBody = {
  email?: string;
  registrationId?: string;
  payToken?: string;
  teamName?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CaptainPaidAckBody;
    const email = normalizeEmail(body.email ?? "");
    const registrationId = body.registrationId ?? "";
    const payToken = body.payToken ?? "";
    const teamName =
      typeof body.teamName === "string" ? body.teamName.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }
    if (!UUID_RE.test(registrationId)) {
      return NextResponse.json({ error: "Invalid registration id." }, { status: 400 });
    }
    if (!verifyPayResumeToken(registrationId, payToken)) {
      return NextResponse.json(
        {
          error:
            "Invalid or expired payment link. Open the pay link from your waiver confirmation.",
        },
        { status: 403 }
      );
    }

    const { data: registration, error: regErr } = await supabaseAdmin
      .from("registrations")
      .select(
        "id, email, payment_status, notes, team_name, tournament:tournaments!registrations_tournament_id_fkey ( slug )"
      )
      .eq("id", registrationId)
      .maybeSingle();

    if (regErr || !registration) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    const registrationEmail = normalizeEmail(registration.email ?? "");
    if (registrationEmail !== email) {
      return NextResponse.json(
        { error: "Email does not match this registration." },
        { status: 403 }
      );
    }

    if (registration.payment_status === "paid") {
      return NextResponse.json(
        { error: "This registration is already marked paid." },
        { status: 400 }
      );
    }

    const tournament = Array.isArray(registration.tournament)
      ? registration.tournament[0]
      : registration.tournament;
    const slug =
      tournament && typeof tournament === "object" && "slug" in tournament
        ? String(tournament.slug)
        : null;

    if (!isWorldCupTournamentSlug(slug)) {
      return NextResponse.json(
        { error: "Captain-paid confirmation is only available for World Cup registrations." },
        { status: 400 }
      );
    }

    const update: {
      notes: string;
      needs_admin_review: boolean;
      team_name?: string;
    } = {
      notes: mergeNotes(registration.notes, CAPTAIN_PAID_NOTE),
      needs_admin_review: true,
    };

    if (teamName) {
      update.team_name = teamName;
    }

    const { error: updateErr } = await supabaseAdmin
      .from("registrations")
      .update(update)
      .eq("id", registrationId);

    if (updateErr) {
      console.error("[captain-paid-ack] update failed:", updateErr.message);
      return NextResponse.json(
        { error: "Could not save your confirmation. Please try again." },
        { status: 500 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get("host")}`;
    const redirectUrl = `${baseUrl}/pay/success?captain_ack=1`;

    return NextResponse.json({ ok: true, redirectUrl });
  } catch (err) {
    console.error("[captain-paid-ack] error:", err);
    return NextResponse.json(
      { error: "Could not save your confirmation. Please try again." },
      { status: 500 }
    );
  }
}
