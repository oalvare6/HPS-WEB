import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeEmail, normalizePhone, upsertContactByEmail } from "@/lib/contacts";
import { linkRegistrationToContact } from "@/lib/registration-contact-linking";
import { acceptsRegistrations } from "@/lib/tournament-state";
import { resolveTeamIdForTournament } from "@/lib/tournaments";
import { isDocuSealConfigured } from "@/lib/waiver-capture";
import { getCurrentPlayer } from "@/lib/player-auth";
import { planRegistrationWaiver } from "@/lib/registration-waiver-plan";
import { syncRegistrationWaiverFromContact } from "@/lib/pay-eligibility";
import { issueRegistrationSession, type ResumeScope } from "@/lib/resume-access";
import { getResumeStore } from "@/lib/resume-store-supabase";
import { serializeResumeCookie } from "@/lib/resume-session";
import { RESUME_PAGE_PATH, RESUME_WAIVER_PAGE_PATH } from "@/lib/resume-routes";
import { resumeSignedRedirectUrl } from "@/lib/resume-ops-supabase";
import { siteBaseUrl } from "@/lib/resume-deps";
import type { WaiverReuseLinkage } from "@/lib/waiver-reuse";

export const dynamic = "force-dynamic";

type RegistrationType = "adult" | "youth";

interface RegistrationPayload {
  type: RegistrationType;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  emergencyName: string;
  emergencyPhone: string;
  /** Optional during the transition; required once admin UI exposes selector. */
  tournamentId?: string | null;
  /** Team chosen at signup (D3). Null means "Not sure yet". */
  teamId?: string | null;
}

