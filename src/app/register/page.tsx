import Link from "next/link";
import { CalendarDays, MapPin, Trophy } from "lucide-react";
import { Section } from "@/components/shared/section";
import {
  RegistrationForm,
  type RegistrationPrefill,
} from "@/components/register/RegistrationForm";
import { QuickJoinCard } from "@/components/register/QuickJoinCard";
import {
  AlreadyPaidCard,
  ClosedCard,
  NeedsWaiverCard,
  OwesPaymentCard,
} from "@/components/register/SignupStatusCards";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import {
  getRegistrationOpenTournaments,
  getTeamsByTournament,
  getTournamentBySlug,
} from "@/lib/tournaments";
import { getCurrentPlayer } from "@/lib/player-auth";
import { isContactWaiverValid } from "@/lib/contacts";
import { createPayResumeToken } from "@/lib/app-signing";
import { buildPayResumePath, buildWaiverSignPath } from "@/lib/pay-resume-url";
import { acceptsRegistrations } from "@/lib/tournament-state";
import { eventKindCopy } from "@/lib/event-kind";
import { reconcileIfUnsigned } from "@/lib/waiver-reconcile";
import {
  findEventRegistration,
  loadEventStanding,
} from "@/lib/event-standing";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import type { Tournament } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ tournament?: string; type?: string }>;

