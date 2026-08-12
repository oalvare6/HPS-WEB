import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { upsertContactByEmail, normalizeEmail } from "@/lib/contacts";
import { verifyPayResumeToken } from "@/lib/app-signing";
import { acceptsPayments } from "@/lib/tournament-state";
import {
  isWorldCupTournamentSlug,
  parseCheckoutPayKind,
  parseWorldCupRosterSize,
  worldCupShareAmountCents,
  WORLD_CUP_TEAM_FEE_CENTS,
  type CheckoutPayKind,
  type GenericPayKind,
} from "@/lib/world-cup-pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CheckoutBody = {
  email?: string;
  tournamentId?: string;
  dropInId?: string;
  payKind?: string;
  registrationId?: string;
  payToken?: string;
  rosterSize?: unknown;
  teamName?: string;
};

type ResolvedCheckout = {
  amountCents: number;
  productName: string;
  productDescription: string;
  stripePriceId: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  dropInId: string | null;
  payKind: CheckoutPayKind;
  rosterSize: number | null;
  teamName: string | null;
};

function mergeNotes(existing: string | null, line: string): string {
  if (!existing?.trim()) return line;
  if (existing.includes(line)) return existing;
  return `${existing.trim()}\n${line}`;
}

function requiresTeamNameForPayKind(payKind: CheckoutPayKind): boolean {
  return payKind === "team_full" || payKind === "team_share";
}

async function resolveTournamentCheckout(
  tournamentId: string,
  payKindInput: CheckoutPayKind | undefined,
  rosterSizeInput: number | undefined,
  teamNameInput: string | undefined
): Promise<ResolvedCheckout | { error: string; status: number }> {
  if (!UUID_RE.test(tournamentId)) {
    return { error: "Invalid tournament id.", status: 400 };
  }

  const { data: t, error } = await supabaseAdmin
    .from("tournaments")
    .select(
      "id, title, slug, entry_fee_cents, drop_in_fee_cents, stripe_price_id, payments_open, registration_open, is_draft, status, start_date, end_date"
    )
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !t) {
    return { error: "Tournament not found.", status: 404 };
  }

  // Calendar-aware: refuses a past event even if `payments_open` was left on.
  if (!acceptsPayments(t)) {
    return { error: "This tournament is not currently accepting payments.", status: 400 };
  }

  const teamName = teamNameInput?.trim() ?? "";

  if (isWorldCupTournamentSlug(t.slug)) {
    const payKind = payKindInput ?? "entry";

    if (payKind === "captain_paid_ack") {
      return {
        error:
          "Use the captain-paid confirmation on the pay page instead of card checkout.",
        status: 400,
      };
    }

    if (payKind !== "team_full" && payKind !== "team_share") {
      return {
        error: "Choose Pay full team or Pay my share for World Cup checkout.",
        status: 400,
      };
    }

    if (requiresTeamNameForPayKind(payKind) && !teamName) {
      return { error: "Team name is required for World Cup team payment.", status: 400 };
    }

    if (payKind === "team_full") {
      return {
        amountCents: WORLD_CUP_TEAM_FEE_CENTS,
        productName: `${t.title} — Full team`,
        productDescription: "Houston Premier Soccer — World Cup 7v7 full team fee ($960)",
        stripePriceId: null,
        tournamentId: t.id,
        tournamentName: t.title,
        dropInId: null,
        payKind: "team_full",
        rosterSize: null,
        teamName: teamName || null,
      };
    }

    const rosterSize = rosterSizeInput;
    if (!rosterSize) {
      return {
        error: "Roster size (8–12) is required when paying your share.",
        status: 400,
      };
    }

    const shareCents = worldCupShareAmountCents(rosterSize);
    if (shareCents <= 0) {
      return { error: "Invalid roster size. Choose 8–12 players.", status: 400 };
    }

    return {
      amountCents: shareCents,
      productName: `${t.title} — Team share (${rosterSize} players)`,
      productDescription: `Houston Premier Soccer — World Cup 7v7 share ($960 ÷ ${rosterSize})`,
      stripePriceId: null,
      tournamentId: t.id,
      tournamentName: t.title,
      dropInId: null,
      payKind: "team_share",
      rosterSize,
      teamName: teamName || null,
    };
  }

  const requestedKind: GenericPayKind = payKindInput === "drop_in" ? "drop_in" : "entry";
  let kind: GenericPayKind = requestedKind;
  let cents = kind === "drop_in" ? t.drop_in_fee_cents : t.entry_fee_cents;

  // Fall back to whichever fee is actually configured. Open play and similar
  // events are priced via drop-in only (no entry fee), so a registration-resume
  // pay that defaults to "entry" should still charge the preset drop-in amount.
  if (!cents || cents <= 0) {
    if (kind === "entry" && t.drop_in_fee_cents && t.drop_in_fee_cents > 0) {
      kind = "drop_in";
      cents = t.drop_in_fee_cents;
    } else if (kind === "drop_in" && t.entry_fee_cents && t.entry_fee_cents > 0) {
      kind = "entry";
      cents = t.entry_fee_cents;
    }
  }

  if (!cents || cents <= 0) {
    return {
      error:
        requestedKind === "drop_in"
          ? "No drop-in fee is configured for this tournament."
          : "No entry fee is configured for this tournament.",
      status: 400,
    };
  }

  return {
    amountCents: cents,
    productName: kind === "drop_in" ? `${t.title} — Drop-in` : t.title,
    productDescription:
      kind === "drop_in"
        ? "Houston Premier Soccer — Single-night drop-in"
        : "Houston Premier Soccer — Tournament Entry Fee",
    stripePriceId: kind === "entry" ? (t.stripe_price_id ?? null) : null,
    tournamentId: t.id,
    tournamentName: t.title,
    dropInId: null,
    payKind: kind,
    rosterSize: null,
    teamName: null,
  };
}

