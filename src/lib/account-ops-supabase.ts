/**
 * Production `AccountRegistrationOps` — what a signed-in player may do to
 * their own registration, plus the wiring the route files use.
 *
 * Every operation re-reads the row and applies the same business gates the
 * resume flow applies. The one thing this surface may do that a resume
 * session may not is converge a row onto the player's own still-valid adult
 * waiver (`ensureWaiverForAuthenticatedOwner`), because here the caller's
 * identity IS the contact the waiver belongs to.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeEmail } from "@/lib/contacts";
import { getCurrentPlayer } from "@/lib/player-auth";
import { cancelRegistrationById } from "@/lib/registration-cancel-server";
import { declarePaymentMethod } from "@/lib/registration-payment-method-server";
import { ensureWaiverForAuthenticatedOwner } from "@/lib/waiver-reuse-server";
import { signWaiverInApp, type InAppSignatureRequest } from "@/lib/waiver-sign-server";
import { createStripeCheckoutSession, resolveTournamentCheckout } from "@/lib/stripe-checkout";
import { siteBaseUrl } from "@/lib/resume-deps";
import type { PaymentMethodChoice } from "@/lib/payment-method";
import type { AccountIdentity, AccountRegistrationOps, AccountRouteDeps } from "@/lib/account-routes";

export class SupabaseAccountOps implements AccountRegistrationOps {
  async loadOwner(registrationId: string) {
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .select("contact_id")
      .eq("id", registrationId)
      .maybeSingle();
    if (error) throw new Error(`load owner: ${error.message}`);
    if (!data) return null;
    return { contactId: data.contact_id ?? null };
  }

  async cancel(registrationId: string) {
    return cancelRegistrationById(registrationId);
  }

  async setPaymentMethod(registrationId: string, method: PaymentMethodChoice, identity: AccountIdentity) {
    return declarePaymentMethod(registrationId, method, {
      ensureWaiver: (row) => ensureWaiverForAuthenticatedOwner(row, identity.contactId),
    });
  }

  async startCheckout(registrationId: string, identity: AccountIdentity, baseUrl: string) {
    const { data: registration, error } = await supabaseAdmin
      .from("registrations")
      .select(
        "id, email, contact_id, waiver_type, payment_status, tournament_id, cancelled_at, waiver_signed"
      )
      .eq("id", registrationId)
      .maybeSingle();
    if (error) throw new Error(`account checkout: ${error.message}`);
    if (!registration) return { ok: false as const, status: 404, error: "Registration not found." };

    if (registration.cancelled_at) {
      return {
        ok: false as const,
        status: 409,
        error: "You cancelled this spot, so there's nothing to pay. Sign up again if you'd like to come.",
      };
    }
    if (registration.payment_status === "paid" || registration.payment_status === "waived") {
      return { ok: false as const, status: 400, error: "This registration is already settled." };
    }
    if (!registration.tournament_id) {
      return {
        ok: false as const,
        status: 400,
        error: "Registration is not linked to an event yet. Please contact us.",
      };
    }

    // The waiver is a hard gate on money (D12). Reconcile, then the owner's own
    // adult waiver, then refuse.
    const waiverSigned = await ensureWaiverForAuthenticatedOwner(registration, identity.contactId);
    if (!waiverSigned) {
      return {
        ok: false as const,
        status: 409,
        error: "Sign your waiver first — we can't take payment without it.",
        needsWaiver: true,
      };
    }

    const email = normalizeEmail(registration.email ?? "") || identity.email;
    if (!email) {
      return { ok: false as const, status: 400, error: "Registration email is missing. Please contact us." };
    }

    const resolved = await resolveTournamentCheckout(
      registration.tournament_id,
      undefined,
      undefined,
      undefined
    );
    if ("error" in resolved) return { ok: false as const, status: resolved.status, error: resolved.error };

    const { data: tour } = await supabaseAdmin
      .from("tournaments")
      .select("slug")
      .eq("id", registration.tournament_id)
      .maybeSingle();
    const origin = baseUrl.replace(/\/$/, "");
    const cancelUrl = tour?.slug
      ? `${origin}/register?tournament=${encodeURIComponent(tour.slug)}`
      : `${origin}/me`;

    const { url } = await createStripeCheckoutSession({
      resolved,
      email,
      registrationId: registration.id,
      contactId: registration.contact_id ?? identity.contactId,
      baseUrl,
      cancelUrl,
    });
    if (!url) return { ok: false as const, status: 502, error: "Stripe did not return a checkout URL." };
    return { ok: true as const, url };
  }

  async signWaiverInApp(registrationId: string, input: InAppSignatureRequest) {
    return signWaiverInApp(registrationId, input);
  }
}

let _ops: SupabaseAccountOps | null = null;

export function getAccountOps(): AccountRegistrationOps {
  if (!_ops) _ops = new SupabaseAccountOps();
  return _ops;
}

/** Identity from the Supabase session: the contact `getCurrentPlayer` resolves, or null. */
export async function currentAccountIdentity(): Promise<AccountIdentity | null> {
  const player = await getCurrentPlayer();
  if (!player) return null;
  return { contactId: player.contact.id, email: player.email };
}

export function accountDeps(request: Request): AccountRouteDeps {
  return {
    identity: currentAccountIdentity,
    ops: getAccountOps(),
    baseUrl: siteBaseUrl(request),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  };
}
