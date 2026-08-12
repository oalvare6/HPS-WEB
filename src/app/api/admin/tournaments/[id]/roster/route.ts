import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { normalizePhone } from "@/lib/contacts";
import {
  isWaiverDateValid,
  totalsFromRows,
  walkInEmailForPhone,
  isPlaceholderEmail,
  WALK_IN_PLACEHOLDER,
  type RosterPayload,
  type RosterRow,
  type RosterTeam,
  type WaiverEvidence,
} from "@/lib/admin-roster";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Statuses that mean "this person does not owe us money". */
const SETTLED = new Set(["paid", "waived"]);

type ContactJoin = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  waiver_signed_at: string | null;
  waiver_expires_at: string | null;
  waiver_document_url: string | null;
  waiver_source: string | null;
} | null;

/**
 * PostgREST types an embedded one-to-one join as an array. Collapse it so the
 * row code can just read `contact?.field`.
 */
function firstOf(value: unknown): ContactJoin {
  if (Array.isArray(value)) return (value[0] ?? null) as ContactJoin;
  return (value ?? null) as ContactJoin;
}

/**
 * How solid this person's waiver is.
 *
 * The distinction matters: production has 39 of 57 contact waivers recorded as
 * `admin_override` — a ticked box with no signature behind it. A roster that
 * shows those as a plain ✓ hides real legal exposure, so an override is
 * reported as its own evidence level and the screen marks it.
 */
function waiverEvidenceFor(
  contact: ContactJoin,
  regSignedAt: string | null,
  regDocumentUrl: string | null
): { ok: boolean; evidence: WaiverEvidence; expiresAt: string | null } {
  const contactValid =
    Boolean(contact?.waiver_expires_at) &&
    Date.parse(contact!.waiver_expires_at!) > Date.now();
  const regValid = isWaiverDateValid(regSignedAt);

  if (!contactValid && !regValid) {
    return { ok: false, evidence: "none", expiresAt: null };
  }

  const expiresAt = contactValid ? contact!.waiver_expires_at : null;
  const documentUrl = contact?.waiver_document_url ?? regDocumentUrl;
  if (documentUrl) return { ok: true, evidence: "document", expiresAt };
  if (contact?.waiver_source === "admin_override") {
    return { ok: true, evidence: "override", expiresAt };
  }
  return { ok: true, evidence: "signed", expiresAt };
}

