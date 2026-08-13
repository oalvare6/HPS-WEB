import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import {
  createInPersonSubmission,
  fetchSubmissionSnapshot,
  isDocuSealConfigured,
  recordSignedWaiver,
  templateIdFor,
} from "@/lib/waiver-capture";
import { createPayResumeToken } from "@/lib/app-signing";
import { buildWaiverSignPath } from "@/lib/pay-resume-url";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadRegistration(id: string) {
  return supabaseAdmin
    .from("registrations")
    .select(
      "id, contact_id, waiver_type, waiver_signed, waiver_signed_at, waiver_document_url, docuseal_submission_id, docuseal_status, first_name, last_name, email"
    )
    .eq("id", id)
    .maybeSingle();
}

/**
 * POST /api/admin/registrations/[id]/sign-waiver
 *
 * "Sign waiver now" from a Roster row (A4 / D8). Creates a DocuSeal submission
 * with `send_email: false` and hands back a URL the owner opens on the laptop
 * for the player standing in front of them.
 *
 * This is deliberately not the same thing as the admin waiver override: an
 * override is a ticked box, this produces a real signed document. 39 of 57
 * contact waivers in production are overrides, which is why the Roster marks
 * them and offers this instead.
 *
 * Body: { waiverType?: 'adult' | 'youth' }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  let waiverType: "adult" | "youth" | null = null;
  try {
    const body = (await req.json()) as { waiverType?: unknown };
    if (body.waiverType === "adult" || body.waiverType === "youth") {
      waiverType = body.waiverType;
    }
  } catch {
    // Body is optional; fall back to the registration's own type.
  }

  const { data: registration, error: regErr } = await loadRegistration(id);
  if (regErr) {
    return NextResponse.json({ error: regErr.message }, { status: 500 });
  }
  if (!registration) {
    return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  }

  const type =
    waiverType ?? (registration.waiver_type === "youth" ? "youth" : "adult");

  // No DocuSeal → hand back the in-app signing screen instead of a 503. This is
  // the walk-in path (D8): the owner has a player standing in front of them at
  // the field, and "DocuSeal is not configured on this server" is not something
  // that person can do anything with. Same screen the player would get online.
  if (!isDocuSealConfigured(type)) {
    let payToken: string;
    try {
      payToken = createPayResumeToken(registration.id);
    } catch (e) {
      console.error("[sign-waiver] pay token signing failed:", e);
      return NextResponse.json(
        { error: "Server signing is misconfigured; cannot open a waiver." },
        { status: 500 }
      );
    }

    if (registration.waiver_type !== type) {
      await supabaseAdmin
        .from("registrations")
        .update({ waiver_type: type })
        .eq("id", registration.id);
    }

    const signUrl = buildWaiverSignPath({
      registrationId: registration.id,
      payToken,
    });

    return NextResponse.json({
      submissionId: null,
      signUrl,
      embedSrc: signUrl,
      waiverType: type,
      mode: "in_app",
    });
  }

  const apiKey = process.env.DOCUSEAL_API_KEY!;
  const templateId = templateIdFor(type);
  if (!templateId) {
    return NextResponse.json(
      { error: `No DocuSeal template configured for ${type} waivers.` },
      { status: 503 }
    );
  }

  const name =
    [registration.first_name, registration.last_name].filter(Boolean).join(" ") ||
    "Player";

  const created = await createInPersonSubmission({
    apiKey,
    templateId,
    email: registration.email,
    name,
    metadata: {
      registration_id: registration.id,
      contact_id: registration.contact_id ?? "",
      in_person: "true",
    },
  });

  if (!created.submissionId || !created.signUrl) {
    return NextResponse.json(
      { error: "DocuSeal would not create a signing session." },
      { status: 502 }
    );
  }

  // Record the new submission immediately so a page refresh mid-signing does
  // not orphan it, and so the status check below knows what to poll.
  const { error: linkErr } = await supabaseAdmin
    .from("registrations")
    .update({
      docuseal_submission_id: created.submissionId,
      docuseal_sign_url: created.signUrl,
      docuseal_status: "sent",
      waiver_type: type,
    })
    .eq("id", registration.id);

  if (linkErr) {
    console.error("[sign-waiver] could not link submission:", linkErr.message);
    return NextResponse.json(
      { error: "Created the waiver but could not attach it to this player." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    submissionId: created.submissionId,
    signUrl: created.signUrl,
    embedSrc: created.embedSrc,
    waiverType: type,
  });
}

/**
 * GET /api/admin/registrations/[id]/sign-waiver
 *
 * Ask DocuSeal directly whether this person has finished signing, and write it
 * down if they have.
 *
 * Deliberately not reliant on the webhook. The webhook is the right mechanism
 * for someone signing at home an hour later, but at the field the owner needs
 * the ✓ to appear *now*, and a webhook that is misconfigured, delayed, or
 * blocked would leave them staring at a red ✗ next to a player who just signed.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const { data: registration, error: regErr } = await loadRegistration(id);
  if (regErr) {
    return NextResponse.json({ error: regErr.message }, { status: 500 });
  }
  if (!registration) {
    return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  }

  // In-app signature: it is already written down locally, so "Done — check"
  // just reads our own row. Nothing to ask DocuSeal about.
  if (registration.waiver_signed) {
    return NextResponse.json({
      signed: true,
      signedAt: registration.waiver_signed_at,
      expiresAt: null,
      documentUrl: registration.waiver_document_url,
    });
  }

  const apiKey = process.env.DOCUSEAL_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ signed: false, reason: "not-finished" });
  }

  if (!registration.docuseal_submission_id) {
    return NextResponse.json({ signed: false, reason: "no-submission" });
  }

  const snapshot = await fetchSubmissionSnapshot(
    registration.docuseal_submission_id,
    apiKey
  );
  if (!snapshot) {
    return NextResponse.json(
      { error: "Could not reach DocuSeal." },
      { status: 502 }
    );
  }
  if (!snapshot.completed) {
    return NextResponse.json({ signed: false, reason: "not-finished" });
  }

  const result = await recordSignedWaiver({
    registrationId: registration.id,
    contactId: registration.contact_id,
    waiverType: registration.waiver_type,
    submissionId: registration.docuseal_submission_id,
    completedAt: snapshot.completedAt,
    documentUrl: snapshot.documentUrl,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    signed: true,
    signedAt: result.signedAt,
    expiresAt: result.expiresAt,
    documentUrl: result.documentUrl,
  });
}
