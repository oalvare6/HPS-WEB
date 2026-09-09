/**
 * Production `FinalizeStore`. Reads through the service-role client; the
 * settlement itself is the `finalize_checkout_payment` database function so
 * payment row + registration confirmation commit or roll back together.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { upsertContactByEmail } from "@/lib/contacts";
import type { PricedTournament } from "@/lib/stripe-checkout";
import type {
  FinalizeArgs,
  FinalizeDropInRow,
  FinalizeRegistrationRow,
  FinalizeRpcResult,
  FinalizeStore,
} from "@/lib/payment-finalize";

const REGISTRATION_SELECT =
  "id, email, tournament_id, contact_id, payment_status, cancelled_at";

export class SupabaseFinalizeStore implements FinalizeStore {
  async loadRegistration(id: string): Promise<FinalizeRegistrationRow | null> {
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .select(REGISTRATION_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`load registration: ${error.message}`);
    return (data as FinalizeRegistrationRow | null) ?? null;
  }

  async findRegistrationByEmail(
    email: string,
    tournamentId: string
  ): Promise<FinalizeRegistrationRow | null> {
    // Live rows only. Without the cancelled_at filter a late webhook could
    // mark a row the player had already given up as 'paid' while their real
    // re-signup stayed pending.
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .select(REGISTRATION_SELECT)
      .eq("email", email)
      .eq("tournament_id", tournamentId)
      .is("cancelled_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`find registration by email: ${error.message}`);
    return (data as FinalizeRegistrationRow | null) ?? null;
  }

  async loadTournament(id: string): Promise<PricedTournament | null> {
    const { data, error } = await supabaseAdmin
      .from("tournaments")
      .select("id, title, slug, entry_fee_cents, drop_in_fee_cents, stripe_price_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`load tournament: ${error.message}`);
    return (data as PricedTournament | null) ?? null;
  }

  async loadDropIn(id: string): Promise<FinalizeDropInRow | null> {
    const { data, error } = await supabaseAdmin
      .from("drop_ins")
      .select("id, amount_cents, tournament_id, contact_id, payment_status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`load drop-in: ${error.message}`);
    return (data as FinalizeDropInRow | null) ?? null;
  }

  async ensureContactByEmail(email: string): Promise<string | null> {
    const { contact } = await upsertContactByEmail({
      first_name: "",
      last_name: "",
      email,
      tags: ["paid"],
    });
    return contact?.id ?? null;
  }

  async finalize(args: FinalizeArgs): Promise<FinalizeRpcResult> {
    const { data, error } = await supabaseAdmin.rpc("finalize_checkout_payment", { p: args });
    if (error) throw new Error(`finalize_checkout_payment: ${error.message}`);
    const row = data as FinalizeRpcResult | null;
    if (!row || typeof row.outcome !== "string") {
      throw new Error("finalize_checkout_payment returned no outcome");
    }
    return row;
  }

  async recordEvent(input: {
    eventId: string;
    type: string;
    objectId: string | null;
    outcome: string;
    detail: string | null;
  }): Promise<void> {
    const { error } = await supabaseAdmin.rpc("record_stripe_webhook_event", {
      p_event_id: input.eventId,
      p_type: input.type,
      p_object_id: input.objectId,
      p_outcome: input.outcome,
      p_detail: input.detail,
    });
    if (error) throw new Error(`record_stripe_webhook_event: ${error.message}`);
  }
}

let _store: SupabaseFinalizeStore | null = null;

export function getFinalizeStore(): FinalizeStore {
  if (!_store) _store = new SupabaseFinalizeStore();
  return _store;
}
