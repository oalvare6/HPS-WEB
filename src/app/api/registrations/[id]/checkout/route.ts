import { handleAccountCheckout } from "@/lib/account-routes";
import { accountDeps } from "@/lib/account-ops-supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/registrations/[id]/checkout → { url }
 *
 * Starts a Stripe Checkout Session for a signed-in player's own registration.
 * The amount comes from the event row (lib/stripe-checkout.ts); settlement is
 * the webhook's job (`finalize_checkout_payment`).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleAccountCheckout(request, id, accountDeps(request));
}
