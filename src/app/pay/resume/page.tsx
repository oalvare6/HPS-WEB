import Link from "next/link";
import { CreditCard } from "lucide-react";
import { getResumeSessionFromCookies } from "@/lib/resume-session";
import { getResumeOps } from "@/lib/resume-ops-supabase";
import { ResumePanel } from "@/components/pay/ResumePanel";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your registration | Houston Premier Soccer",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ link?: string; cancelled?: string; signed_out?: string }>;

/**
 * Where a magic link lands after the exchange. The URL carries nothing: the
 * registration is whatever the server-side session says it is, and the page
 * shows the minimum a player needs — which event, what they owe, whether the
 * waiver is done — with the four actions a resume session is allowed.
 */
export default async function ResumePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const session = await getResumeSessionFromCookies();

  if (!session) {
    return (
      <Shell title={sp.signed_out === "1" ? "You're signed out" : "This link has expired"}>
        <p className="text-sm text-zinc-400 leading-relaxed">
          {sp.link === "invalid"
            ? "That link was already used or has expired. Links work once and for twenty minutes."
            : sp.signed_out === "1"
              ? "Request a new link from the event's pay page whenever you need to come back."
              : "Resume links are personal and time-limited. Request a new one from the event's pay page."}
        </p>
        <Link href="/events" className="btn-primary inline-flex justify-center px-6">
          View events
        </Link>
      </Shell>
    );
  }

  const summary = await getResumeOps().loadSummary(session.registrationId);
  if (!summary) {
    return (
      <Shell title="Registration not found">
        <p className="text-sm text-zinc-400">This registration no longer exists.</p>
        <Link href="/events" className="btn-primary inline-flex justify-center px-6">
          View events
        </Link>
      </Shell>
    );
  }

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-3">
            <CreditCard size={26} className="text-brand flex-shrink-0" />
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {summary.eventTitle ? `Your spot — ${summary.eventTitle}` : "Your registration"}
            </h1>
          </div>
          <p className="text-zinc-400 max-w-2xl">
            {sp.cancelled === "true"
              ? "Payment wasn't completed. Your spot is still held — pay when you're ready."
              : "Pay online, sign your waiver, or let us know you're not coming."}
          </p>
        </div>
      </section>

      <section className="bg-surface text-white py-10 md:py-14">
        <div className="max-w-2xl mx-auto px-6 space-y-6">
          <ResumePanel summary={summary} />
          <p className="text-center text-xs text-zinc-500">
            Questions?{" "}
            <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false} />
          </p>
        </div>
      </section>
    </>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface text-white min-h-[60vh] flex items-center">
      <div className="max-w-lg mx-auto px-6 py-16 text-center space-y-5">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children}
      </div>
    </section>
  );
}
