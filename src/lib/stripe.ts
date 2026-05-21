import Stripe from "stripe";

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable.");
  }
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = getStripeClient();
  }
  return _stripe;
}

type SyncTournamentStripePricingInput = {
  tournamentId: string;
  title: string;
  slug: string;
  entryFeeCents: number | null;
  stripeProductId?: string | null;
  stripePriceId?: string | null;
};

type SyncTournamentStripePricingResult = {
  stripeProductId: string | null;
  stripePriceId: string | null;
};

function isStripeNotFoundError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "type" in err &&
      (err as { type?: string }).type === "StripeInvalidRequestError" &&
      "code" in err &&
      (err as { code?: string }).code === "resource_missing"
  );
}

export async function syncTournamentStripePricing(
  input: SyncTournamentStripePricingInput
): Promise<SyncTournamentStripePricingResult> {
  if (!input.entryFeeCents || input.entryFeeCents <= 0) {
    return {
      stripeProductId: input.stripeProductId ?? null,
      stripePriceId: input.stripePriceId ?? null,
    };
  }

  const stripe = getStripe();
  let productId = input.stripeProductId ?? null;

  if (productId) {
    try {
      await stripe.products.retrieve(productId);
    } catch (err) {
      if (!isStripeNotFoundError(err)) throw err;
      productId = null;
    }
  }

  if (!productId) {
    const product = await stripe.products.create({
      name: input.title,
      metadata: {
        tournament_id: input.tournamentId,
        tournament_slug: input.slug,
      },
    });
    productId = product.id;
  } else {
    await stripe.products.update(productId, {
      name: input.title,
      metadata: {
        tournament_id: input.tournamentId,
        tournament_slug: input.slug,
      },
    });
  }

  let priceId = input.stripePriceId ?? null;
  let needsNewPrice = true;

  if (priceId) {
    try {
      const price = await stripe.prices.retrieve(priceId);
      needsNewPrice = !(
        price.active &&
        price.currency === "usd" &&
        price.unit_amount === input.entryFeeCents &&
        price.product === productId
      );
    } catch (err) {
      if (!isStripeNotFoundError(err)) throw err;
      needsNewPrice = true;
      priceId = null;
    }
  }

  if (needsNewPrice) {
    const newPrice = await stripe.prices.create({
      currency: "usd",
      unit_amount: input.entryFeeCents,
      product: productId,
      metadata: {
        tournament_id: input.tournamentId,
        tournament_slug: input.slug,
        pay_kind: "entry",
      },
    });

    if (priceId) {
      try {
        await stripe.prices.update(priceId, { active: false });
      } catch {
        // Non-fatal: old prices can remain active without breaking checkout,
        // since we always pin checkout to the stored `stripe_price_id`.
      }
    }
    priceId = newPrice.id;
  }

  return {
    stripeProductId: productId,
    stripePriceId: priceId,
  };
}
