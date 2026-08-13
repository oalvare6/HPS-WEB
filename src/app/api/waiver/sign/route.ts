import { NextResponse } from "next/server";
import { verifyPayResumeToken } from "@/lib/app-signing";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordInAppSignature } from "@/lib/waiver-capture";
import { buildPayResumeUrl } from "@/lib/pay-resume-url";
import {
  WAIVER_TEXT_VERSION,
  namesLooselyMatch,
  type WaiverType,
} from "@/lib/waiver-text";

/**
 * Accept an in-app waiver signature.
 *
 * Authorization is the pay-resume token that `/api/register` already mints for
 * this registration: it is HMAC-signed, scoped to one registration id, and
 * expires. Reusing it means the waiver link a player receives is exactly as
 * hard to forge as the payment link they receive next, with no second token
 * scheme to keep in sync.
 */

type SignPayload = {
  registrationId?: string;
  payToken?: string;
  signedName?: string;
  signerRelationship?: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * The `ip` column is `inet`, so a junk value fails the insert outright. Take the
 * first hop of `x-forwarded-for` and only keep it if it actually looks like an
 * address — provenance is nice to have, and never worth failing a signature for.
 */
function clientIp(request: Request): string | null {
  const raw = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  const first = raw?.split(",")[0]?.trim();
  if (!first) return null;
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(first);
  const isIpv6 = /^[0-9a-f:]+$/i.test(first) && first.includes(":");
  return isIpv4 || isIpv6 ? first : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignPayload;
    const registrationId = str(body.registrationId);
    const payToken = str(body.payToken);
    const signedName = str(body.signedName);
    const signerRelationship = str(body.signerRelationship) || null;

    if (!registrationId || !verifyPayResumeToken(registrationId, payToken)) {
      return NextResponse.json(
        { error: "This waiver link is no longer valid. Please start again from the event page." },
        { status: 403 }
      );
    }

    if (signedName.length < 3 || !signedName.includes(" ")) {
      return NextResponse.json(
        { error: "Please type your full name — first and last." },
        { status: 400 }
      );
    }

    const { data: registration, error: loadErr } = await supabaseAdmin
      .from("registrations")
      .select(
        "id, contact_id, waiver_type, waiver_signed, waiver_document_url, first_name, last_name, tournament_id"
      )
      .eq("id", registrationId)
      .maybeSingle();

    if (loadErr) {
      console.error("[waiver/sign] registration lookup failed:", loadErr.message);
      return NextResponse.json(
        { error: "We couldn't load your registration. Please try again." },
        { status: 500 }
      );
    }

    if (!registration) {
      return NextResponse.json({ error: "Registration not found." }, { status: 404 });
    }

    const waiverType: WaiverType = registration.waiver_type === "youth" ? "youth" : "adult";

    const { data: tournament } = registration.tournament_id
      ? await supabaseAdmin
          .from("tournaments")
          .select("slug")
          .eq("id", registration.tournament_id)
          .maybeSingle()
      : { data: null };

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || `https://${request.headers.get("host")}`;

    const payUrl = buildPayResumeUrl(baseUrl, {
      registrationId,
      payToken,
      tournamentSlug: tournament?.slug ?? null,
    });

    // Signing twice is a double-tap or a back-button, not an error. Return the
    // same answer rather than stacking a second signature row on the same
    // registration.
    if (registration.waiver_signed) {
      return NextResponse.json({
        ok: true,
        alreadySigned: true,
        documentUrl: registration.waiver_document_url,
        payUrl,
      });
    }

    // An adult signs for themselves, so the typed name has to be their own. A
    // youth waiver is signed by a parent or guardian whose name will differ from
    // the player's by design, so there is nothing to compare it against.
    if (waiverType === "adult") {
      const onFile = `${registration.first_name ?? ""} ${registration.last_name ?? ""}`.trim();
      if (onFile && !namesLooselyMatch(signedName, onFile)) {
        return NextResponse.json(
          {
            error: `This waiver is for ${onFile}. Type that name to sign it, or ask us to register you separately.`,
          },
          { status: 400 }
        );
      }
    }

    const recorded = await recordInAppSignature({
      registrationId,
      contactId: registration.contact_id ?? null,
      waiverType,
      signedName,
      signerRelationship,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      waiverVersion: WAIVER_TEXT_VERSION,
      siteOrigin: baseUrl,
    });

    if (!recorded.ok) {
      return NextResponse.json({ error: recorded.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      signedAt: recorded.signedAt,
      expiresAt: recorded.expiresAt,
      documentUrl: recorded.documentUrl,
      payUrl,
    });
  } catch (error) {
    console.error("[waiver/sign] unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected server error while recording your signature." },
      { status: 500 }
    );
  }
}
