/**
 * What the signup screen should show one person for one event.
 *
 * This module exists because the site had **two** front doors to the same
 * action. A tournament page with `payments_open` sent everyone to `/pay`, which
 * asked only for an email and, for anyone it did not recognise, told them to
 * "sign your facility waiver first" and bounced them to `/register` — a
 * completely different screen with a tournament dropdown and a team picker. One
 * event, two screens, and a loop between them.
 *
 * There is now one screen. It asks this module what to render, and the answer is
 * derived from exactly three things: whether the event is open, whether this
 * person already has a valid waiver, and whether they are already on the roster.
 *
 * Kept pure and separate from the page so the branch table can be tested without
 * a database — see scripts/test-signup-state.ts.
 */
import { isContactWaiverValid } from "@/lib/contacts";
import type { Contact, RegistrationPaymentStatus } from "@/lib/types";

export type SignupWaiverType = "adult" | "youth";

export type SignupRegistrationSnapshot = {
  id: string;
  payment_status: RegistrationPaymentStatus;
  waiver_signed: boolean;
  team_id: string | null;
};

export type SignupStateInput = {
  /** Null when the visitor is signed out or we have never seen this person. */
  contact: Pick<
    Contact,
    "id" | "waiver_type" | "waiver_signed_at" | "waiver_expires_at"
  > | null;
  /** This person's registration for *this* event, if any. */
  registration: SignupRegistrationSnapshot | null;
  waiverType: SignupWaiverType;
  canRegister: boolean;
  canPay: boolean;
};

export type SignupState =
  /** Event is over, draft, or closed to both signups and money. */
  | { kind: "closed" }
  /**
   * Already on the roster and square with us. Carries `teamId` because paying
   * does not settle which team you are on — the card still offers the picker.
   */
  | { kind: "already_paid"; registrationId: string; teamId: string | null }
  /** On the roster, still owes the entry fee. */
  | { kind: "owes_payment"; registrationId: string; teamId: string | null }
  /** On the roster but the waiver is still outstanding. */
  | { kind: "needs_waiver"; registrationId: string }
  /**
   * Known person, waiver still valid, not yet on this roster. The D5 flow:
   * "waiver good through <date>" → pick team → pay. No form, no re-signing.
   */
  | { kind: "quick_join"; contactId: string; waiverExpiresAt: string | null }
  /** Everyone else: the full form. */
  | { kind: "full_signup" };

export function resolveSignupState(input: SignupStateInput): SignupState {
  const { contact, registration, waiverType, canRegister, canPay } = input;

  // An event that can neither take a signup nor take money has nothing to offer
  // on this screen, whatever we know about the visitor.
  if (!canRegister && !canPay) {
    return { kind: "closed" };
  }

  if (registration) {
    if (
      registration.payment_status === "paid" ||
      registration.payment_status === "waived"
    ) {
      return {
        kind: "already_paid",
        registrationId: registration.id,
        teamId: registration.team_id,
      };
    }

    // Waiver outstanding on the row itself. A valid contact-level waiver still
    // rescues this — the registration just has not caught up yet — so check the
    // person before sending them back to sign something they already signed.
    if (!registration.waiver_signed && !isContactWaiverValid(contact, waiverType)) {
      return { kind: "needs_waiver", registrationId: registration.id };
    }

    return {
      kind: "owes_payment",
      registrationId: registration.id,
      teamId: registration.team_id,
    };
  }

  // Not on this roster yet. A valid waiver means we already have everything we
  // legally need, so the only question left is which team.
  if (contact && isContactWaiverValid(contact, waiverType) && canRegister) {
    return {
      kind: "quick_join",
      contactId: contact.id,
      waiverExpiresAt: contact.waiver_expires_at ?? null,
    };
  }

  return { kind: "full_signup" };
}

/**
 * Which waiver type to check a returning player against.
 *
 * A contact's waiver is stored with the type they signed, and
 * `isContactWaiverValid` requires an exact match — so checking a youth player
 * against 'adult' would report "no waiver" for someone who has one. Default to
 * whatever they signed last, falling back to adult for a brand-new person.
 */
export function defaultWaiverTypeFor(
  contact: Pick<Contact, "waiver_type"> | null,
  requested?: string | null
): SignupWaiverType {
  if (requested === "adult" || requested === "youth") return requested;
  return contact?.waiver_type === "youth" ? "youth" : "adult";
}
