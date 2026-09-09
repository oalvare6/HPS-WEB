import { handleResumeExchange } from "@/lib/resume-routes";
import { resumeDeps } from "@/lib/resume-deps";

export const dynamic = "force-dynamic";

/** POST only: consuming a one-time token is a state change. The GET interstitial lives at /pay/resume/exchange (page). */
export async function POST(request: Request) {
  return handleResumeExchange(request, resumeDeps(request));
}
