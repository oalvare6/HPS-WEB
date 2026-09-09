import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { WaiverSignForm } from "@/components/register/WaiverSignForm";
import {
  WAIVER_TEXT_VERSION,
  getWaiverClauses,
  getWaiverTitle,
} from "@/lib/waiver-text";
import type { WaiverSigningContext } from "@/lib/waiver-sign-server";

/**
 * The in-app waiver screen, rendered by two pages that differ only in who they
 * let through:
 *
 *   /register/waiver/[id]   — a signed-in player, for their own registration
 *   /pay/resume/waiver      — the browser that just created the registration
 *                             (session with `waiver:sign`), or the owner's
 *                             laptop for an in-person signature
 *
 * Each page does its own authorisation before rendering this, and hands in
 * the endpoint the form posts to and where to go afterwards. The clauses come
 * from `waiver-text.ts` and are versioned; the record page `/waiver/<id>`
 * re-renders exactly the wording that was on screen.
 */
export function WaiverSigningScreen({
  context,
  endpoint,
  nextHref,
}: {
  context: WaiverSigningContext;
  /** POST target for the signature. */
  endpoint: string;
  /** Where the browser goes after a recorded signature (a full page load). */
  nextHref: string;
}) {
  const clauses = getWaiverClauses(context.waiverType);

  return (
    <>
      <section className="bg-base text-white py-10 md:py-14 bg-tactical-grid">
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck size={26} className="text-brand flex-shrink-0" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {getWaiverTitle(context.waiverType)}
            </h1>
          </div>
          <p className="text-zinc-400">
            {context.eventTitle ? (
              <>
                Last step before you can pay for{" "}
                <span className="text-white">{context.eventTitle}</span>. Read this
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
            {context.waiverType === "youth"
              ? "A parent or guardian signs this for every youth registration."
              : "You only sign this once. It covers every event you play for the next 365 days."}
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
              {context.playerName && (
                <p className="mt-2 text-sm text-zinc-400">
                  Player:{" "}
                  <span className="text-white font-medium">{context.playerName}</span>
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
            endpoint={endpoint}
            nextHref={nextHref}
            waiverType={context.waiverType}
            playerName={context.playerName}
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
    </>
  );
}

/** The refusal card both pages share. Says nothing about whether the id exists. */
export function WaiverLinkUnavailable({
  title,
  body,
  href,
  label,
}: {
  title: string;
  body: string;
  href: string;
  label: string;
}) {
  return (
    <section className="bg-surface text-white min-h-[60vh] flex items-center">
      <div className="max-w-lg mx-auto px-6 py-16 text-center space-y-5">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
        <Link href={href} className="btn-primary inline-flex justify-center px-6">
          {label}
        </Link>
      </div>
    </section>
  );
}