/**
 * The one front door for signing up to anything.
 *
 * There used to be two. A tournament page with `payments_open` sent every
 * visitor to `/pay`, which asked for an email and — for anyone it did not
 * recognise — told them to sign a waiver and bounced them here, to a different
 * screen with a different vocabulary. Same event, two screens, and a loop
 * between them. REBUILD-PLAN §6 describes one flow per person; this is it.
 *
 * The screen reads who you are and shows exactly one of five things. What it
 * never does is ask a returning player to fill in a form we already hold.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tournament: slug = null, type: typeParam } = await searchParams;

  const [{ tournaments: openTournaments }, player] = await Promise.all([
    getRegistrationOpenTournaments(),
    getCurrentPlayer(),
  ]);

  const contact = player?.contact ?? null;

  // Which event are we talking about? An explicit slug wins. Failing that, if
  // exactly one event is open there is nothing to choose — presenting a
  // one-item dropdown was part of what made this screen feel like paperwork.
  const requested = slug ? await getTournamentBySlug(slug) : null;
  const event: Tournament | null =
    requested ?? (openTournaments.length === 1 ? openTournaments[0] : null);

  if (!event) {
    return (
      <SignupShell
        title="Sign up to play"
        subtitle="Pick an event and we'll take it from there."
      >
        <EventPicker tournaments={openTournaments} />
      </SignupShell>
    );
  }

  const canRegister = acceptsRegistrations(event);

  let registration = contact
    ? await findEventRegistration(event.id, contact.id)
    : null;

  // Before telling anyone to sign a waiver, check whether they already signed
  // it. `waiver_signed` is only as current as the last webhook we received, and
  // the DocuSeal webhook was answering 503 to every delivery for weeks — so a
  // player who signed correctly was sent back here and told to sign again. Ask
  // DocuSeal instead of trusting our own column. See lib/waiver-reconcile.ts.
  let resumeSignUrl: string | null = null;
  if (registration && !registration.waiver_signed) {
    const reconciled = await reconcileIfUnsigned(registration);
    if (reconciled?.changed) {
      registration = { ...registration, waiver_signed: true };
    } else {
      resumeSignUrl = reconciled?.signUrl ?? null;
    }
  }

  /*
    Resolved through the shared module so this screen and the event page can
    never disagree about the same person. The reconciled row is passed back in
    as an override — without it, a player who has just this second signed with
    DocuSeal would be resolved from the stale column and told to sign again,
    which is the exact loop this screen exists to end.
  */
  const { state, teamName, entryFeeLabel } = await loadEventStanding({
    event,
    contact,
    waiverTypeParam: typeParam,
    registrationOverride: registration,
  });

  const teams = canRegister ? (await getTeamsByTournament([event.id]))[event.id] ?? [] : [];

  return (
    <SignupShell
      title={state.kind === "closed" ? event.title : `Sign up — ${event.title}`}
      subtitle={eventSubtitle(event)}
      event={event}
    >
      {state.kind === "closed" && <ClosedCard tournamentTitle={event.title} />}

      {state.kind === "already_paid" && (
        <AlreadyPaidCard
          tournamentTitle={event.title}
          tournamentId={event.id}
          teams={teams}
          teamId={state.teamId}
          teamName={teamName}
          registrationId={state.registrationId}
          payToken={createPayResumeToken(state.registrationId)}
        />
      )}

      {state.kind === "needs_waiver" && (
        <NeedsWaiverCard
          tournamentTitle={event.title}
          /*
            Resume the submission they already have rather than minting a second
            one. Creating a fresh DocuSeal submission on every visit is how a
            player ends up with three half-signed documents and we still can't
            tell whether they signed. Falls back to in-app signing when this
            registration never got a DocuSeal submission at all.
          */
          waiverHref={
            resumeSignUrl ??
            buildWaiverSignPath({
              registrationId: state.registrationId,
              payToken: createPayResumeToken(state.registrationId),
              tournamentSlug: event.slug,
            })
          }
          isExternalWaiver={Boolean(resumeSignUrl)}
          recheckHref={`/register?tournament=${encodeURIComponent(event.slug)}`}
        />
      )}

      {state.kind === "owes_payment" && (
        <OwesPaymentCard
          tournamentTitle={event.title}
          tournamentId={event.id}
          entryFeeLabel={entryFeeLabel}
          teams={teams}
          teamId={state.teamId}
          teamName={teamName}
          payingCash={state.payingCash}
          registrationId={state.registrationId}
          payToken={createPayResumeToken(state.registrationId)}
          payHref={buildPayResumePath({
            registrationId: state.registrationId,
            payToken: createPayResumeToken(state.registrationId),
            tournamentSlug: event.slug,
          })}
        />
      )}

      {state.kind === "quick_join" && (
        <QuickJoinCard
          tournamentId={event.id}
          tournamentTitle={event.title}
          teams={teams}
          playerName={displayName(contact)}
          waiverExpiresAt={contact?.waiver_expires_at ?? null}
          entryFeeLabel={entryFeeLabel}
          /*
            Kind only chooses words and panels here — never whether the event
            sells or opens. "Door price" and no team picker on a Friday night
            whose own page promises "sides made on the night"; "Entry fee" and
            the picker on a season. See lib/event-kind.ts.
          */
          feeLabel={eventKindCopy(event).feeLabel}
          showTeams={eventKindCopy(event).hasTeams}
          whenLabel={eventWhenLabel(event)}
        />
      )}

      {state.kind === "full_signup" && (
        <div className="space-y-8">
          {!player && <SignedInFasterPrompt slug={event.slug} />}
          <RegistrationForm
            tournaments={[
              {
                id: event.id,
                title: event.title,
                slug: event.slug,
                format: event.format,
              },
            ]}
            teamsByTournament={{ [event.id]: teams }}
            preselectedSlug={event.slug}
            preselectedType={typeParam === "youth" ? "youth" : typeParam === "adult" ? "adult" : null}
            prefill={buildPrefill(player)}
            entryFeeLabel={entryFeeLabel}
            lockedToEvent
          />
        </div>
      )}

      <p className="mt-8 text-center text-xs text-zinc-500">
        Questions?{" "}
        <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false} />
      </p>
    </SignupShell>
  );
}

/* ------------------------------------------------------------------ */

