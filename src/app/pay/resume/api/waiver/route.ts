import { handleResumeWaiverStart } from "@/lib/resume-routes";
import { resumeDeps } from "@/lib/resume-deps";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleResumeWaiverStart(request, resumeDeps(request));
}
