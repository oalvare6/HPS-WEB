import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdmin } from "@/lib/admin-auth";
import { normalizePhone } from "@/lib/contacts";
import {
  waiverStatusFor,
  totalsFromRows,
  walkInEmailForPhone,
  isPlaceholderEmail,
  WALK_IN_PLACEHOLDER,
  type RosterPayload,
  type RosterRow,
  type RosterTeam,
  type WaiverStatus,
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
 * PostgREST returns an embedded row as an object or a one-element array
 * depending on how it infers the relationship, so both shapes have to be
 * handled. `firstOf` above does this for contacts; this is the same unwrap for
 * the free-entry tournament, kept separate so neither has to widen its type.
 */
function embeddedTitle(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const title = (row as { title?: unknown }).title;
  return typeof title === "string" ? title : null;
}

/** One shared answer for the whole admin — see waiverStatusFor in admin-roster. */
function waiverEvidenceFor(
  contact: ContactJoin,
  regSignedAt: string | null,
  regDocumentUrl: string | null
): WaiverStatus {
  return waiverStatusFor({
    contactSignedAt: contact?.waiver_signed_at,
    contactExpiresAt: contact?.waiver_expires_at,
    contactDocumentUrl: contact?.waiver_document_url,
    contactSource: contact?.waiver_source,
    regSignedAt,
    regDocumentUrl,
  });
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
           emergency_name, emergency_phone, payment_status, payment_method,
           needs_admin_review, waiver_signed_at, waiver_document_url,
           free_entry_tournament_id,
           free_entry_tournament:tournaments!registrations_free_entry_tournament_id_fkey ( id, title ),
           contact:contacts ( id, first_name, last_name, email, phone,
                              waiver_signed_at, waiver_expires_at,
                              waiver_document_url, waiver_source )`
        )
        .eq("tournament_id", id)
        // The roster is the list the owner reads at the field. Somebody who
        // cancelled is not on it, and counting them would have the owner
        // waiting on a player who told us they weren't coming.
        .is("cancelled_at", null)
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
        paymentMethod: r.payment_method ?? null,
        /*
          D7: why this person owes nothing.

          The title is read from the row's own FK, not recomputed from the
          event's current config — somebody arguing about a comp at the field
          needs the answer that was true when they signed up, and the organiser
          may well have edited the list since. Null for everyone who paid.
        */
        freeEntryVia: embeddedTitle(r.free_entry_tournament),
        needsReview: r.needs_admin_review === true,
        /*
          Named gaps, not a mystery flag. The emergency contact is the one
          that actually matters on a pitch, and it goes missing for two
          reasons: a walk-in added at the field (D8), and the one-tap
          returning-player join, which copies it from the person's record
          and writes nothing when that is blank too.
        */
        missing: [
          !r.emergency_name?.trim() ? "emergency contact" : null,
          r.dob === WALK_IN_PLACEHOLDER.dob ? "date of birth" : null,
          isPlaceholderEmail(email) ? "email" : null,
        ].filter((m): m is string => m !== null),
        emergencyName: r.emergency_name?.trim() || null,
        emergencyPhone: r.emergency_phone?.trim() || null,
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
        // `drop_ins` has no payment_method column; a guest pays on the night by
        // definition, so there is no intent to record.
        paymentMethod: null,
        needsReview: false,
        // A one-night guest is not asked for a season's worth of detail.
        missing: [],
        emergencyName: null,
        emergencyPhone: null,
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

    // Don't add the same person to the same event twice. Only LIVE rows count:
    // a cancelled row means they gave up the spot and may absolutely re-join
    // (the old maybeSingle() with no filter refused those people, and threw on
    // anyone with a cancelled row plus a live one).
    const { data: dupes } = await supabaseAdmin
      .from("registrations")
      .select("id")
      .eq("tournament_id", id)
      .eq("contact_id", contactId)
      .is("cancelled_at", null)
      .limit(1);
    if (dupes && dupes.length > 0) {
      return NextResponse.json(
        { error: "That person is already on this roster.", id: dupes[0].id },
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
      // The one-live-spot index is the last line of defense against a race
      // between the check above and this insert. Its 23505 means "already on
      // the roster", and must never surface as a generic failure (CLAUDE.md).
      if (error?.code === "23505") {
        return NextResponse.json(
          { error: "That person is already on this roster." },
          { status: 409 }
        );
      }
      console.error("[roster] walk-in insert failed:", error?.message);
      return NextResponse.json(
        { error: "Could not add this player." },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: inserted.id }, { status: 201 });
  } catch (err) {
    console.error("[roster] walk-in unexpected error:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
