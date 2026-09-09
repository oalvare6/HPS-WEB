/**
 * Production `ResumeRegistrationOps` — what a resume session may do to the
 * one registration it names. Each operation re-reads the row and applies the
 * same business gates the signed-in account routes apply; none of them can
 * mark cash received, touch payment status directly, or reuse another
 * person's waiver. The only way a session ever writes waiver state is the
 * in-app signature, and only when it holds `waiver:sign`.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { acceptsPayments, type StatefulTournament } from "@/lib/tournament-state";
import { cancelRegistrationById } from "@/lib/registration-cancel-server";
import {
  createStripeCheckoutSession,
  persistRegistrationCheckoutDetails,
  resolveTournamentCheckout,
} from "@/lib/stripe-checkout";
import {
  createInPersonSubmission,
  isDocuSealConfigured,
  templateIdFor,
} from "@/lib/waiver-capture";
import { reconcileIfUnsigned } from "@/lib/waiver-reconcile";
import { normalizeEmail } from "@/lib/contacts";
import { declarePaymentMethod } from "@/lib/registration-payment-method-server";
import {
  loadWaiverSigningContext,
  signWaiverInApp,
  type InAppSignatureRequest,
} from "@/lib/waiver-sign-server";
import type { PaymentMethodChoice } from "@/lib/payment-method";
import type { ResumeRegistrationOps, ResumeSummary } from "@/lib/resume-routes";

type EmbeddedEvent = {
  id: string;
  title: string | null;
  slug: string | null;
  entry_fee_cents: number | null;
  drop_in_fee_cents: number | null;
} & StatefulTournament;

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

const SUMMARY_SELECT =
  "id, payment_status, payment_method, waiver_signed, cancelled_at, teams(name), tournament:tournaments!registrations_tournament_id_fkey ( id, title, slug, entry_fee_cents, drop_in_fee_cents, status, is_draft, registration_open, payments_open, start_date, end_date )";

/** Where DocuSeal sends the signer afterwards: the session page, nothing in the URL. */
export function resumeSignedRedirectUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/pay/resume?signed=1`;
}

export class SupabaseResumeOps implements ResumeRegistrationOps {
  async loadSummary(registrationId: string): Promise<ResumeSummary | null> {
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .select(SUMMARY_SELECT)
      .eq("id", registrationId)
      .maybeSingle();
    if (error) throw new Error(`resume summary: ${error.message}`);
    if (!data) return null;

    // The row says unsigned? Ask DocuSeal before saying so — the same
    // reconcile /register runs, for the same reason.
    let waiverSigned = data.waiver_signed === true;
    if (!waiverSigned) {
      const reconciled = await reconcileIfUnsigned({ id: data.id, waiver_signed: false });
      waiverSigned = reconciled?.signed === true;
    }

    const event = one(data.tournament as EmbeddedEvent | EmbeddedEvent[] | null);
    const team = one(data.teams as { name?: string | null } | { name?: string | null }[] | null);
    const fee = event?.entry_fee_cents && event.entry_fee_cents > 0
      ? event.entry_fee_cents
      : event?.drop_in_fee_cents && event.drop_in_fee_cents > 0
        ? event.drop_in_fee_cents
        : null;

    return {
      eventTitle: event?.title ?? null,
      eventSlug: event?.slug ?? null,
      paymentStatus: data.payment_status,
      paymentMethod: data.payment_method ?? null,
      waiverSigned,
      teamName: team?.name ?? null,
      entryFeeCents: fee,
      cancelledAt: data.cancelled_at ?? null,
    };
  }

  async startCheckout(registrationId: string, baseUrl: string) {
    const { data: registration, error } = await supabaseAdmin
      .from("registrations")
      .select("id, email, contact_id, payment_status, tournament_id, cancelled_at, waiver_signed")
      .eq("id", registrationId)
      .maybeSingle();
    if (error) throw new Error(`resume checkout: ${error.message}`);
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

    // Same gate as the account checkout: no money without a signature on THIS
    // row. A resume session never borrows a contact's waiver.
    let waiverSigned = registration.waiver_signed === true;
    if (!waiverSigned) {
      const reconciled = await reconcileIfUnsigned({ id: registration.id, waiver_signed: false });
      waiverSigned = reconciled?.signed === true;
    }
    if (!waiverSigned) {
      return {
        ok: false as const,
        status: 409,
        error: "Sign your waiver first — we can't take payment without it.",
      };
    }

    const email = normalizeEmail(registration.email ?? "");
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

    await persistRegistrationCheckoutDetails(registration.id, resolved);

    const { url } = await createStripeCheckoutSession({
      resolved,
      email,
      registrationId: registration.id,
      contactId: registration.contact_id ?? null,
      baseUrl,
      cancelUrl: `${baseUrl.replace(/\/$/, "")}/pay/resume?cancelled=true`,
    });
    if (!url) return { ok: false as const, status: 502, error: "Stripe did not return a checkout URL." };
    return { ok: true as const, url };
  }

  async cancel(registrationId: string) {
    return cancelRegistrationById(registrationId);
  }

  async setPaymentMethod(registrationId: string, method: PaymentMethodChoice) {
    return declarePaymentMethod(registrationId, method);
  }

  async signWaiverInApp(registrationId: string, input: InAppSignatureRequest) {
    return signWaiverInApp(registrationId, input);
  }

  async loadWaiverSigningContext(registrationId: string) {
    return loadWaiverSigningContext(registrationId);
  }

  /**
   * START the waiver flow. Returns the player's existing DocuSeal signing URL
   * when one exists, creates a DocuSeal submission when none does, and refuses
   * when DocuSeal is not configured — the typed-name flow lives behind the
   * `waiver:sign` scope, which a resumed session never carries. Completion is
   * recorded only by the verified provider path (webhook / reconcile).
   */
  async startWaiver(registrationId: string, baseUrl: string) {
    const { data: registration, error } = await supabaseAdmin
      .from("registrations")
      .select(
        "id, email, first_name, last_name, contact_id, waiver_type, waiver_signed, docuseal_sign_url, docuseal_submission_id, cancelled_at, tournament:tournaments!registrations_tournament_id_fkey ( id, status, is_draft, registration_open, payments_open, start_date, end_date )"
      )
      .eq("id", registrationId)
      .maybeSingle();
    if (error) throw new Error(`resume waiver: ${error.message}`);
    if (!registration) return { ok: false as const, status: 404, error: "Registration not found." };
    if (registration.cancelled_at) {
      return { ok: false as const, status: 409, error: "This spot was cancelled." };
    }

    let waiverSigned = registration.waiver_signed === true;
    if (!waiverSigned) {
      const reconciled = await reconcileIfUnsigned({ id: registration.id, waiver_signed: false });
      waiverSigned = reconciled?.signed === true;
    }
    if (waiverSigned) {
      return { ok: false as const, status: 409, error: "Your waiver is already signed." };
    }

    const event = one(registration.tournament as StatefulTournament | StatefulTournament[] | null);
    if (event && !acceptsPayments(event)) {
      return { ok: false as const, status: 409, error: "This event is no longer taking sign-ups." };
    }

    if (registration.docuseal_sign_url) {
      return { ok: true as const, url: registration.docuseal_sign_url, mode: "docuseal" as const };
    }

    const type = registration.waiver_type === "youth" ? "youth" : "adult";
    if (!isDocuSealConfigured(type)) {
      return {
        ok: false as const,
        status: 503,
        error: "Online waiver signing isn't available right now. We'll sign you in at the field.",
      };
    }
    const templateId = templateIdFor(type);
    const apiKey = process.env.DOCUSEAL_API_KEY?.trim();
    if (!templateId || !apiKey) {
      return { ok: false as const, status: 503, error: "Online waiver signing isn't available right now." };
    }

    const name =
      [registration.first_name, registration.last_name].filter(Boolean).join(" ") || "Player";
    const created = await createInPersonSubmission({
      apiKey,
      templateId,
      email: registration.email,
      name,
      metadata: {
        registration_id: registration.id,
        contact_id: registration.contact_id ?? "",
        source: "resume",
      },
      completedRedirectUrl: resumeSignedRedirectUrl(baseUrl),
    });
    if (!created.submissionId || !created.signUrl) {
      return { ok: false as const, status: 502, error: "The waiver service didn't respond. Please try again." };
    }

    const { error: linkErr } = await supabaseAdmin
      .from("registrations")
      .update({
        docuseal_submission_id: created.submissionId,
        docuseal_sign_url: created.signUrl,
        docuseal_status: "sent",
      })
      .eq("id", registration.id);
    if (linkErr) {
      console.error("[resume waiver] could not link submission:", linkErr.message);
      return { ok: false as const, status: 500, error: "Created the waiver but couldn't attach it. Please try again." };
    }

    return { ok: true as const, url: created.signUrl, mode: "docuseal" as const };
  }
}

let _ops: SupabaseResumeOps | null = null;

export function getResumeOps(): ResumeRegistrationOps {
  if (!_ops) _ops = new SupabaseResumeOps();
  return _ops;
}
