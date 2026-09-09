/**
 * The database side of waiver reuse for a SIGNED-IN player acting on their own
 * registration (Stage 1.3, SEC-01).
 *
 * The account routes (`/api/registrations/[id]/*`) take money and record
 * payment intent only when the row's own waiver is signed. Before refusing,
 * they ask DocuSeal (the row may be signed and the webhook late), and then —
 * only for an authenticated adult whose own row it is — copy the contact's
 * still-valid waiver onto the row. That copy is the "registration hasn't
 * caught up" convergence `resolveSignupState` promises on screen, done at the
 * moment it matters and through the same `decideWaiverReuse` rule.
 */
import { getContactById } from "@/lib/contacts";
import { syncRegistrationWaiverFromContact } from "@/lib/pay-eligibility";
import { reconciledWaiverSigned } from "@/lib/registration-payment-method-server";

export type OwnedRegistrationWaiverRow = {
  id: string;
  contact_id: string | null;
  waiver_type: string | null;
  waiver_signed: boolean | null;
};

/**
 * True when the row is (now) signed. Reconcile first; reuse second; never
 * for a row whose `contact_id` is not the caller's.
 */
export async function ensureWaiverForAuthenticatedOwner(
  row: OwnedRegistrationWaiverRow,
  ownerContactId: string
): Promise<boolean> {
  if (await reconciledWaiverSigned(row)) return true;

  if (!row.contact_id || row.contact_id !== ownerContactId) return false;

  const contact = await getContactById(ownerContactId);
  if (!contact) return false;

  const waiverType = row.waiver_type === "youth" ? "youth" : "adult";
  const sync = await syncRegistrationWaiverFromContact(
    { id: row.id, contact_id: row.contact_id },
    contact,
    waiverType,
    "authenticated_contact"
  );
  if (!sync.ok && sync.refusal) {
    console.info("[waiver-reuse] not reused:", { registrationId: row.id, refusal: sync.refusal });
  }
  return sync.ok;
}
