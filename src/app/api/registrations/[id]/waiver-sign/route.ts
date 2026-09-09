import { handleAccountWaiverSign } from "@/lib/account-routes";
import { accountDeps } from "@/lib/account-ops-supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/registrations/[id]/waiver-sign  { signedName, signerRelationship? }
 *
 * The in-app typed-name signature for a signed-in player's own registration —
 * the A7 fallback for a row that never got a DocuSeal submission. Writes
 * through `recordInAppSignature` (lib/waiver-sign-server.ts).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleAccountWaiverSign(request, id, accountDeps(request));
}
