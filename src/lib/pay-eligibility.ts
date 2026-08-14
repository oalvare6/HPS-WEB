import { createPayResumeToken } from "@/lib/app-signing";
import {
  getContactByEmail,
  getWaiverExpiryIso,
  isContactWaiverValid,
  normalizeEmail,
} from "@/lib/contacts";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { acceptsPayments } from "@/lib/tournament-state";
import type { PaymentMethodChoice } from "@/lib/payment-method";
import type {
  PayEligibilityStatus,
  PayEligibilitySuccessBody,
  PayEligibilityWaiverType,
} from "@/lib/pay-eligibility-types";
import type { Contact, RegistrationPaymentStatus } from "@/lib/types";

export type {
  PayEligibilityStatus,
  PayEligibilitySuccessBody,
  PayEligibilityWaiverType,
} from "@/lib/pay-eligibility-types";

export type PayEligibilityRegistrationSnapshot = {
  id: string;
  payment_status: RegistrationPaymentStatus;
  waiver_signed: boolean;
};

export type PayEligibilityResolveInput = {
  contact: Pick<
    Contact,
    | "id"
    | "waiver_type"
    | "waiver_signed_at"
    | "waiver_expires_at"
    | "waiver_document_url"
    | "waiver_submission_id"
  > | null;
  registration: PayEligibilityRegistrationSnapshot | null;
  waiverType: PayEligibilityWaiverType;
};

export type PayEligibilityResolveResult = {
  status: PayEligibilityStatus;
  contactId?: string;
  registrationId?: string;
  /** When true, caller should copy contact waiver onto registration before pay. */
  syncWaiverFromContact?: boolean;
};

const REGISTRATION_SELECT =
  "id, contact_id, payment_status, waiver_signed, waiver_signed_at, waiver_document_url, docuseal_submission_id";

function isPaidUpForGate(status: RegistrationPaymentStatus): boolean {
  return status === "paid" || status === "waived";
}

function canPayPending(status: RegistrationPaymentStatus): boolean {
  return status === "pending" || status === "partial";
}

/**
 * Pure resolver: given contact + optional registration for a tournament, return
 * gate status. Does not mint tokens or write to the database.
 */
export function resolvePayEligibility(
  input: PayEligibilityResolveInput
): PayEligibilityResolveResult {
  const { contact, registration, waiverType } = input;

  if (!contact) {
    return { status: "unknown_email" };
  }

  const contactId = contact.id;
  const contactWaiverValid = isContactWaiverValid(contact, waiverType);

  if (registration && isPaidUpForGate(registration.payment_status)) {
    return {
      status: "already_paid",
      contactId,
      registrationId: registration.id,
    };
  }

  if (!contactWaiverValid) {
    if (registration) {
      return {
        status: "needs_waiver",
        contactId,
        registrationId: registration.id,
      };
    }
    return { status: "no_waiver", contactId };
  }

  if (!registration) {
    return { status: "needs_registration", contactId };
  }

  if (!registration.waiver_signed) {
    return {
      status: "ready_to_pay",
      contactId,
      registrationId: registration.id,
      syncWaiverFromContact: true,
    };
  }

  if (canPayPending(registration.payment_status)) {
    return {
      status: "ready_to_pay",
      contactId,
      registrationId: registration.id,
    };
  }

  if (isPaidUpForGate(registration.payment_status)) {
    return {
      status: "already_paid",
      contactId,
      registrationId: registration.id,
    };
  }

  return {
    status: "needs_waiver",
    contactId,
    registrationId: registration.id,
  };
}

