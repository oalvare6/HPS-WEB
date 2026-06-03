import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Contact, ContactInput } from "@/lib/types";

const CONTACTS_LOAD_USER_MESSAGE =
  "We couldn't load contacts right now. Please try again.";
export const WAIVER_VALIDITY_DAYS = 365;

/**
 * Normalize an email for lookup/dedupe. Postgres `citext` is case-insensitive,
 * but we still trim + lowercase here so DB rows are clean.
 */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * Normalize a phone number to digits only (with optional leading +). Empty
 * input returns null so callers can store NULL in the DB.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits || null;
}

export function getWaiverExpiryIso(
  signedAtIso: string | null | undefined,
  days = WAIVER_VALIDITY_DAYS
): string | null {
  if (!signedAtIso) return null;
  const signedAtMs = Date.parse(signedAtIso);
  if (Number.isNaN(signedAtMs)) return null;
  return new Date(signedAtMs + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Contact-level waiver (adult or youth, 365 days). When valid, the pay gate treats
 * the person as waiver-eligible for any tournament; step 2 only selects which
 * template/type to validate against (and new registrations).
 */
export function isContactWaiverValid(
  contact: Pick<Contact, "waiver_type" | "waiver_signed_at" | "waiver_expires_at"> | null,
  waiverType: "adult" | "youth",
  now = Date.now()
): boolean {
  if (!contact) return false;
  if (!contact.waiver_signed_at) return false;
  if (contact.waiver_type !== waiverType) return false;
  if (!contact.waiver_expires_at) return false;
  const expiresMs = Date.parse(contact.waiver_expires_at);
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs > now;
}

/**
 * Upsert a contact by email. Returns the canonical contact row.
 *
 * - Email is the unique identity (lowercased / citext).
 * - When the contact already exists, we *fill in* missing fields from the
 *   incoming payload (so registrations enrich an empty backfilled contact)
 *   but do not overwrite values the admin may have edited.
 */
export async function upsertContactByEmail(
  input: ContactInput
): Promise<{ contact: Contact | null; loadError: string | null }> {
  const email = normalizeEmail(input.email);
  if (!email) {
    return { contact: null, loadError: "Email is required." };
  }

  const incoming = {
    first_name: input.first_name.trim(),
    last_name: input.last_name.trim(),
    email,
    phone: normalizePhone(input.phone ?? null),
    dob: input.dob ?? null,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
    marketing_opt_in: input.marketing_opt_in ?? true,
  };

  try {
    const { data: existing, error: lookupErr } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (lookupErr) {
      console.error("[contacts] lookup failed:", lookupErr.message);
      return { contact: null, loadError: CONTACTS_LOAD_USER_MESSAGE };
    }

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (!existing.first_name && incoming.first_name) {
        patch.first_name = incoming.first_name;
      }
      if (!existing.last_name && incoming.last_name) {
        patch.last_name = incoming.last_name;
      }
      if (!existing.phone && incoming.phone) {
        patch.phone = incoming.phone;
      }
      if (!existing.dob && incoming.dob) {
        patch.dob = incoming.dob;
      }

      if (Object.keys(patch).length === 0) {
        return { contact: existing as Contact, loadError: null };
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("contacts")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateErr) {
        console.error("[contacts] enrich update failed:", updateErr.message);
        return { contact: existing as Contact, loadError: null };
      }

      return { contact: updated as Contact, loadError: null };
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("contacts")
      .insert(incoming)
      .select("*")
      .single();

    if (insertErr) {
      console.error("[contacts] insert failed:", insertErr.message);
      return { contact: null, loadError: CONTACTS_LOAD_USER_MESSAGE };
    }

    return { contact: inserted as Contact, loadError: null };
  } catch (err) {
    console.error("[contacts] upsert failed:", err);
    return { contact: null, loadError: CONTACTS_LOAD_USER_MESSAGE };
  }
}

/**
 * Fetch a single contact by id. Returns null on not-found or error.
 */
export async function getContactById(id: string): Promise<Contact | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[contacts] fetch by id failed:", error.message);
      return null;
    }
    return (data as Contact) ?? null;
  } catch (err) {
    console.error("[contacts] fetch by id failed:", err);
    return null;
  }
}

/**
 * Fetch a single contact by email. Returns null on not-found or error.
 */
export async function getContactByEmail(
  rawEmail: string
): Promise<Contact | null> {
  const email = normalizeEmail(rawEmail);
  if (!email) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (error) {
      console.error("[contacts] fetch by email failed:", error.message);
      return null;
    }
    return (data as Contact) ?? null;
  } catch (err) {
    console.error("[contacts] fetch by email failed:", err);
    return null;
  }
}
