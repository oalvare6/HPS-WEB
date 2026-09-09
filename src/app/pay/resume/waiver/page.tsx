import { redirect } from "next/navigation";
import { IN_APP_WAIVER_SCOPE } from "@/lib/resume-access";
import { getResumeSessionFromCookies } from "@/lib/resume-session";
import { getResumeOps } from "@/lib/resume-ops-supabase";
import { RESUME_PAGE_PATH } from "@/lib/resume-routes";
import {
  WaiverLinkUnavailable,
  WaiverSigningScreen,
} from "@/components/register/WaiverSigningScreen";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign your waiver | Houston Premier Soccer",
  robots: { index: false, follow: false },
};

/**
 * The in-app signing screen for a registration-bound session.
 *
 * Reachable only with the `waiver:sign` scope, which a magic-link session
 * never carries: it is granted to the browser that just created the
 * registration while DocuSeal is not configured (A7 fallback), and to the
 * owner's laptop for an in-person signature (D8). The URL carries nothing;
 * the registration is whatever the session says.
 */
export default async function ResumeWaiverPage() {
  const session = await getResumeSessionFromCookies();

  if (!session) {
    return (
      <WaiverLinkUnavailable
        title="This waiver link has expired"
        body="Waiver links are personal and time-limited. Request a new link from the event's pay page and we'll take you straight back here."
        href="/events"
        label="View events"
      />
    );
  }

  if (!session.scopes.has(IN_APP_WAIVER_SCOPE)) {
    return (
      <WaiverLinkUnavailable
        title="This link can't sign a waiver"
        body="Waivers are signed through the document service. Open your registration and press “Sign my waiver” to continue."
        href={RESUME_PAGE_PATH}
        label="Open my registration"
      />
    );
  }

  const context = await getResumeOps().loadWaiverSigningContext(session.registrationId);
  if (!context) {
    return (
      <WaiverLinkUnavailable
        title="Registration not found"
        body="This registration no longer exists."
        href="/events"
        label="View events"
      />
    );
  }

  // Already signed: nothing to do on this screen, so don't show a form that
  // would only tell them off for signing twice.
  if (context.alreadySigned) {
    redirect(RESUME_PAGE_PATH);
  }

  return (
    <WaiverSigningScreen
      context={context}
      endpoint="/pay/resume/api/waiver-sign"
      nextHref={RESUME_PAGE_PATH}
    />
  );
}
