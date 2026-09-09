import { handleAccountCancel } from "@/lib/account-routes";
import { accountDeps } from "@/lib/account-ops-supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/registrations/[id]/cancel
 *
 * The way off a roster for a SIGNED-IN player whose contact owns the row. The
 * resume-link flow has its own route (`/pay/resume/api/cancel`) authorised by
 * the server-side resume session; both call the same `cancelRegistrationById`.
 *
 * The 90-day HMAC token this route used to accept was retired in Stage 1.3;
 * a legacy `payToken` in the body or query is never read.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleAccountCancel(request, id, accountDeps(request));
}
