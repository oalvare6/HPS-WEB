import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slug";
import { sanitizeOptionalInternalPath } from "@/lib/safe-internal-link";
import { syncTournamentStripePricing } from "@/lib/stripe";
import {
  assertTournamentStatus,
  ensureFeaturedCapNotExceeded,
  parseOptionalMoney,
  parseOptionalNonNegInt,
} from "@/lib/tournament-api-validation";
import type { TournamentInput } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { data, error } = await supabaseAdmin
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ tournament: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const body = (await request.json()) as Partial<TournamentInput>;

  const update: Record<string, unknown> = {};
  const fields: (keyof TournamentInput)[] = [
    "title", "slug", "status", "is_draft", "registration_open", "payments_open",
    "description", "start_date", "end_date", "time_start", "time_end",
    "recurrence", "location", "format", "entry_fee", "max_teams",
    "image_url", "image_preset", "register_url", "pay_url", "display_order",
    "is_featured", "drop_in_fee_cents",
  ];
  for (const f of fields) {
    if (f in body) update[f] = body[f];
  }
  if (typeof update.slug === "string") {
    update.slug = slugify(update.slug as string);
  }
  if (typeof update.title === "string" && (!update.slug || update.slug === "")) {
    update.slug = slugify(update.title as string);
  }

  if ("status" in update) {
    const s = assertTournamentStatus(update.status);
    if (s === "invalid") {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    update.status = s;
  }
  if ("entry_fee" in update) {
    const v = parseOptionalMoney(update.entry_fee);
    if (v === "invalid") {
      return NextResponse.json({ error: "Invalid entry fee." }, { status: 400 });
    }
    update.entry_fee = v;
    update.entry_fee_cents =
      typeof v === "number" ? Math.max(0, Math.round(v * 100)) : null;
  }
  if ("drop_in_fee_cents" in update) {
    const v = parseOptionalNonNegInt(update.drop_in_fee_cents);
    if (v === "invalid") {
      return NextResponse.json(
        { error: "Invalid drop-in fee." },
        { status: 400 }
      );
    }
    if (v === null) {
      delete update.drop_in_fee_cents;
    } else {
      update.drop_in_fee_cents = v;
    }
  }
  if ("max_teams" in update) {
    const v = parseOptionalNonNegInt(update.max_teams);
    if (v === "invalid") {
      return NextResponse.json({ error: "Invalid max teams." }, { status: 400 });
    }
    update.max_teams = v;
  }
  if ("display_order" in update) {
    const raw = update.display_order;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return NextResponse.json({ error: "Invalid display order." }, { status: 400 });
    }
    update.display_order = n;
  }
  if ("register_url" in update) {
    update.register_url = sanitizeOptionalInternalPath(update.register_url);
  }
  if ("pay_url" in update) {
    update.pay_url = sanitizeOptionalInternalPath(update.pay_url);
  }
  if ("is_draft" in update) {
    update.is_draft = update.is_draft === true;
  }
  if ("is_featured" in update) {
    update.is_featured = update.is_featured === true;
    // A draft is not public, so it cannot headline the homepage. Enforced here
    // as well as in the form so the two can never disagree.
    if (update.is_draft === true) update.is_featured = false;
    if (update.is_featured === true) {
      const capError = await ensureFeaturedCapNotExceeded(id);
      if (capError) return capError;
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from("tournaments")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  let tournament = updated;
  if (updated) {
    try {
      const stripeRefs = await syncTournamentStripePricing({
        tournamentId: updated.id,
        title: updated.title,
        slug: updated.slug,
        entryFeeCents: updated.entry_fee_cents,
        stripeProductId: updated.stripe_product_id,
        stripePriceId: updated.stripe_price_id,
      });

      if (
        stripeRefs.stripeProductId !== updated.stripe_product_id ||
        stripeRefs.stripePriceId !== updated.stripe_price_id
      ) {
        const { data: syncedRow, error: syncSaveErr } = await supabaseAdmin
          .from("tournaments")
          .update({
            stripe_product_id: stripeRefs.stripeProductId,
            stripe_price_id: stripeRefs.stripePriceId,
          })
          .eq("id", id)
          .select()
          .single();
        if (!syncSaveErr && syncedRow) {
          tournament = syncedRow;
        } else if (syncSaveErr) {
          console.error("Stripe refs save failed after tournament update:", syncSaveErr.message);
        }
      }
    } catch (stripeErr) {
      console.error("Stripe auto-sync failed after tournament update:", stripeErr);
    }
  }

  revalidatePath("/events");
  revalidatePath("/");
  if (tournament?.slug && typeof tournament.slug === "string") {
    revalidatePath(`/events/${tournament.slug}`);
  }
  return NextResponse.json({ tournament });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const unauthorized = await verifyAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await ctx.params;
  const { error } = await supabaseAdmin.from("tournaments").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath("/events");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
