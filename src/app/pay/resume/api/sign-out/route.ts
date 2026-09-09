import { handleResumeSignOut } from "@/lib/resume-routes";
import { resumeDeps } from "@/lib/resume-deps";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleResumeSignOut(request, resumeDeps(request));
}
