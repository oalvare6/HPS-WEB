import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { verifyPayResumeToken } from "@/lib/app-signing";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildPayResumePath } from "@/lib/pay-resume-url";
import { WaiverSignForm } from "@/components/register/WaiverSignForm";
import {
  WAIVER_TEXT_VERSION,
  getWaiverClauses,
  getWaiverTitle,
  type WaiverType,
} from "@/lib/waiver-text";

export const dynamic = "force-dynamic";

type Params = Promise<{ registrationId: string }>;
type SearchParams = Promise<{ payToken?: string; tournament?: string }>;

export const metadata = {
  title: "Sign your waiver | Houston Premier Soccer",
  robots: { index: false, follow: false },
};

export default async function WaiverSignPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { registrationId } = await params;
  const { payToken = "", tournament: tournamentSlug = null } = await searchParams;

  // The token is the whole authorization story here — see /api/waiver/sign.
  if (!verifyPayResumeToken(registrationId, payToken)) {
    return <ExpiredLink />;
  }

  const { data: registration } = await supabaseAdmin
    .from("registrations")
    .select(
      "id, first_name, last_name, waiver_type, waiver_signed, tournament_id, tournaments(title, slug)"
    )
    .eq("id", registrationId)
    .maybeSingle();

  if (!registration) notFound();

  // Already signed: nothing to do on this screen, so don't show a form that
  // would only tell them off for signing twice. Send them where they were going.
  if (registration.waiver_signed) {
    redirect(
      buildPayResumePath({
        registrationId,
        payToken,
        tournamentSlug: resolveSlug(registration) ?? tournamentSlug,
      })
    );
  }

  const waiverType: WaiverType =
    registration.waiver_type === "youth" ? "youth" : "adult";
  const playerName = `${registration.first_name ?? ""} ${registration.last_name ?? ""}`.trim();
  const eventTitle = resolveTitle(registration);
  const clauses = getWaiverClauses(waiverType);

  return (
    <>
      <section className="bg-base text-white py-10 md:py-14 bg-tactical-grid">
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck size={26} className="text-brand flex-shrink-0" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {getWaiverTitle(waiverType)}
            </h1>
          </div>
          <p className="text-zinc-400">
            {eventTitle ? (
              <>
                Last step before you can pay for{" "}
                <span className="text-white">{eventTitle}</span>. Read this
                through, then type your name at the bottom.
              </>
            ) : (
              <>
                Last step before you can pay. Read this through, then type your
                name at the bottom.
              </>
            )}
          </p>
          <p className="mt-3 text-sm text-zinc-500">
            You only sign this once. It covers every event you play for the next
            365 days.
          </p>
        </div>
      </section>

      <section className="bg-surface text-white py-10 md:py-14">
        <div className="max-w-3xl mx-auto px-6 space-y-8">
          <article className="dashboard-card p-6 md:p-8 space-y-6">
            <header className="pb-4 border-b border-border-token">
              <p className="text-xs font-mono uppercase tracking-wider text-brand">
                Version {WAIVER_TEXT_VERSION}
              </p>
              {playerName && (
                <p className="mt-2 text-sm text-zinc-400">
                  Player:{" "}
                  <span className="text-white font-medium">{playerName}</span>
                </p>
              )}
            </header>

            {clauses.map((clause) => (
              <div key={clause.heading} className="space-y-1.5">
                <h2 className="text-sm font-semibold text-white">
                  {clause.heading}
                </h2>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  {clause.body}
                </p>
              </div>
            ))}
          </article>

          <WaiverSignForm
            registrationId={registrationId}
            payToken={payToken}
            waiverType={waiverType}
            playerName={playerName}
          />

          <p className="text-xs text-zinc-500 text-center">
            Questions before you sign?{" "}
            <Link href="/contact" className="underline underline-offset-2">
              Contact us
            </Link>{" "}
            — don&apos;t sign anything you don&apos;t agree with.
          </p>
        </div>
      </section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}

type EmbeddedEvent = { title?: string | null; slug?: string | null };

type RegistrationWithEvent = {
  tournaments?: EmbeddedEvent | EmbeddedEvent[] | null;
};

/**
 * PostgREST returns an embedded one-to-one as an object, but the generated
 * types and some versions hand back a single-element array. Handle both rather
 * than betting on one.
 */
function embeddedEvent(row: RegistrationWithEvent): EmbeddedEvent | null {
  const raw = row.tournaments;
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function resolveTitle(row: RegistrationWithEvent): string | null {
  return embeddedEvent(row)?.title ?? null;
}

function resolveSlug(row: RegistrationWithEvent): string | null {
  return embeddedEvent(row)?.slug ?? null;
}

function ExpiredLink() {
  return (
    <section className="bg-surface text-white min-h-[60vh] flex items-center">
      <div className="max-w-lg mx-auto px-6 py-16 text-center space-y-5">
        <h1 className="text-2xl font-semibold">This waiver link has expired</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Waiver links are personal and time-limited. Start again from the event
          page and we&apos;ll take you straight back here.
        </p>
        <Link href="/events" className="btn-primary inline-flex justify-center px-6">
          View events
        </Link>
      </div>
    </section>
  );
}