function displayName(
  contact: { first_name?: string | null; last_name?: string | null } | null
): string {
  if (!contact) return "";
  return `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
}

function buildPrefill(
  player: Awaited<ReturnType<typeof getCurrentPlayer>>
): RegistrationPrefill | null {
  if (!player) return null;
  const c = player.contact;
  return {
    email: player.email,
    firstName: c.first_name ?? "",
    lastName: c.last_name ?? "",
    phone: c.phone ?? "",
    dob: c.dob ?? "",
    emergencyName: c.emergency_name ?? "",
    emergencyPhone: c.emergency_phone ?? "",
    hasAdultWaiverOnFile: isContactWaiverValid(c, "adult"),
    hasYouthWaiverOnFile: isContactWaiverValid(c, "youth"),
  };
}

/**
 * "Friday, August 14 · 7:00 PM – 9:00 PM" — what the player is confirming.
 *
 * `recurrence` wins when set ("Games are every Friday, starting August 21st"),
 * because for a season that is the honest answer and a single start date is not.
 * Returns null when we have neither; the confirm card just omits the line rather
 * than printing "Date TBA" over a spot somebody is committing to.
 */
function eventWhenLabel(event: Tournament): string | null {
  const day = event.recurrence
    ? event.recurrence
    : event.start_date
      ? new Date(event.start_date).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : null;

  const time =
    event.time_start && event.time_end
      ? `${event.time_start} – ${event.time_end}`
      : event.time_start || event.time_end || null;

  if (day && time) return `${day} · ${time}`;
  return day ?? time ?? null;
}

function eventSubtitle(event: Tournament): string {
  const bits: string[] = [];
  if (event.format) bits.push(event.format);
  if (event.recurrence) bits.push(event.recurrence);
  else if (event.start_date) bits.push(formatEventDate(event.start_date));
  if (event.location) bits.push(event.location);
  return bits.join(" · ");
}

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */

function SignupShell({
  title,
  subtitle,
  event,
  children,
}: {
  title: string;
  subtitle: string;
  event?: Tournament;
  children: React.ReactNode;
}) {
  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-3">
            <Trophy size={26} className="text-brand flex-shrink-0" />
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
              {title}
            </h1>
          </div>
          {subtitle && <p className="text-lg text-zinc-400 max-w-2xl">{subtitle}</p>}
          {event && (
            <Link
              href={`/events/${event.slug}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors underline underline-offset-2"
            >
              Event details
            </Link>
          )}
        </div>
      </section>

      <Section dark className="bg-surface">
        <div className="max-w-2xl mx-auto">{children}</div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}

/**
 * Signed-out players are offered sign-in, not required to use it. Requiring an
 * account before you can sign up would be a new wall in front of the one thing
 * the business needs to happen — REBUILD-PLAN §2 records 28 accounts against 90
 * people, so most players have never had one and do not need one to play.
 */
function SignedInFasterPrompt({ slug }: { slug: string }) {
  return (
    <div className="dashboard-card p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">
          Played with us before?
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Sign in and we&apos;ll skip straight to your team and payment — no form,
          and no waiver if yours is still valid.
        </p>
      </div>
      <OAuthButtons nextPath={`/register?tournament=${encodeURIComponent(slug)}`} />
      <p className="text-xs text-zinc-500 text-center">
        New here? Just fill in the form below — no account needed.
      </p>
    </div>
  );
}

function EventPicker({ tournaments }: { tournaments: Tournament[] }) {
  if (tournaments.length === 0) {
    return <ClosedCard tournamentTitle={null} />;
  }

  return (
    <div className="space-y-3">
      {tournaments.map((t) => (
        <Link
          key={t.id}
          href={`/register?tournament=${encodeURIComponent(t.slug)}`}
          className="dashboard-card p-5 flex items-start gap-4 hover:border-brand/50 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
            <Trophy size={18} className="text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-white">{t.title}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
              {(t.recurrence || t.start_date) && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={12} className="text-brand" />
                  {t.recurrence ?? formatEventDate(t.start_date!)}
                </span>
              )}
              {t.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={12} className="text-brand" />
                  {t.location}
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
