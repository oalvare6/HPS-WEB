import { handleResumeLinkRequest } from "@/lib/resume-routes";
import { resumeDeps } from "@/lib/resume-deps";

export const dynamic = "force-dynamic";

/**
 * POST /api/pay/eligibility — request a resume link.
 *
 * This route used to answer "who are you?" with a status AND, for a pending
 * registration, a 90-day bearer token — to anyone who typed an email address
 * (backend_audit_v1.md F-01). It now answers every caller identically and
 * delivers the capability only to the inbox that owns the address. See
 * src/lib/resume-access.ts for the flow and src/lib/resume-routes.ts for the
 * handler; this file only wires production dependencies.
 */
export async function POST(request: Request) {
  return handleResumeLinkRequest(request, resumeDeps(request));
}
