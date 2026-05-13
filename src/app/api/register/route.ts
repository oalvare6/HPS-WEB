import { NextResponse } from "next/server";
import { createPayResumeToken } from "@/lib/app-signing";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { upsertContactByEmail, normalizeEmail, normalizePhone } from "@/lib/contacts";

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

/**
 * Resolve the tournament_id to attach to this registration. We trust an
 * explicit id from the client when it is a real, registration-open tournament;
 * otherwise we fall back to the single open tournament if there is exactly one.
 */
async function resolveTournamentId(
  requested: string | null | undefined
): Promise<string | null> {
  if (requested && UUID_RE.test(requested)) {
    const { data } = await supabaseAdmin
      .from("tournaments")
      .select("id, registration_open")
      .eq("id", requested)
      .maybeSingle();
    if (data?.id && data.registration_open) {
      return data.id;
    }
  }

  const { data: openOnes } = await supabaseAdmin
    .from("tournaments")
    .select("id")
    .eq("registration_open", true)
    .limit(2);

  if (openOnes && openOnes.length === 1) {
    return openOnes[0].id;
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

    const tournamentId = await resolveTournamentId(payload.tournamentId);

    const { data: inserted, error } = await supabaseAdmin
      .from("registrations")
      .insert({
        tournament_id: tournamentId,
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

    const templateId = getTemplateId(waiverType);

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

    const payQuery = new URLSearchParams({
      registrationId: inserted.id,
      payToken,
    });
    const completedRedirectUrl = `${baseUrl}/pay?${payQuery.toString()}`;

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