export type EnrollContactInTournamentInput = {
  contact: Contact;
  tournamentId: string;
  waiverType: PayEligibilityWaiverType;
  /**
   * Team picked at signup (D3). Callers must have already checked the team
   * belongs to this event — see `resolveTeamIdForTournament`.
   */
  teamId?: string | null;
  /**
   * What the player said they'd pay with, written in the same insert.
   *
   * Omit it and the column stays NULL, which keeps meaning "they have not told
   * us" — never "card". See lib/payment-method.ts. It is deliberately not a
   * `payment_status`: a cash promise is not a payment, and the row is created
   * `'pending'` either way.
   */
  paymentMethod?: PaymentMethodChoice | null;
  /**
   * Set only for an open-play night this person gets into free (D7), carrying
   * the id of the tournament that earned it.
   *
   * When present the row is written settled — `payment_status = 'waived'`,
   * `payment_amount = 0` — and **no Stripe session is created at all**: not a
   * $0 one, not a discounted one. Stripe rejects amounts under $0.50 anyway, so
   * a "free checkout" would be a payment path that always throws.
   *
   * It must never be built from a request body. The only correct source is
   * `loadOpenPlayEntitlement()`, which derives it server-side from rows the
   * caller does not control; a client-supplied flag here would be forgeable
   * free entry.
   */
  freeEntry?: { viaTournamentId: string } | null;
};

export type EnrollContactInTournamentResult =
  | { ok: true; registrationId: string }
  | {
      ok: false;
      /**
       * `already_registered` is the unique index
       * `registrations_one_live_spot_idx` firing (Postgres 23505). It is a
       * different thing from a failure: the player *is* on the roster, so
       * telling them to try again would be sending them at something that can
       * never succeed. Callers must say so plainly.
       */
      reason: "missing_waiver" | "already_registered" | "insert_failed";
    };

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * Create a pending registration row for a player whose contact already has a
 * valid facility waiver on file. This is the heart of the operator's rule: one
 * signed waiver (365 days) means the player never re-registers per event — any
 * tournament they want to pay for just gets a pending registration created here
 * and they go straight to checkout at the event's preset price.
 *
 * Emergency contact is mirrored from the contact when present but is NOT
 * required — most waiver-on-file contacts were captured without it, and forcing
 * re-registration just to collect it defeats the whole "pay without registering
 * again" flow. The registrations table stores empty strings in that case.
 */
export async function enrollContactInTournament(
  input: EnrollContactInTournamentInput
): Promise<EnrollContactInTournamentResult> {
  const { contact, tournamentId, waiverType } = input;

  if (!isContactWaiverValid(contact, waiverType)) {
    return { ok: false, reason: "missing_waiver" };
  }

  const emergencyName = (contact.emergency_name ?? "").trim();
  const emergencyPhone = (contact.emergency_phone ?? "").trim();

  const signedAt = contact.waiver_signed_at ?? new Date().toISOString();

  const { data: inserted, error } = await supabaseAdmin
    .from("registrations")
    .insert({
      tournament_id: tournamentId,
      team_id: input.teamId ?? null,
      contact_id: contact.id,
      registration_type: waiverType,
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: contact.email,
      phone: contact.phone ?? "",
      dob: contact.dob ?? "",
      emergency_name: emergencyName,
      emergency_phone: emergencyPhone,
      waiver_type: waiverType,
      waiver_signed: true,
      waiver_signed_at: signedAt,
      waiver_document_url: contact.waiver_document_url,
      docuseal_status: "signed",
      docuseal_submission_id: contact.waiver_submission_id,
      // A comped open-play spot is settled the moment it is confirmed: there is
      // nothing to collect, so leaving it 'pending' would put the player on the
      // owner's chase list for a fee that was never owed.
      payment_status: input.freeEntry ? "waived" : "pending",
      payment_amount: input.freeEntry ? 0 : null,
      free_entry_tournament_id: input.freeEntry?.viaTournamentId ?? null,
      payment_method: input.paymentMethod ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    // Somebody already holds a live spot on this event. Two taps on a phone at
    // the field is the ordinary cause, and the honest answer is "you're already
    // in", not an error.
    if (error?.code === UNIQUE_VIOLATION) {
      return { ok: false, reason: "already_registered" };
    }
    console.error("[pay-eligibility] auto-enroll insert failed:", error?.message);
    return { ok: false, reason: "insert_failed" };
  }

  return { ok: true, registrationId: inserted.id };
}

export async function syncRegistrationWaiverFromContact(
  registrationId: string,
  contact: Contact,
  waiverType: PayEligibilityWaiverType
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isContactWaiverValid(contact, waiverType)) {
    return { ok: false, message: "Contact waiver is not valid for sync." };
  }

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
    .eq("id", registrationId);

  if (markSignedErr) {
    console.error("[pay-eligibility] waiver sync failed:", markSignedErr.message);
    return { ok: false, message: markSignedErr.message };
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
      console.warn("[pay-eligibility] contact waiver patch failed:", contactPatchErr.message);
    }
  }

  return { ok: true };
}

