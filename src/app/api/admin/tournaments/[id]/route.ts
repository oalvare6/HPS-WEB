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
  resolveFreeEntryTournamentIds,
} from "@/lib/tournament-api-validation";
import { parseEventKind } from "@/lib/event-kind";
import { parseStoredEventState, storedColumnsFor } from "@/lib/tournament-state";
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
  const body = (await request.json()) as Partial<TournamentInput> & {
    state?: unknown;
  };

  const update: Record<string, unknown> = {};
  /*
    `status`, `is_draft`, `registration_open` and `payments_open` are
    deliberately absent. Event status arrives as the one dropdown value
    (`state`, D1) and is expanded below through `storedColumnsFor`, the same
    function the form previews with. Accepting the columns one at a time made
    this route a second writer that could store a contradiction the dropdown
    cannot express ("completed but payments open"); a body that names one of
    them without `state` now simply has that key ignored.
  */
  const fields: (keyof TournamentInput)[] = [
    "title", "slug",
    "description", "start_date", "end_date", "time_start", "time_end",
    "recurrence", "location", "format", "kind", "entry_fee", "max_teams",
    "image_url", "image_preset", "register_url", "pay_url", "display_order",
    "is_featured", "drop_in_fee_cents", "free_entry_tournament_ids",
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

  if ("state" in body) {
    const state = parseStoredEventState(body.state);
    if (!state) {
      return NextResponse.json({ error: "Invalid event status." }, { status: 400 });
    }
    // The stored `status` depends on the dates. Use the ones in this request
    // when it carries them, otherwise the row's own, so a status-only PATCH
    // cannot re-derive against nothing and write "upcoming" onto a season in
    // progress.
    const dates = await datesForStateUpdate(id, update);
    Object.assign(update, storedColumnsFor(state, dates));
    // A draft is not public, so it cannot headline the homepage — enforced
    // whether or not the body mentions the star.
    if (state === "draft") update.is_featured = false;
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
  if ("kind" in update) {
    // Rejected rather than defaulted: a PATCH naming an unknown kind is a bug
    // in the caller, and silently writing 'tournament' would turn an open-play
    // night back into a tournament without telling anyone.
    const v = parseEventKind(update.kind);
    if (!v) {
      return NextResponse.json({ error: "Invalid event type." }, { status: 400 });
    }
    update.kind = v;
  }
  /*
    Free entry is resolved against the kind the row will *end up* with, not the
    one it had. A PATCH can carry both fields, and the two orderings disagree:
    switching a night to 'tournament' while its list is still set would leave
    dead config that reads like a live rule.

    The list is also cleared when the kind flips away from open play even if the
    caller said nothing about it — silently keeping it would mean a tournament
    later flipped back to open play resurrects a comp list nobody remembers
    writing.
  */
  const touchesFreeEntry =
    "free_entry_tournament_ids" in update || "kind" in update;
  if (touchesFreeEntry) {
    let effectiveKind = typeof update.kind === "string" ? update.kind : null;
    if (!effectiveKind) {
      const { data: current } = await supabaseAdmin
        .from("tournaments")
        .select("kind")
        .eq("id", id)
        .maybeSingle();
      effectiveKind = parseEventKind(current?.kind) ?? "tournament";
    }
    update.free_entry_tournament_ids = resolveFreeEntryTournamentIds(
      "free_entry_tournament_ids" in update
        ? update.free_entry_tournament_ids
        : [],
      effectiveKind,
      id
    );
    // Nothing to say about free entry on a tournament that never had any — skip
    // the write rather than stamping `{}` onto every unrelated edit.
    if (
      effectiveKind !== "open_play" &&
      !("free_entry_tournament_ids" in body) &&
      !("kind" in body)
    ) {
      delete update.free_entry_tournament_ids;
    }
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

/**
 * The dates `storedColumnsFor` should derive the stored status from: the
 * request's when it sets them, the row's otherwise.
 */
async function datesForStateUpdate(
  id: string,
  update: Record<string, unknown>
): Promise<{ start_date: string | null; end_date: string | null }> {
  const asDate = (v: unknown): string | null =>
    typeof v === "string" && v ? v : null;
  if ("start_date" in update && "end_date" in update) {
    return { start_date: asDate(update.start_date), end_date: asDate(update.end_date) };
  }
  const { data } = await supabaseAdmin
    .from("tournaments")
    .select("start_date, end_date")
    .eq("id", id)
    .maybeSingle();
  return {
    start_date:
      "start_date" in update ? asDate(update.start_date) : (data?.start_date ?? null),
    end_date: "end_date" in update ? asDate(update.end_date) : (data?.end_date ?? null),
  };
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
