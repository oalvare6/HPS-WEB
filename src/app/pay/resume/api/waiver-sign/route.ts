import { handleResumeWaiverSign } from "@/lib/resume-routes";
import { resumeDeps } from "@/lib/resume-deps";

export const dynamic = "force-dynamic";

/** Requires the `waiver:sign` scope, which only a post-registration or in-person session carries. */
export async function POST(request: Request) {
  return handleResumeWaiverSign(request, resumeDeps(request));
}