async function findRegistrationForPayGate(
  contactId: string,
  email: string,
  tournamentId: string
): Promise<PayEligibilityRegistrationSnapshot | null> {
  const { data: byContact, error: contactErr } = await supabaseAdmin
    .from("registrations")
    .select(REGISTRATION_SELECT)
    .eq("tournament_id", tournamentId)
    .eq("contact_id", contactId)
    // A cancelled spot must not be resurrected by the pay gate — that would
    // take money for a place the player has given up.
    .is("cancelled_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactErr) {
    console.error("[pay-eligibility] registration lookup failed:", contactErr.message);
    throw new Error("registration_lookup_failed");
  }

  if (byContact) {
    return {
      id: byContact.id,
      payment_status: byContact.payment_status,
      waiver_signed: byContact.waiver_signed,
    };
  }

  const { data: byEmail, error: emailErr } = await supabaseAdmin
    .from("registrations")
    .select(REGISTRATION_SELECT)
    .eq("tournament_id", tournamentId)
    .eq("email", email)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (emailErr) {
    console.error("[pay-eligibility] email registration lookup failed:", emailErr.message);
    throw new Error("registration_lookup_failed");
  }

  if (!byEmail) return null;

  return {
    id: byEmail.id,
    payment_status: byEmail.payment_status,
    waiver_signed: byEmail.waiver_signed,
  };
}

export type RunPayEligibilityCheckInput = {
  email: string;
  tournamentId: string;
  waiverType: PayEligibilityWaiverType;
  /**
   * Whether a valid-waiver contact with no registration for this event may be
   * put on the roster as a side effect of this check.
   *
   * Required, not optional — see the note on `runPayEligibilityCheck`.
   */
  allowAutoEnroll: boolean;
};

export type RunPayEligibilityCheckResult =
  | { ok: true; body: PayEligibilitySuccessBody }
  | { ok: false; httpStatus: number; error: string };

/**
 * Load contact + registration, resolve status, optionally sync waiver, mint pay token.
 *
 * `allowAutoEnroll` has **no default**, deliberately. It used to be unconditional
 * behaviour: a recognised player with a valid waiver who so much as loaded
 * `/pay?tournament=<slug>` had a roster row written for them before they pressed
 * anything. The operator's rule is now the opposite — *"i dont want ppl to sign
 * up if they havent commited"* — so both callers pass `false` and creating a
 * registration is something only an explicit Confirm does. Making the parameter
 * required means a future caller has to decide rather than inherit.
 */
