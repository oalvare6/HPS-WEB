import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Key,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";
import { Section } from "@/components/shared/section";
import {
  getCurrentAuthUser,
  getCurrentPlayer,
  getPlayerProfileData,
  type PlayerRegistrationRow,
} from "@/lib/player-auth";
import { isContactWaiverValid } from "@/lib/contacts";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { MeProfileForm } from "./MeProfileForm";
import { getRegistrationOpenTournaments } from "@/lib/tournaments";
import { loadEventStanding } from "@/lib/event-standing";
import {
  viewerEventCta,
  type ViewerEventCta,
} from "@/lib/tournament-public-links";
import { resolveEventState } from "@/lib/tournament-state";
import { isOpenPlay } from "@/lib/event-kind";
import type { Tournament } from "@/lib/types";

export const dynamic = "force-dynamic";

type SignInMethod = {
  key: string;
  label: string;
  description: string;
};

export default async function MePage() {
  const player = await getCurrentPlayer();
  if (!player) {
    redirect("/login?next=/me");
  }

  const user = await getCurrentAuthUser();
  const signInMethods = describeSignInMethods(user);

  const { contact } = player;
  const { registrations, payments } = await getPlayerProfileData(contact.id);

  /*
    "What's next" — the answer to the question this page used to leave hanging.

    Signing in from the header lands here with no `next` path, so a first-time
    player arrived at a profile FORM and had to guess. The operator's report:
    *"they might get confused and not know where to click."*

    Every answer is resolved per event by the same `loadEventStanding` +
    `viewerEventCta` pair the event page uses, so this cannot invent a third
    opinion about where someone stands — a player already on the roster is told
    "You're all set", never "Sign up". `loadEventStanding` never calls DocuSeal,
    so this adds two cheap lookups per open event and no third-party round trip.
  */
  const { tournaments: openEvents } = await getRegistrationOpenTournaments();
  const nextSteps = await Promise.all(
    openEvents.map(async (event) => {
      const { state, teamName, entryFeeLabel } = await loadEventStanding({
        event,
        contact,
      });
      return {
        event,
        cta: viewerEventCta({
          tournament: event,
          state,
          teamName,
          entryFeeLabel,
          isFinished: resolveEventState(event) === "finished",
        }),
      };
    })
  );
  const visible = collapseSupersededRows(registrations);
  // A cancelled signup is never "current", whatever the event's calendar says —
  // listing it under Current registrations would tell the player they still hold
  // a spot they just gave up. It drops to the history below instead of
  // vanishing, so there is still a record of having signed up at all.
  const upcoming = visible.filter(
    (r) => isUpcomingStatus(r.tournament_status) && !r.cancelled_at
  );
  const past = visible.filter(
    (r) => !isUpcomingStatus(r.tournament_status) || Boolean(r.cancelled_at)
  );

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-brand mb-2">
                My account
              </p>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
                {displayName(contact.first_name, contact.last_name) || contact.email}
              </h1>
              <p className="text-zinc-400 text-sm">{contact.email}</p>
            </div>
            <SignOutButton className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-border-token rounded-lg px-3 py-2 transition-colors disabled:opacity-60" />
          </div>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-4xl mx-auto px-6 space-y-8">
          {/*
            First thing on the page, above the waiver card and the profile form.
            A player who has just signed in needs a next tap, not a form.
          */}
          {nextSteps.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
                What&apos;s next
              </h2>
              <div className="space-y-3">
                {nextSteps.map(({ event, cta }) => (
                  <NextStepCard key={event.id} event={event} cta={cta} />
                ))}
              </div>
            </section>
          )}

          <WaiverStatusCard
            waiverSignedAt={contact.waiver_signed_at}
            waiverExpiresAt={contact.waiver_expires_at}
            waiverType={contact.waiver_type}
            isValid={
              contact.waiver_type
                ? isContactWaiverValid(contact, contact.waiver_type)
                : false
            }
          />

          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
              Profile
            </h2>
            <MeProfileForm
              initialContact={{
                first_name: contact.first_name,
                last_name: contact.last_name,
                email: contact.email,
                phone: contact.phone ?? "",
                dob: contact.dob ?? "",
                emergency_name: contact.emergency_name ?? "",
                emergency_phone: contact.emergency_phone ?? "",
              }}
            />
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                Account &amp; sign-in
              </h2>
            </div>
            <SignInMethodsCard methods={signInMethods} />
          </section>

          <section id="registrations" className="scroll-mt-24">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
              Current registrations
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<Trophy size={20} className="text-zinc-500" />}
                title="No upcoming registrations"
                body="When you sign up for an upcoming event, it shows up here."
                actionHref="/register"
                actionLabel="Sign up to play"
              />
            ) : (
              <RegistrationsTable rows={upcoming} />
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
              Past registrations
            </h2>
            {past.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={20} className="text-zinc-500" />}
                title="No past registrations yet"
                body="Your history will appear here after your first event."
              />
            ) : (
              <RegistrationsTable rows={past} />
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
              Payment history
            </h2>
            {payments.length === 0 ? (
              <EmptyState
                icon={<CreditCard size={20} className="text-zinc-500" />}
                title="No payments on file"
                body="Once you complete a Stripe checkout, you'll see the receipt here."
              />
            ) : (
              <div className="dashboard-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-token text-left">
                        <th className="px-4 py-3 text-zinc-400 font-medium">
                          Date
                        </th>
                        <th className="px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">
                          For
                        </th>
                        <th className="px-4 py-3 text-zinc-400 font-medium">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-zinc-400 font-medium">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-border-token last:border-b-0"
                        >
                          <td className="px-4 py-3 text-zinc-300">
                            {formatDate(p.created_at)}
                          </td>
                          <td className="px-4 py-3 text-zinc-300 hidden sm:table-cell">
                            {p.tournament_title ?? p.tournament_name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-white font-semibold">
                            {formatCurrency(Number(p.amount), p.currency)}
                          </td>
                          <td className="px-4 py-3">
                            <PaymentStatusBadge status={p.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}

function isUpcomingStatus(status: string | null): boolean {
  return status === "upcoming" || status === "ongoing";
}

/**
 * Hide a cancelled row when the same event still has a live one.
 *
 * This exists because `cancelled_at` carries two meanings that look identical in
 * the database and must not look identical here. One is "I gave up my spot",
 * which the player did and should see. The other is "this row was a duplicate
 * and we retired it" — the dedupe in
 * `20260815001500_dedupe_registrations_and_guard.sql` retired ten of those, and
 * eight belong to people who **actually played the World Cup**. Badging that
 * "cancelled" in their own history would be the site telling them something
 * untrue about a tournament they turned up to.
 *
 * Keying on "is there still a live row for this event" rather than on a marker
 * in `notes` means there is no string to parse and nothing to keep in sync: a
 * genuine cancel with no replacement has no live sibling, so it still shows as
 * cancelled, which is right.
 *
 * Rows with no `tournament_id` (37 legacy ones exist) are always kept — a NULL
 * event is not the same event as another NULL event.
 */
function collapseSupersededRows(
  rows: PlayerRegistrationRow[]
): PlayerRegistrationRow[] {
  const eventsWithLiveRow = new Set(
    rows
      .filter((r) => !r.cancelled_at && r.tournament_id)
      .map((r) => r.tournament_id as string)
  );
  return rows.filter(
    (r) =>
      !r.cancelled_at ||
      !r.tournament_id ||
      !eventsWithLiveRow.has(r.tournament_id)
  );
}

function displayName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

function WaiverStatusCard({
  waiverSignedAt,
  waiverExpiresAt,
  waiverType,
  isValid,
}: {
  waiverSignedAt: string | null;
  waiverExpiresAt: string | null;
  waiverType: "adult" | "youth" | null;
  isValid: boolean;
}) {
  if (!waiverSignedAt || !waiverType) {
    return (
      <div className="dashboard-card p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-yellow-500/10 text-yellow-400 flex items-center justify-center shrink-0">
          <ShieldAlert size={18} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">
            Waiver not on file
          </h3>
          <p className="text-sm text-zinc-400 mt-1">
            You&apos;ll be asked to sign the appropriate waiver the next time you
            register.
          </p>
        </div>
      </div>
    );
  }

  if (isValid) {
    return (
      <div className="dashboard-card p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <ShieldCheck size={18} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">
            {waiverType === "adult" ? "Adult waiver" : "Youth waiver"} on file
          </h3>
          <p className="text-sm text-zinc-400 mt-1">
            Signed {formatDate(waiverSignedAt)}.{" "}
            {waiverExpiresAt && (
              <>Expires {formatDate(waiverExpiresAt)}.</>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-card p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
        <ShieldAlert size={18} />
      </div>
      <div>
        <h3 className="text-base font-semibold text-white">Waiver expired</h3>
        <p className="text-sm text-zinc-400 mt-1">
          Your {waiverType} waiver{" "}
          {waiverExpiresAt ? <>expired {formatDate(waiverExpiresAt)}.</> : null}{" "}
          You&apos;ll be asked to re-sign on your next registration.
        </p>
      </div>
    </div>
  );
}

function RegistrationsTable({ rows }: { rows: PlayerRegistrationRow[] }) {
  return (
    <div className="dashboard-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-token text-left">
              <th className="px-4 py-3 text-zinc-400 font-medium">Event</th>
              <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">
                Registered
              </th>
              <th className="px-4 py-3 text-zinc-400 font-medium">Type</th>
              <th className="px-4 py-3 text-zinc-400 font-medium">Payment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border-token last:border-b-0"
              >
                <td className="px-4 py-3 text-white">
                  {r.tournament_slug ? (
                    <Link
                      href={`/events/${r.tournament_slug}`}
                      className="hover:text-brand"
                    >
                      {r.tournament_title ?? "Untitled event"}
                    </Link>
                  ) : (
                    r.tournament_title ?? "Unlinked event"
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">
                  {formatDate(r.created_at)}
                </td>
                <td className="px-4 py-3 text-zinc-300 capitalize">
                  {r.registration_type}
                </td>
                <td className="px-4 py-3">
                  {/*
                    Cancelled outranks the payment badge. "pending" beside a spot
                    they gave up reads as money still owed, which is the one
                    thing cancelling was supposed to settle.
                  */}
                  {r.cancelled_at ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-zinc-500/20 text-zinc-400">
                      <XCircle size={12} />
                      cancelled
                    </span>
                  ) : (
                    <PaymentStatusBadge status={r.payment_status} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const classes =
    status === "paid" || status === "succeeded"
      ? "bg-brand/20 text-brand"
      : status === "pending"
        ? "bg-yellow-500/20 text-yellow-400"
        : status === "waived"
          ? "bg-zinc-500/20 text-zinc-300"
          : "bg-red-500/20 text-red-400";
  const Icon =
    status === "paid" || status === "succeeded" ? CheckCircle2 : ShieldAlert;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${classes}`}
    >
      <Icon size={12} />
      {status}
    </span>
  );
}

/**
 * One open event, and the one thing this player should do about it.
 *
 * The words come entirely from `viewerEventCta`, which is a pure projection of
 * `SignupState`. Nothing is decided here — if this card ever disagrees with the
 * event page about the same person, the bug is upstream of it, which is the
 * whole point of routing both through one resolver.
 */
function NextStepCard({
  event,
  cta,
}: {
  event: Tournament;
  cta: ViewerEventCta;
}) {
  const settled = cta.kind === "none" && cta.personalised;
  return (
    <div
      className={`dashboard-card p-5 space-y-3 ${
        settled ? "" : "border-brand/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            settled
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-brand/15 text-brand"
          }`}
        >
          {settled ? (
            <CheckCircle2 size={20} />
          ) : isOpenPlay(event) ? (
            <Zap size={20} />
          ) : (
            <Trophy size={20} />
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold text-white">{event.title}</p>
          <p className="text-sm text-zinc-400">
            {cta.note ?? cta.heading}
          </p>
        </div>
      </div>

      {cta.kind !== "none" && cta.href && cta.label && (
        <Link
          href={cta.href}
          className="btn-primary w-full justify-center text-sm"
        >
          {cta.label}
          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  actionHref,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="dashboard-card p-6 text-center">
      <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center mx-auto mb-3">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="text-sm text-zinc-400 mt-1">{body}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-block mt-4 text-sm text-brand hover:underline"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * Render the player's connected sign-in methods from `user.identities[]`.
 *
 * Sign-in is Google only now (D5, narrowed 2026-08-14). An account created
 * before that — every one of the 28 in production, all provider `email` —
 * still shows its email identity here, because it is genuinely still attached
 * to the account and is what Supabase matches on when the same person signs in
 * with Google. The description says so rather than offering a way to use it,
 * since there no longer is one.
 *
 * Apple is still matched below even though the button is gone. Nobody in
 * production has an Apple identity (the provider was never configured), but if
 * one ever existed it is still a real way into the account and hiding it would
 * make this list lie about how the account can be reached.
 */
function describeSignInMethods(
  user: Awaited<ReturnType<typeof getCurrentAuthUser>>
): SignInMethod[] {
  const identities =
    user && Array.isArray(user.identities) ? user.identities : [];

  const methods: SignInMethod[] = [];

  if (identities.some((i) => i.provider === "google")) {
    methods.push({
      key: "google",
      label: "Google",
      description: "Sign in with your Google account.",
    });
  }

  if (identities.some((i) => i.provider === "apple")) {
    methods.push({
      key: "apple",
      label: "Apple",
      description: "Sign in with your Apple ID.",
    });
  }

  if (identities.some((i) => i.provider === "email")) {
    methods.push({
      key: "email-password",
      label: `Email (${user?.email ?? "on file"})`,
      description:
        "Your account is linked to this address. Sign in with Google using the same address to reach it.",
    });
  }

  if (methods.length === 0) {
    methods.push({
      key: "google",
      label: "Google",
      description: "Sign in with Google to connect a provider.",
    });
  }

  return methods;
}

function SignInMethodsCard({ methods }: { methods: SignInMethod[] }) {
  return (
    <div className="dashboard-card overflow-hidden">
      <ul className="divide-y divide-border-token">
        {methods.map((m) => (
          <li
            key={m.key}
            className="flex items-start gap-3 px-5 py-4"
          >
            <div className="w-9 h-9 rounded-lg bg-surface-2 text-brand flex items-center justify-center shrink-0">
              <SignInMethodIcon methodKey={m.key} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{m.label}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{m.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignInMethodIcon({ methodKey }: { methodKey: string }) {
  if (methodKey === "email-password") return <Key size={16} />;
  if (methodKey === "google" || methodKey === "apple")
    return <ShieldCheck size={16} />;
  return <Mail size={16} />;
}