const VALID_REGISTRATION_TYPES = new Set<RegistrationType>(["adult", "youth"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY!;
const DOCUSEAL_ADULT_TEMPLATE_ID = process.env.DOCUSEAL_ADULT_TEMPLATE_ID!;
const DOCUSEAL_YOUTH_TEMPLATE_ID = process.env.DOCUSEAL_YOUTH_TEMPLATE_ID!;

function getWaiverType(type: RegistrationType) {
  return type === "youth" ? "youth" : "adult";
}

function getTemplateId(waiverType: string) {
  return waiverType === "youth"
    ? Number(DOCUSEAL_YOUTH_TEMPLATE_ID)
    : Number(DOCUSEAL_ADULT_TEMPLATE_ID);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type ResolvedTournament = { id: string; title: string; slug: string } | null;

/**
 * Resolve the tournament to attach to this registration. We trust an explicit
 * id from the client when it is a real, registration-open tournament;
 * otherwise we fall back to the single open tournament if there is exactly
 * one. Returns the title alongside the id so the API can echo it back to
 * the client for the post-registration confirmation card.
 */
async function resolveTournament(
  requested: string | null | undefined
): Promise<ResolvedTournament> {
  if (requested && UUID_RE.test(requested)) {
    const { data } = await supabaseAdmin
      .from("tournaments")
      .select(
        "id, title, slug, registration_open, payments_open, is_draft, status, start_date, end_date"
      )
      .eq("id", requested)
      .maybeSingle();
    if (data?.id && data.slug && acceptsRegistrations(data)) {
      return { id: data.id, title: data.title, slug: data.slug };
    }
  }

  const { data: candidates } = await supabaseAdmin
    .from("tournaments")
    .select(
      "id, title, slug, registration_open, payments_open, is_draft, status, start_date, end_date"
    )
    .eq("registration_open", true);

  const openOnes = (candidates ?? []).filter((t) => acceptsRegistrations(t));

  if (openOnes.length === 1 && openOnes[0].slug) {
    return {
      id: openOnes[0].id,
      title: openOnes[0].title,
      slug: openOnes[0].slug,
    };
  }

  return null;
}

/**
 * POST /api/register — the one front door.
 *
 * ## What changed in Stage 1.3
 *
 * 1. **No email-only waiver inheritance.** The route used to mark the new row
 *    signed whenever the typed email matched a contact with a valid waiver —
 *    anyone who knew a returning player's address registered under their
 *    document. Reuse now goes through `planRegistrationWaiver`, which allows
 *    it only for a caller whose SUPABASE SESSION resolves to that same contact,
 *    and only for an adult waiver. Everyone else signs. Registration itself
 *    never fails because reuse was refused.
 *
 * 2. **No 90-day HMAC token.** The browser that has just created this row is
 *    handed a server-side session scoped to exactly this registration (the
 *    same `hps_resume` cookie a magic link produces), and every later step —
 *    DocuSeal's return, paying, declaring cash, cancelling — runs on
 *    `/pay/resume` against that session. The URL never carries a credential or
 *    an id.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RegistrationPayload>;

    const payload: RegistrationPayload = {
      type: body.type as RegistrationType,
      firstName: normalizeString(body.firstName),
      lastName: normalizeString(body.lastName),
      email: normalizeEmail(normalizeString(body.email)),
      phone: normalizeString(body.phone),
      dob: normalizeString(body.dob),
      emergencyName: normalizeString(body.emergencyName),
      emergencyPhone: normalizeString(body.emergencyPhone),
      tournamentId: typeof body.tournamentId === "string" ? body.tournamentId : null,
      teamId: typeof body.teamId === "string" ? body.teamId : null,
    };

    if (
      !VALID_REGISTRATION_TYPES.has(payload.type) ||
      !payload.firstName ||
      !payload.lastName ||
      !payload.email ||
      !payload.phone ||
      !payload.dob ||
      !payload.emergencyName ||
      !payload.emergencyPhone
    ) {
      return NextResponse.json(
        { error: "Please complete all required registration fields." },
        { status: 400 }
      );
    }

    const waiverType = getWaiverType(payload.type);

    const { contact, loadError: contactErr } = await upsertContactByEmail({
      first_name: payload.firstName,
      last_name: payload.lastName,
      email: payload.email,
      phone: normalizePhone(payload.phone),
      dob: payload.dob,
      tags: ["registered"],
    });

    if (contactErr || !contact) {
      console.error("Contact upsert failed during registration:", contactErr);
      return NextResponse.json(
        { error: "We couldn't save your registration right now. Please try again." },
        { status: 500 }
      );
    }

    const resolvedTournament = await resolveTournament(payload.tournamentId);
    const tournamentId = resolvedTournament?.id ?? null;
    const tournamentTitle = resolvedTournament?.title ?? null;
    const teamId = await resolveTeamIdForTournament(payload.teamId, tournamentId);

    const { data: inserted, error } = await supabaseAdmin
      .from("registrations")
      .insert({
        tournament_id: tournamentId,
        team_id: teamId,
        contact_id: contact.id,
        registration_type: payload.type,
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email,
        phone: payload.phone,
        dob: payload.dob,
        emergency_name: payload.emergencyName,
        emergency_phone: payload.emergencyPhone,
        waiver_type: waiverType,
        waiver_signed: false,
        payment_status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = `registrations_one_live_spot_idx`: this contact already holds a
      // live spot on this event. Almost always a double submit. "Please try
      // again" would be a lie — the insert can never succeed — so name it.
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error:
              "You're already signed up for this event. Check your email for the link, or open the event page to see where you stand.",
            reason: "already_registered",
          },
          { status: 409 }
        );
      }
      console.error("Supabase registration insert failed:", error);
      return NextResponse.json(
        { error: "We couldn't save your registration right now. Please try again." },
        { status: 500 }
      );
    }

    // Best-effort post-insert link. `upsertContactByEmail` above already set
    // contact_id to the email-canonical contact; this catches the case where a
    // different contact owns the same phone number and flags the registration
    // for admin review. Failure here must not break the registration flow.
    let rowContactId: string | null = contact.id;
    try {
      const link = await linkRegistrationToContact({
        registrationId: inserted.id,
        email: payload.email,
        phone: payload.phone,
      });
      if (link?.contactId) rowContactId = link.contactId;
    } catch (linkErr) {
      console.warn("[register] post-insert contact link failed:", linkErr);
    }

    /*
      Who is asking? A Supabase session whose contact is the one the form
      resolved to is the only identity that can reuse a waiver. A typed email
      — even one that matches a contact with a valid waiver — proves nothing
      (SEC-01, docs/waiver_identity_model.md). `getCurrentPlayer` is null for
      the ordinary anonymous signup.
    */
    let linkage: WaiverReuseLinkage = "anonymous_email";
    try {
      const player = await getCurrentPlayer();
      if (player && player.contact.id === contact.id) linkage = "authenticated_contact";
    } catch (authErr) {
      console.warn("[register] session lookup failed; treating as anonymous:", authErr);
    }

    const docusealConfigured = isDocuSealConfigured(waiverType);
    const plan = planRegistrationWaiver({
      contact,
      waiverType,
      linkage,
      registrationContactId: rowContactId,
      docusealConfigured,
    });

    let mode: "reuse" | "docuseal" | "in_app" = plan.mode;
    let waiverSignedAt: string | null = null;

    if (plan.mode === "reuse") {
      const sync = await syncRegistrationWaiverFromContact(
        { id: inserted.id, contact_id: rowContactId },
        contact,
        waiverType,
        linkage
      );
      if (sync.ok) {
        waiverSignedAt = plan.decision.signedAt;
      } else {
        // Refused or failed: the row exists and the waiver stays required.
        console.warn("[register] waiver reuse not applied:", sync.refusal ?? sync.message);
        mode = docusealConfigured ? "docuseal" : "in_app";
      }
    }

    // The browser that just created this row gets a session bound to it. The
    // scope list depends on the FINAL mode: `waiver:sign` only when the
    // typed-name fallback is what the player is about to use.
    const scopes: readonly ResumeScope[] =
      mode === "in_app"
        ? planRegistrationWaiver({ contact, waiverType, linkage: "anonymous_email", docusealConfigured: false }).scopes
        : plan.scopes.filter((s) => s !== "waiver:sign");

    let cookie: string | null = null;
    try {
      const issued = await issueRegistrationSession(getResumeStore(), {
        registrationId: inserted.id,
        scopes,
      });
      cookie = serializeResumeCookie(issued.sessionSecret, issued.maxAgeSeconds);
    } catch (sessionErr) {
      // The registration stands; the player can still get a magic link from
      // the pay page. Loud, because every self-service step depends on this.
      console.error("[register] could not issue the registration session:", sessionErr);
    }

    const respond = (payloadBody: Record<string, unknown>, status = 200) =>
      NextResponse.json(payloadBody, {
        status,
        headers: cookie
          ? { "Set-Cookie": cookie, "Cache-Control": "no-store" }
          : { "Cache-Control": "no-store" },
      });

    if (mode === "reuse") {
      return respond({
        success: true,
        waiverSkipped: true,
        waiverSignedAt,
        tournamentTitle,
        next: `${RESUME_PAGE_PATH}?registered=1`,
      });
    }

    // No DocuSeal configuration → sign in the app instead of dead-ending.
    // All four DOCUSEAL_* vars are empty locally (REBUILD-PLAN §A4) and the old
    // code posted to DocuSeal regardless, so every signup ended on "Registration
    // saved but waiver could not be created." A player who cannot sign cannot
    // play, so the fallback is the signing screen, not an error.
    if (mode === "in_app") {
      const { error: markPendingErr } = await supabaseAdmin
        .from("registrations")
        .update({ docuseal_status: "sent" })
        .eq("id", inserted.id);
      if (markPendingErr) {
        console.warn(
          "[register] could not flag in-app waiver as sent:",
          markPendingErr.message
        );
      }

      return respond({
        success: true,
        waiverMode: "in_app",
        next: RESUME_WAIVER_PAGE_PATH,
        tournamentTitle,
      });
    }

    const baseUrl = siteBaseUrl(request);
    const completedRedirectUrl = resumeSignedRedirectUrl(baseUrl);
    const templateId = getTemplateId(waiverType);

    const dsPayload = {
      template_id: templateId,
      send_email: false,
      completed_redirect_url: completedRedirectUrl,
      submitters: [
        {
          role: "First Party",
          email: payload.email,
          name: `${payload.firstName} ${payload.lastName}`,
          metadata: {
            registration_id: inserted.id,
            contact_id: contact.id,
            tournament_id: tournamentId ?? "",
          },
          completed_redirect_url: completedRedirectUrl,
        },
      ],
    };

    const dsResponse = await fetch("https://api.docuseal.com/submissions", {
      method: "POST",
      headers: {
        "X-Auth-Token": DOCUSEAL_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dsPayload),
    });

    if (!dsResponse.ok) {
      const dsErr = await dsResponse.text();
      console.error("DocuSeal submission creation failed:", dsErr);
      // The cookie still goes out: the player can open /pay/resume and press
      // "Sign my waiver", which creates the submission again.
      return respond(
        {
          error: "Registration saved but waiver could not be created. Please contact us.",
          next: RESUME_PAGE_PATH,
        },
        500
      );
    }

    const dsData = await dsResponse.json();

    const submitter = Array.isArray(dsData) ? dsData[0] : dsData.submitters?.[0];
    const submissionId = submitter?.submission_id ?? dsData.id;
    const slug = submitter?.slug ?? null;

    const directSignUrl = slug
      ? `https://docuseal.com/s/${slug}`
      : (submitter?.embed_src ?? null);

    const { error: updateErr } = await supabaseAdmin
      .from("registrations")
      .update({
        docuseal_submission_id: submissionId,
        docuseal_sign_url: directSignUrl,
        docuseal_status: "sent",
      })
      .eq("id", inserted.id);

    if (updateErr) {
      console.error("DocuSeal column update failed (run migration?):", updateErr.message);
    }

    return respond({
      success: true,
      waiverMode: "docuseal",
      signUrl: directSignUrl,
      tournamentTitle,
    });
  } catch (error) {
    console.error("Registration API error:", error);
    return NextResponse.json(
      { error: "Unexpected server error while saving registration." },
      { status: 500 }
    );
  }
}