async function resolveDropInCheckout(
  dropInId: string
): Promise<ResolvedCheckout | { error: string; status: number }> {
  if (!UUID_RE.test(dropInId)) {
    return { error: "Invalid drop-in id.", status: 400 };
  }

  const { data, error } = await supabaseAdmin
    .from("drop_ins")
    .select(
      "id, amount_cents, payment_status, tournament_id, tournaments ( id, title, payments_open, registration_open, is_draft, status, start_date, end_date )"
    )
    .eq("id", dropInId)
    .maybeSingle();

  if (error || !data) {
    return { error: "Drop-in not found.", status: 404 };
  }

  if (data.payment_status === "paid") {
    return { error: "This drop-in has already been paid.", status: 400 };
  }

  if (!data.amount_cents || data.amount_cents <= 0) {
    return { error: "Drop-in has no amount configured.", status: 400 };
  }

  const tour = Array.isArray(data.tournaments) ? data.tournaments[0] : data.tournaments;

  if (tour && !acceptsPayments(tour)) {
    return { error: "This tournament is not currently accepting payments.", status: 400 };
  }

  return {
    amountCents: data.amount_cents,
    productName: tour?.title ? `${tour.title} — Drop-in` : "Drop-in",
    productDescription: "Houston Premier Soccer — Single-night drop-in",
    stripePriceId: null,
    tournamentId: data.tournament_id ?? null,
    tournamentName: tour?.title ?? null,
    dropInId: data.id,
    payKind: "drop_in",
    rosterSize: null,
    teamName: null,
  };
}