export async function runPayEligibilityCheck(
  input: RunPayEligibilityCheckInput
): Promise<RunPayEligibilityCheckResult> {
  const email = normalizeEmail(input.email);
  if (!email) {
    return { ok: false, httpStatus: 400, error: "A valid email is required." };
  }

  const { data: tournament, error: tournamentErr } = await supabaseAdmin
    .from("tournaments")
    .select("id, payments_open, registration_open, is_draft, status, start_date, end_date")
    .eq("id", input.tournamentId)
    .maybeSingle();

  if (tournamentErr) {
    console.error("[pay-eligibility] tournament lookup failed:", tournamentErr.message);
    return {
      ok: false,
      httpStatus: 500,
      error: "We could not verify this tournament. Please try again.",
    };
  }

  if (!tournament?.id) {
    return { ok: false, httpStatus: 404, error: "Tournament not found." };
  }

  if (!acceptsPayments(tournament)) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Payments are not open for this tournament.",
    };
  }

  const contact = await getContactByEmail(email);

  let registration: PayEligibilityRegistrationSnapshot | null = null;
  if (contact) {
    try {
      registration = await findRegistrationForPayGate(
        contact.id,
        email,
        input.tournamentId
      );
    } catch {
      return {
        ok: false,
        httpStatus: 500,
        error: "We could not look up your registration. Please try again.",
      };
    }
  }

  const resolved = resolvePayEligibility({
    contact,
    registration,
    waiverType: input.waiverType,
  });

  switch (resolved.status) {
    case "unknown_email":
      return { ok: true, body: { status: "unknown_email" } };
    case "no_waiver":
      return {
        ok: true,
        body: { status: "no_waiver", contactId: resolved.contactId! },
      };
    case "needs_registration": {
      // Valid waiver on file but no registration row for this tournament.
      //
      // This used to enroll them on the spot: a signed facility waiver meant the
      // player never "registered" again per event, so loading the page was
      // enough to put them on a roster. That is a signup nobody performed, and
      // it is the quiet twin of the fault the confirm gate on `/register` fixes
      // — so both callers now pass `allowAutoEnroll: false` and this falls
      // through to the `needs_registration` card, which routes them to
      // `/register` where confirming is an actual button.
      //
      // The branch is kept rather than deleted because the enrolment itself is
      // still correct — a returning player really does not re-register — and a
      // future caller that has just taken a confirmation can opt back into it.
      if (contact && input.allowAutoEnroll) {
        const enroll = await enrollContactInTournament({
          contact,
          tournamentId: input.tournamentId,
          waiverType: input.waiverType,
        });
        if (enroll.ok) {
          let payToken: string;
          try {
            payToken = createPayResumeToken(enroll.registrationId);
          } catch (e) {
            console.error("[pay-eligibility] pay token signing failed after enroll:", e);
            return {
              ok: false,
              httpStatus: 500,
              error: "Payment could not be prepared (server signing misconfiguration).",
            };
          }
          return {
            ok: true,
            body: {
              status: "ready_to_pay",
              contactId: resolved.contactId!,
              registrationId: enroll.registrationId,
              payToken,
            },
          };
        }
      }
      return {
        ok: true,
        body: { status: "needs_registration", contactId: resolved.contactId! },
      };
    }
    case "needs_waiver":
      return {
        ok: true,
        body: {
          status: "needs_waiver",
          contactId: resolved.contactId!,
          registrationId: resolved.registrationId!,
        },
      };
    case "already_paid":
      return {
        ok: true,
        body: {
          status: "already_paid",
          contactId: resolved.contactId!,
          registrationId: resolved.registrationId!,
        },
      };
    case "ready_to_pay": {
      if (resolved.syncWaiverFromContact && contact) {
        const sync = await syncRegistrationWaiverFromContact(
          resolved.registrationId!,
          contact,
          input.waiverType
        );
        if (!sync.ok) {
          return {
            ok: false,
            httpStatus: 500,
            error: "We could not sync your waiver. Please try again.",
          };
        }
      }

      let payToken: string;
      try {
        payToken = createPayResumeToken(resolved.registrationId!);
      } catch (e) {
        console.error("[pay-eligibility] pay token signing failed:", e);
        return {
          ok: false,
          httpStatus: 500,
          error: "Payment could not be prepared (server signing misconfiguration).",
        };
      }

      return {
        ok: true,
        body: {
          status: "ready_to_pay",
          contactId: resolved.contactId!,
          registrationId: resolved.registrationId!,
          payToken,
        },
      };
    }
    default:
      console.error("[pay-eligibility] unhandled status:", resolved);
      return {
        ok: false,
        httpStatus: 500,
        error: "Unexpected eligibility result.",
      };
  }
}
