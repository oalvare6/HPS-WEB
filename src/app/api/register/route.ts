import { NextResponse } from "next/server";
import { createPayResumeToken } from "@/lib/app-signing";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getWaiverExpiryIso,
  isContactWaiverValid,
  normalizeEmail,
  normalizePhone,
  upsertContactByEmail,
} from "@/lib/contacts";
import { linkRegistrationToContact } from "@/lib/registration-contact-linking";
import { acceptsRegistrations } from "@/lib/tournament-state";
import { resolveTeamIdForTournament } from "@/lib/tournaments";
import { buildPayResumeUrl, buildWaiverSignPath } from "@/lib/pay-resume-url";
import { isDocuSealConfigured } from "@/lib/waiver-capture";

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
    const tournamentSlug = resolvedTournament?.slug ?? null;
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
    try {
      await linkRegistrationToContact({
        registrationId: inserted.id,
        email: payload.email,
        phone: payload.phone,
      });
    } catch (linkErr) {
      console.warn("[register] post-insert contact link failed:", linkErr);
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `https://${request.headers.get("host")}`;

    let payToken: string;
    try {
      payToken = createPayResumeToken(inserted.id);
    } catch (e) {
      console.error("Pay resume token signing failed:", e);
      return NextResponse.json(
        { error: "Registration could not be completed (server signing misconfiguration)." },
        { status: 500 }
      );
    }

    const completedRedirectUrl = buildPayResumeUrl(baseUrl, {
      registrationId: inserted.id,
      payToken,
      tournamentSlug,
    });
    const canSkipWaiver = isContactWaiverValid(contact, waiverType);

    if (canSkipWaiver) {
      const canonicalSignedAt = contact.waiver_signed_at ?? new Date().toISOString();
      const canonicalExpiresAt =
        contact.waiver_expires_at ?? getWaiverExpiryIso(canonicalSignedAt);

      const { error: markSignedErr } = await supabaseAdmin
        .from("registrations")
        .update({
          waiver_signed: true,
          waiver_signed_at: canonicalSignedAt,
          waiver_document_url: contact.waiver_document_url,
          docuseal_status: "signed",
          docuseal_submission_id: contact.waiver_submission_id,
        })
        .eq("id", inserted.id);

      if (markSignedErr) {
        console.error("Registration waiver-skip update failed:", markSignedErr);
        return NextResponse.json(
          { error: "We couldn't finalize your registration right now. Please try again." },
          { status: 500 }
        );
      }

      const contactPatch: Record<string, unknown> = {};
      if (!contact.waiver_signed_at) {
        contactPatch.waiver_signed_at = canonicalSignedAt;
      }
      if (!contact.waiver_expires_at && canonicalExpiresAt) {
        contactPatch.waiver_expires_at = canonicalExpiresAt;
      }
      if (!contact.waiver_source) {
        contactPatch.waiver_source = "import";
      }
      if (!contact.waiver_type) {
        contactPatch.waiver_type = waiverType;
      }
      if (Object.keys(contactPatch).length > 0) {
        const { error: contactPatchErr } = await supabaseAdmin
          .from("contacts")
          .update(contactPatch)
          .eq("id", contact.id);
        if (contactPatchErr) {
          console.warn("Contact canonical waiver patch failed:", contactPatchErr.message);
        }
      }

      return NextResponse.json({
        success: true,
        signUrl: completedRedirectUrl,
        waiverSkipped: true,
        waiverSignedAt: canonicalSignedAt,
        tournamentTitle,
        // The confirmation screen offers card-or-cash, and declaring a method
        // needs the same signed token the pay link carries. Handed over
        // directly rather than parsed back out of `signUrl`.
        registrationId: inserted.id,
        payToken,
      });
    }

    // No DocuSeal configuration → sign in the app instead of dead-ending.
    // All four DOCUSEAL_* vars are empty locally (REBUILD-PLAN §A4) and the old
    // code posted to DocuSeal regardless, so every signup ended on "Registration
    // saved but waiver could not be created." A player who cannot sign cannot
    // play, so the fallback is the signing screen, not an error.
    if (!isDocuSealConfigured(waiverType)) {
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

      return NextResponse.json({
        success: true,
        signUrl: buildWaiverSignPath({
          registrationId: inserted.id,
          payToken,
          tournamentSlug,
        }),
        waiverMode: "in_app",
      });
    }

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
      return NextResponse.json(
        { error: "Registration saved but waiver could not be created. Please contact us." },
        { status: 500 }
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

    return NextResponse.json({
      success: true,
      signUrl: directSignUrl,
    });
  } catch (error) {
    console.error("Registration API error:", error);
    return NextResponse.json(
      { error: "Unexpected server error while saving registration." },
      { status: 500 }
    );
  }
}