async function persistRegistrationCheckoutDetails(
  registrationId: string,
  resolved: ResolvedCheckout
): Promise<void> {
  if (!resolved.teamName && resolved.payKind !== "team_share") return;

  const { data: existing } = await supabaseAdmin
    .from("registrations")
    .select("notes")
    .eq("id", registrationId)
    .maybeSingle();

  const update: {
    team_name?: string;
    notes?: string;
  } = {};

  if (resolved.teamName) {
    update.team_name = resolved.teamName;
  }

  if (resolved.payKind === "team_share" && resolved.rosterSize) {
    update.notes = mergeNotes(
      existing?.notes ?? null,
      `World Cup: paying roster share (${resolved.rosterSize} players).`
    );
  } else if (resolved.payKind === "team_full") {
    update.notes = mergeNotes(
      existing?.notes ?? null,
      "World Cup: paying full team fee ($960)."
    );
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabaseAdmin
    .from("registrations")
    .update(update)
    .eq("id", registrationId);

  if (error) {
    console.error("[checkout] registration pre-checkout update failed:", error.message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CheckoutBody;
    const email = normalizeEmail(body.email ?? "");
    const payKind = parseCheckoutPayKind(body.payKind);
    const rosterSize = parseWorldCupRosterSize(body.rosterSize);
    const teamName =
      typeof body.teamName === "string" ? body.teamName.trim() : undefined;

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (payKind === "captain_paid_ack") {
      return NextResponse.json(
        {
          error:
            "Use the captain-paid confirmation button instead of card checkout.",
        },
        { status: 400 }
      );
    }

    let resolved: ResolvedCheckout;
    let resolvedRegistrationId: string | null = null;
    let checkoutEmail = email;

    if (body.registrationId) {
      if (!UUID_RE.test(body.registrationId)) {
        return NextResponse.json({ error: "Invalid registration id." }, { status: 400 });
      }
      if (!verifyPayResumeToken(body.registrationId, body.payToken)) {
        return NextResponse.json(
          { error: "Invalid or expired payment link. Start from your registration link." },
          { status: 403 }
        );
      }

      const { data: registration, error: registrationErr } = await supabaseAdmin
        .from("registrations")
        .select("id, email, payment_status, tournament_id")
        .eq("id", body.registrationId)
        .maybeSingle();

      if (registrationErr || !registration) {
        return NextResponse.json({ error: "Registration not found." }, { status: 404 });
      }
      if (registration.payment_status === "paid") {
        return NextResponse.json({ error: "This registration is already paid." }, { status: 400 });
      }

      const registrationEmail = normalizeEmail(registration.email ?? "");
      if (!registrationEmail) {
        return NextResponse.json(
          { error: "Registration email is missing. Please contact support." },
          { status: 400 }
        );
      }
      if (registrationEmail !== email) {
        return NextResponse.json(
          { error: "Email does not match this registration." },
          { status: 403 }
        );
      }
      if (!registration.tournament_id) {
        return NextResponse.json(
          {
            error:
              "Registration is not linked to a tournament yet. Please contact support.",
          },
          { status: 400 }
        );
      }

      const r = await resolveTournamentCheckout(
        registration.tournament_id,
        payKind,
        rosterSize,
        teamName
      );
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      resolved = r;
      resolvedRegistrationId = registration.id;
      checkoutEmail = registrationEmail;
    } else if (body.dropInId) {
      const r = await resolveDropInCheckout(body.dropInId);
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      resolved = r;
    } else if (body.tournamentId) {
      const r = await resolveTournamentCheckout(
        body.tournamentId,
        payKind,
        rosterSize,
        teamName
      );
      if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
      resolved = r;
    } else {
      return NextResponse.json(
        { error: "Provide tournamentId, dropInId, or a valid registrationId + payToken." },
        { status: 400 }
      );
    }

    if (!resolvedRegistrationId) {
      let query = supabaseAdmin
        .from("registrations")
        .select("id")
        .eq("email", checkoutEmail)
        .order("created_at", { ascending: false })
        .limit(1);
      if (resolved.tournamentId) {
        query = query.eq("tournament_id", resolved.tournamentId);
      }
      const { data: registration } = await query.maybeSingle();
      resolvedRegistrationId = registration?.id ?? null;
    }

    if (resolvedRegistrationId) {
      await persistRegistrationCheckoutDetails(resolvedRegistrationId, resolved);
    }

    const { contact } = await upsertContactByEmail({
      first_name: "",
      last_name: "",
      email: checkoutEmail,
      tags: ["paying"],
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL || `https://${req.headers.get("host")}`;

    const cancelParams = new URLSearchParams({ cancelled: "true" });
    if (resolvedRegistrationId) cancelParams.set("registrationId", resolvedRegistrationId);
    if (body.payToken) cancelParams.set("payToken", body.payToken);
    if (resolved.tournamentId) {
      const { data: tour } = await supabaseAdmin
        .from("tournaments")
        .select("slug")
        .eq("id", resolved.tournamentId)
        .maybeSingle();
      if (tour?.slug) cancelParams.set("tournament", tour.slug);
    }

    const metadata: Record<string, string> = {
      email: checkoutEmail,
      tournament_id: resolved.tournamentId ?? "",
      tournament_name: resolved.tournamentName ?? resolved.productName,
      registration_id: resolvedRegistrationId ?? "",
      drop_in_id: resolved.dropInId ?? "",
      contact_id: contact?.id ?? "",
      pay_kind: resolved.payKind,
      team_name: resolved.teamName ?? "",
      roster_size: resolved.rosterSize ? String(resolved.rosterSize) : "",
    };

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: checkoutEmail,
      line_items: resolved.stripePriceId
        ? [{ quantity: 1, price: resolved.stripePriceId }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: resolved.amountCents,
                product_data: {
                  name: resolved.productName,
                  description: resolved.productDescription,
                },
              },
            },
          ],
      metadata,
      success_url: `${baseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pay?${cancelParams.toString()}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
