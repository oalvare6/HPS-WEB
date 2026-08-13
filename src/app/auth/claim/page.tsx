import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { Section } from "@/components/shared/section";
import { getCurrentPlayer } from "@/lib/player-auth";

export const dynamic = "force-dynamic";

/**
 * Landing page for the post-checkout claim email.
 *
 * The user reaches here after `/auth/callback` has already exchanged the
 * magic-link / invite code for a Supabase session, so a session must
 * exist. If it doesn't, the link is stale or never minted — bounce them
 * back to `/login` with a recoverable error.
 *
 * Copy is intentionally tailored to a first-time claimer: they paid first,
 * are now logged in, and we want to point them at the surfaces that
 * justify the click (history, waiver, registrations).
 */
export default async function AuthClaimPage() {
  const player = await getCurrentPlayer();
  if (!player) {
    redirect("/login?error=claim_expired");
  }

  const { contact, email } = player;
  const displayName = (contact.first_name ?? "").trim() || email;

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs uppercase tracking-wider text-brand mb-2">
            Account claimed
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            Welcome aboard, {displayName}.
          </h1>
          <p className="text-zinc-400 text-base max-w-2xl">
            Your Houston Premier Soccer account is set up and tied to{" "}
            <span className="text-white font-medium">{email}</span>. Your
            most recent payment is already on file.
          </p>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-3xl mx-auto px-6 space-y-6">
          <div className="dashboard-card p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                You&apos;re signed in
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                Next time you visit, sign in with Google or Apple using this
                same email address and you&apos;ll land right back here.
              </p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ClaimCallout
              href="/me"
              icon={<Trophy size={18} />}
              title="View my registrations"
              body="See every event you've signed up for, plus payment status and waiver state."
            />
            <ClaimCallout
              href="/me"
              icon={<ShieldCheck size={18} />}
              title="Waiver on file"
              body="If you signed a waiver during checkout, it's already linked to your account."
            />
            <ClaimCallout
              href="/events"
              icon={<CalendarDays size={18} />}
              title="Browse upcoming events"
              body="Re-register in one click for any future tournament — we'll skip the waiver if it's still valid."
            />
            <ClaimCallout
              href="/register"
              icon={<Trophy size={18} />}
              title="Sign up for the next one"
              body="Pick your team and pay — we already have your details and your waiver."
            />
          </div>

          <div className="text-center pt-2">
            <Link
              href="/me"
              className="inline-flex items-center gap-1.5 btn-primary h-11 px-5"
            >
              Go to my account <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}

function ClaimCallout({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="dashboard-card p-5 flex items-start gap-4 hover:border-brand/40 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="text-sm text-zinc-400 mt-1">{body}</p>
      </div>
    </Link>
  );
}
