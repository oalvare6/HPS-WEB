import { handleResumeCheckout } from "@/lib/resume-routes";
import { resumeDeps } from "@/lib/resume-deps";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleResumeCheckout(request, resumeDeps(request));
}
