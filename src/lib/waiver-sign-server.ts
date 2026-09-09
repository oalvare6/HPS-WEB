/**
 * The in-app (typed-name) waiver signature, shared by the two routes that may
 * accept one:
 *
 *   /api/registrations/[id]/waiver-sign   — a signed-in player, for their own row
 *   /pay/resume/api/waiver-sign           — a registration-bound session that
 *                                           carries the `waiver:sign` scope,
 *                                           which is granted ONLY to the
 *                                           browser that just created the
 *                                           registration while DocuSeal is not
 *                                           configured (A7 fallback), and to
 *                                           the owner's laptop for in-person
 *                                           signing (D8).
 *
 * Authorisation is the CALLER's job. This validates the typed name, refuses a
 * second signature on an already-signed row, and writes through
 * `recordInAppSignature` — the producible record (`waiver_signatures`) first,
 * then the one waiver-state writer.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { recordInAppSignature } from "@/lib/waiver-capture";
import { WAIVER_TEXT_VERSION, namesLooselyMatch, type WaiverType } from "@/lib/waiver-text";

export type InAppSignatureRequest = {
  signedName: string;
  signerRelationship: string | null;
  ip: string | null;
  userAgent: string | null;
  /** Absolute site origin, so the stored document URL is a real link. */
  siteOrigin: string;
};

export type InAppSignatureResult = {
  status: number;
  body: Record<string, unknown>;
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Pull the two typed fields out of a parsed JSON body. */
export function parseInAppSignatureBody(body: Record<string, unknown>): {
  signedName: string;
  signerRelationship: string | null;
} {
  return {
    signedName: str(body.signedName),
    signerRelationship: str(body.signerRelationship) || null,
  };
}

/**
 * The `ip` column is `inet`, so a junk value fails the insert outright. Take the
 * first hop of `x-forwarded-for` and only keep it if it actually looks like an
 * address — provenance is nice to have, and never worth failing a signature for.
 */
export function clientIpForSignature(headers: Headers): string | null {
  const raw = headers.get("x-forwarded-for") ?? headers.get("x-real-ip");
  const first = raw?.split(",")[0]?.trim();
  if (!first) return null;
  const isIpv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(first);
  const isIpv6 = /^[0-9a-f:]+$/i.test(first) && first.includes(":");
  return isIpv4 || isIpv6 ? first : null;
}

export async function signWaiverInApp(
  registrationId: string,
  input: InAppSignatureRequest
): Promise<InAppSignatureResult> {
  const signedName = input.signedName.trim();
  if (signedName.length < 3 || !signedName.includes(" ")) {
    return { status: 400, body: { error: "Please type your full name — first and last." } };
  }

  const { data: registration, error: loadErr } = await supabaseAdmin
    .from("registrations")
    .select("id, contact_id, waiver_type, waiver_signed, waiver_document_url, first_name, last_name")
    .eq("id", registrationId)
    .maybeSingle();

  if (loadErr) {
    console.error("[waiver-sign] registration lookup failed:", loadErr.message);
    return { status: 500, body: { error: "We couldn't load your registration. Please try again." } };
  }
  if (!registration) {
    return { status: 404, body: { error: "Registration not found." } };
  }

  const waiverType: WaiverType = registration.waiver_type === "youth" ? "youth" : "adult";

  // Signing twice is a double-tap or a back-button, not an error. Return the
  // same answer rather than stacking a second signature row.
  if (registration.waiver_signed) {
    return {
      status: 200,
      body: { ok: true, alreadySigned: true, documentUrl: registration.waiver_document_url },
    };
  }

  // An adult signs for themselves, so the typed name has to be their own. A
  // youth waiver is signed by a parent or guardian whose name will differ from
  // the player's by design, so there is nothing to compare it against.
  if (waiverType === "adult") {
    const onFile = `${registration.first_name ?? ""} ${registration.last_name ?? ""}`.trim();
    if (onFile && !namesLooselyMatch(signedName, onFile)) {
      return {
        status: 400,
        body: {
          error: `This waiver is for ${onFile}. Type that name to sign it, or ask us to register you separately.`,
        },
      };
    }
  }

  const recorded = await recordInAppSignature({
    registrationId,
    contactId: registration.contact_id ?? null,
    waiverType,
    signedName,
    signerRelationship: input.signerRelationship,
    ip: input.ip,
    userAgent: input.userAgent,
    waiverVersion: WAIVER_TEXT_VERSION,
    siteOrigin: input.siteOrigin,
  });

  if (!recorded.ok) {
    return { status: 500, body: { error: recorded.error } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      signedAt: recorded.signedAt,
      expiresAt: recorded.expiresAt,
      documentUrl: recorded.documentUrl,
    },
  };
}

/** What the signing screen needs to render, for either authorisation path. */
export type WaiverSigningContext = {
  registrationId: string;
  /** Who the row belongs to; the signed-in page checks it against the session. */
  contactId: string | null;
  waiverType: WaiverType;
  playerName: string;
  eventTitle: string | null;
  eventSlug: string | null;
  alreadySigned: boolean;
};

export async function loadWaiverSigningContext(
  registrationId: string
): Promise<WaiverSigningContext | null> {
  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select(
      "id, contact_id, first_name, last_name, waiver_type, waiver_signed, tournaments!registrations_tournament_id_fkey(title, slug)"
    )
    .eq("id", registrationId)
    .maybeSingle();
  if (error) {
    console.error("[waiver-sign] context lookup failed:", error.message);
    return null;
  }
  if (!data) return null;

  const raw = data.tournaments as
    | { title?: string | null; slug?: string | null }
    | { title?: string | null; slug?: string | null }[]
    | null;
  const event = !raw ? null : Array.isArray(raw) ? (raw[0] ?? null) : raw;

  return {
    registrationId: data.id,
    contactId: data.contact_id ?? null,
    waiverType: data.waiver_type === "youth" ? "youth" : "adult",
    playerName: `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim(),
    eventTitle: event?.title ?? null,
    eventSlug: event?.slug ?? null,
    alreadySigned: data.waiver_signed === true,
  };
}
