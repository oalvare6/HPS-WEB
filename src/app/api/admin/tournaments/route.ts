import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";
import { sanitizeOptionalInternalPath } from "@/lib/safe-internal-link";
import { syncTournamentStripePricing } from "@/lib/stripe";
import {
  ensureFeaturedCapNotExceeded,
  parseOptionalMoney,
  parseOptionalNonNegInt,
  parseTournamentStatus,
} from "@/lib/tournament-api-validation";
import { parseEventKind } from "@/lib/event-kind";
import type { TournamentInput } from "@/lib/types";

export async function GET() {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .order("display_order", { ascending: true })
    .order("start_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tournaments: data ?? [] });
}

export async function POST(request: Request) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const body = (await request.json()) as Partial<TournamentInput>;

  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const slug = body.slug && body.slug.trim().length > 0 ? slugify(body.slug) : slugify(body.title);
  if (!slug) {
    return NextResponse.json({ error: "Slug could not be generated." }, { status: 400 });
  }

  const status = parseTournamentStatus(body.status, "upcoming");
  if (status === "invalid") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const entryFee = parseOptionalMoney(body.entry_fee);
  if (entryFee === "invalid") {
    return NextResponse.json({ error: "Invalid entry fee." }, { status: 400 });
  }
  const entryFeeCents =
    typeof entryFee === "number" ? Math.max(0, Math.round(entryFee * 100)) : null;

  const dropInFeeCents = parseOptionalNonNegInt(body.drop_in_fee_cents);
  if (dropInFeeCents === "invalid") {
    return NextResponse.json(
      { error: "Invalid drop-in fee." },
      { status: 400 }
    );
  }

  const maxTeams = parseOptionalNonNegInt(body.max_teams);
  if (maxTeams === "invalid") {
    return NextResponse.json({ error: "Invalid max teams." }, { status: 400 });
  }

  const displayOrderRaw = body.display_order ?? 0;
  const displayOrder = typeof displayOrderRaw === "number" ? displayOrderRaw : Number(displayOrderRaw);
  if (!Number.isFinite(displayOrder) || !Number.isInteger(displayOrder)) {
    return NextResponse.json({ error: "Invalid display order." }, { status: 400 });
  }

  const isDraft = body.is_draft === true;
  // A draft is not public, so it cannot headline the homepage.
  const isFeatured = body.is_featured === true && !isDraft;
  if (isFeatured) {
    const capError = await ensureFeaturedCapNotExceeded(null);
    if (capError) return capError;
  }

  const row: Record<string, unknown> = {
    title: body.title,
    slug,
    status,
    is_draft: isDraft,
    registration_open: body.registration_open ?? false,
    payments_open: body.payments_open ?? false,
    description: body.description ?? null,
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    time_start: body.time_start ?? null,
    time_end: body.time_end ?? null,
    recurrence: body.recurrence ?? null,
    location: body.location ?? null,
    format: body.format ?? null,
    // Unrecognised (or absent) falls back to 'tournament', which is both the
    // column default and how every event behaved before kinds existed.
    kind: parseEventKind(body.kind) ?? "tournament",
    entry_fee: entryFee,
    entry_fee_cents: entryFeeCents,
    max_teams: maxTeams,
    image_url: body.image_url ?? null,
    image_preset: body.image_preset ?? null,
    register_url: sanitizeOptionalInternalPath(body.register_url),
    pay_url: sanitizeOptionalInternalPath(body.pay_url),
    display_order: displayOrder,
    is_featured: isFeatured,
  };
  if (dropInFeeCents !== null) {
    row.drop_in_fee_cents = dropInFeeCents;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("tournaments")
    .insert(row)
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  let tournament = inserted;
  if (inserted) {
    try {
      const stripeRefs = await syncTournamentStripePricing({
        tournamentId: inserted.id,
        title: inserted.title,
        slug: inserted.slug,
        entryFeeCents: inserted.entry_fee_cents,
        stripeProductId: inserted.stripe_product_id,
        stripePriceId: inserted.stripe_price_id,
      });
      if (
        stripeRefs.stripeProductId !== inserted.stripe_product_id ||
        stripeRefs.stripePriceId !== inserted.stripe_price_id
      ) {
        const { data: syncedRow, error: syncSaveErr } = await supabaseAdmin
          .from("tournaments")
          .update({
            stripe_product_id: stripeRefs.stripeProductId,
            stripe_price_id: stripeRefs.stripePriceId,
          })
          .eq("id", inserted.id)
          .select()
          .single();
        if (!syncSaveErr && syncedRow) {
          tournament = syncedRow;
        } else if (syncSaveErr) {
          console.error("Stripe refs save failed after tournament create:", syncSaveErr.message);
        }
      }
    } catch (stripeErr) {
      console.error("Stripe auto-sync failed after tournament create:", stripeErr);
    }
  }

  revalidatePath("/events");
  revalidatePath("/");
  if (tournament?.slug && typeof tournament.slug === "string") {
    revalidatePath(`/events/${tournament.slug}`);
  }
  return NextResponse.json({ tournament });
}
