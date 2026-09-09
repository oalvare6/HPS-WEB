import { handleAccountPaymentMethod } from "@/lib/account-routes";
import { accountDeps } from "@/lib/account-ops-supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/registrations/[id]/payment-method  { method: "card" | "cash" }
 *
 * Records how a signed-in player intends to settle their own entry fee. Never
 * moves money, never marks anyone paid — see lib/registration-payment-method-server.ts.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleAccountPaymentMethod(request, id, accountDeps(request));
}