/**
 * GET /api/admin/tournaments/[id]/roster
 *
 * Everything the Roster screen renders, in one request: season players
 * (`registrations`) and one-night guests (`drop_ins`) merged into a single
 * list, the event's teams for the in-row picker, and the header totals.
 * Computed here rather than in the browser so the owner's daily driver stays
 * one round-trip.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid tournament id." }, { status: 400 });
  }

  try {
    const [regsRes, dropInsRes, teamsRes] = await Promise.all([
      supabaseAdmin
        .from("registrations")
        .select(
          `id, created_at, team_id, contact_id, first_name, last_name, email, phone, dob,
           emergency_name, emergency_phone, payment_status, needs_admin_review,
           waiver_signed_at, waiver_document_url,
           contact:contacts ( id, first_name, last_name, email, phone,
                              waiver_signed_at, waiver_expires_at,
                              waiver_document_url, waiver_source )`
        )
        .eq("tournament_id", id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("drop_ins")
        // `drop_ins` has two FKs to contacts (contact_id and
        // paid_by_contact_id), so the join must name the constraint.
        .select(
          `id, created_at, payment_status, contact_id,
           contact:contacts!drop_ins_contact_id_fkey ( id, first_name, last_name, email, phone,
                              waiver_signed_at, waiver_expires_at,
                              waiver_document_url, waiver_source )`
        )
        .eq("tournament_id", id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("teams")
        .select("id, name, color")
        .eq("tournament_id", id)
        .order("name", { ascending: true }),
    ]);

    const firstError = regsRes.error ?? dropInsRes.error ?? teamsRes.error;
    if (firstError) {
      console.error("[roster] fetch failed:", firstError.message);
      return NextResponse.json(
        { error: "Failed to load the roster." },
        { status: 500 }
      );
    }

    const teams = (teamsRes.data ?? []) as RosterTeam[];
    const teamById = new Map(teams.map((t) => [t.id, t]));

    const playerRows: RosterRow[] = (regsRes.data ?? []).map((r) => {
      const contact = firstOf(r.contact);
      const team = r.team_id ? teamById.get(r.team_id) ?? null : null;
      const waiver = waiverEvidenceFor(
        contact,
        r.waiver_signed_at,
        r.waiver_document_url
      );
      const email = r.email ?? contact?.email ?? null;
      return {
        id: r.id,
        role: "player",
        contactId: r.contact_id ?? contact?.id ?? null,
        firstName: r.first_name ?? contact?.first_name ?? "",
        lastName: r.last_name ?? contact?.last_name ?? "",
        phone: r.phone || contact?.phone || null,
        email: isPlaceholderEmail(email) ? null : email,
        teamId: r.team_id ?? null,
        teamName: team?.name ?? null,
        teamColor: team?.color ?? null,
        waiverOk: waiver.ok,
        waiverEvidence: waiver.evidence,
        waiverExpiresAt: waiver.expiresAt,
        paid: SETTLED.has(r.payment_status),
        paymentStatus: r.payment_status,
        needsReview: r.needs_admin_review === true,
        // A walk-in added from this screen still owes us the real details.
        incomplete:
          isPlaceholderEmail(email) ||
          r.dob === WALK_IN_PLACEHOLDER.dob ||
          !r.emergency_name,
        createdAt: r.created_at,
      };
    });

    const guestRows: RosterRow[] = (dropInsRes.data ?? []).map((d) => {
      const contact = firstOf(d.contact);
      const waiver = waiverEvidenceFor(contact, null, null);
      return {
        id: d.id,
        role: "guest",
        contactId: d.contact_id ?? contact?.id ?? null,
        firstName: contact?.first_name ?? "",
        lastName: contact?.last_name ?? "",
        phone: contact?.phone ?? null,
        email: isPlaceholderEmail(contact?.email) ? null : contact?.email ?? null,
        // Guests are not assigned to a team until Track B3 gives them a slot.
        teamId: null,
        teamName: null,
        teamColor: null,
        waiverOk: waiver.ok,
        waiverEvidence: waiver.evidence,
        waiverExpiresAt: waiver.expiresAt,
        paid: SETTLED.has(d.payment_status),
        paymentStatus: d.payment_status,
        needsReview: false,
        incomplete: false,
        createdAt: d.created_at,
      };
    });

    const rows = [...playerRows, ...guestRows].sort((a, b) =>
      a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
    );

    const payload: RosterPayload = {
      rows,
      teams,
      totals: totalsFromRows(rows),
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[roster] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

/**
 * POST /api/admin/tournaments/[id]/roster
 *
 * Add a walk-in from the field with nothing but a name and a phone number
 * (A3/D8). Identity is the phone (D4): an existing contact with that number is
 * reused rather than duplicated, which is how the same person showing up twice
 * stops becoming two people.
 *
 * Body: { firstName, lastName, phone, teamId? }
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid tournament id." }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const phone = normalizePhone(
    typeof body.phone === "string" ? body.phone : null
  );
  const teamId =
    typeof body.teamId === "string" && UUID_RE.test(body.teamId)
      ? body.teamId
      : null;

  if (!firstName) {
    return NextResponse.json({ error: "First name is required." }, { status: 400 });
  }
  if (!phone || phone.replace(/\D/g, "").length < 10) {
    return NextResponse.json(
      { error: "A 10-digit phone number is required." },
      { status: 400 }
    );
  }

  if (teamId) {
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("tournament_id", id)
      .maybeSingle();
    if (!team) {
      return NextResponse.json(
        { error: "That team belongs to a different event." },
        { status: 400 }
      );
    }
  }

  try {
    // Phone first (D4). Only invent a contact when this number is genuinely new.
    const { data: existing } = await supabaseAdmin
      .from("contacts")
      .select("id, email, waiver_type")
      .eq("phone", phone)
      .maybeSingle();

    let contactId = existing?.id ?? null;
    let email = existing?.email ?? null;

    if (!contactId) {
      email = walkInEmailForPhone(phone);
      const { data: created, error: contactErr } = await supabaseAdmin
        .from("contacts")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          tags: ["walk-in"],
        })
        .select("id, email")
        .single();
      if (contactErr || !created) {
        console.error("[roster] walk-in contact insert failed:", contactErr?.message);
        return NextResponse.json(
          { error: "Could not save this person." },
          { status: 500 }
        );
      }
      contactId = created.id;
      email = created.email;
    }

    // Don't add the same person to the same event twice.
    const { data: dupe } = await supabaseAdmin
      .from("registrations")
      .select("id")
      .eq("tournament_id", id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (dupe) {
      return NextResponse.json(
        { error: "That person is already on this roster.", id: dupe.id },
        { status: 409 }
      );
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("registrations")
      .insert({
        tournament_id: id,
        contact_id: contactId,
        team_id: teamId,
        registration_type: "adult",
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        // See WALK_IN_PLACEHOLDER: these columns are NOT NULL in Track A.
        dob: WALK_IN_PLACEHOLDER.dob,
        emergency_name: WALK_IN_PLACEHOLDER.text,
        emergency_phone: WALK_IN_PLACEHOLDER.text,
        waiver_type: "adult",
        waiver_signed: false,
        payment_status: "pending",
        notes: "Walk-in added from the roster screen.",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("[roster] walk-in insert failed:", error?.message);
      return NextResponse.json(
        { error: error?.message ?? "Could not add this player." },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (err) {
    console.error("[roster] walk-in unexpected error:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
