import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarDays,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Flag,
  Handshake,
  Megaphone,
  MapPin,
  PenLine,
  Pin,
  Shield,
  Sparkles,
  Sprout,
  Timer,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import {
  getTournamentBySlug,
  getTournamentMatches,
  getTournamentRounds,
  getTournamentUpdates,
  getTournamentsByIds,
} from "@/lib/tournaments";
import { parseFreeEntryTournamentIds } from "@/lib/open-play-free-entry";
import { computeStandings, computeTopScorers } from "@/lib/standings";
import { groupMatchesByRound, openRoundKeys } from "@/lib/schedule";
import { getWorldCupStandingsOverride } from "@/lib/world-cup-standings";
import { WORLD_CUP_TOURNAMENT_SLUG } from "@/lib/world-cup-pricing";
import type {
  Tournament,
  TournamentStatus,
  TournamentUpdate,
} from "@/lib/types";
import { TournamentHub } from "@/components/tournament/TournamentHub";
import { AtAGlance } from "@/components/tournament/AtAGlance";
import { MatchList } from "@/components/tournament/MatchList";
import { MobileDisclosure } from "@/components/tournament/MobileDisclosure";
import { ShowMoreItems } from "@/components/tournament/ShowMoreItems";
import { parseHubTab } from "@/components/tournament/hub-tab";
import { OpenPlayAttendees } from "@/components/tournament/OpenPlayAttendees";
import { getOpenPlayAttendees } from "@/lib/open-play-attendance";
import { getPresetUrl } from "@/lib/tournament-image-presets";
import { getTournamentBannerUrl } from "@/lib/tournament-image";
import {
  viewerEventCta,
  type ViewerEventCta,
} from "@/lib/tournament-public-links";
import { loadEventStanding } from "@/lib/event-standing";
import { eventKindCopy, isOpenPlay } from "@/lib/event-kind";
import { getCurrentPlayer } from "@/lib/player-auth";
import { resolveEventState } from "@/lib/tournament-state";
import { TournamentBannerImage } from "@/components/shared/TournamentBannerImage";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { ShareTournamentButton } from "@/components/shared/ShareTournamentButton";
import { LocationCard } from "@/components/shared/location-card";

export const dynamic = "force-dynamic";

/** How many unpinned posts show before "Show all N updates" on a live page. */
const RECENT_UPDATES_SHOWN = 2;

/**
 * Generic playbook shown on every tournament page. Pulled out so a single edit
 * propagates to every event, and so the description field stays free for the
 * one-off vibe of each tournament.
 */
const TOURNAMENT_FEATURES: {
  icon: typeof Sprout;
  title: string;
  body: string;
}[] = [
  {
    icon: Sprout,
    title: "Real grass field",
    body: "Natural turf under the lights. Game-day feel, no rug burn.",
  },
  {
    icon: Timer,
    title: "25-minute halves",
    body: "Full 50 minutes of football. Not pickup — real games, real clock.",
  },
  {
    icon: Flag,
    title: "Refs on every match",
    body: "Centre referee on the field for every game. Every goal counts.",
  },
  {
    icon: Shield,
    title: "Cleats required",
    body: "Bring your boots. Shin guards optional but recommended.",
  },
  {
    icon: Handshake,
    title: "Friendly play — no slide tackling",
    body: "Competitive, but keep it on the ball. We're here to play.",
  },
];

/**
 * The open-play equivalent. Same shape, different promises.
 *
 * The tournament list above is a *season's* pitch — refs on every match, a
 * clock, MVP awards at the final whistle. Shown on a Friday pop-up night it
 * describes something that isn't happening: there is no final whistle to give a
 * Golden Boot at, and no table for the result to land in.
 */
const OPEN_PLAY_FEATURES: {
  icon: typeof Sprout;
  title: string;
  body: string;
}[] = [
  {
    icon: Sprout,
    title: "Real grass field",
    body: "Natural turf under the lights. Same pitch we run tournaments on.",
  },
  {
    icon: Clock,
    title: "One night, turn up and play",
    body: "No season, no commitment. Come for the evening and go home.",
  },
  {
    icon: Users,
    title: "Sides made on the night",
    body: "We split teams when everyone's here. Come alone or bring friends.",
  },
  {
    icon: Shield,
    title: "Cleats required",
    body: "Bring your boots. Shin guards optional but recommended.",
  },
  {
    icon: Handshake,
    title: "Friendly play — no slide tackling",
    body: "Competitive, but keep it on the ball. We're here to play.",
  },
];

const STATUS_PILL: Record<TournamentStatus, { text: string; cls: string; dot: string }> = {
  upcoming: {
    text: "Upcoming",
    cls: "text-brand bg-brand/10 border-brand/20",
    dot: "bg-brand",
  },
  ongoing: {
    text: "Ongoing",
    cls: "text-green-400 bg-green-500/10 border-green-500/20",
    dot: "bg-green-400",
  },
  completed: {
    text: "Completed",
    cls: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    dot: "bg-zinc-500",
  },
  cancelled: {
    text: "Cancelled",
    cls: "text-red-400 bg-red-500/10 border-red-500/20",
    dot: "bg-red-400",
  },
};

function formatDateRow(t: Tournament): string {
  if (t.recurrence) return t.recurrence;
  if (!t.start_date) return "Date TBA";
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  };
  const s = new Date(t.start_date).toLocaleDateString("en-US", opts);
  if (t.end_date) {
    const e = new Date(t.end_date).toLocaleDateString("en-US", opts);
    return `${s} – ${e}`;
  }
  return s;
}

function formatUpdateDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** One icon vocabulary for the CTA card, so the header and the button agree. */
function CtaIcon({
  cta,
  size = 18,
  openPlay = false,
}: {
  cta: ViewerEventCta;
  size?: number;
  openPlay?: boolean;
}) {
  if (cta.kind === "pay") return <CreditCard size={size} className="text-brand" />;
  if (cta.kind === "waiver") return <PenLine size={size} className="text-amber-400" />;
  if (cta.kind === "none" && cta.personalised)
    return <CheckCircle2 size={size} className="text-emerald-400" />;
  if (openPlay) return <Zap size={size} className="text-brand" />;
  return <Trophy size={size} className="text-brand" />;
}

/** The amber "could not load" strip, same markup as the events list page. */
function LoadErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
    >
      {message}
    </p>
  );
}

function UpdateItem({ u }: { u: TournamentUpdate }) {
  return (
    <li className={`dashboard-card p-5 ${u.pinned ? "border-brand/50" : ""}`}>
      <div className="flex items-center justify-between gap-3 mb-2 text-xs">
        <div className="flex items-center gap-2">
          {u.pinned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand/15 text-brand font-semibold uppercase tracking-wide">
              <Pin size={10} />
              Pinned
            </span>
          )}
          <span className="text-zinc-500">{formatUpdateDate(u.created_at)}</span>
        </div>
      </div>
      <p className="text-sm md:text-base text-zinc-100 whitespace-pre-wrap">{u.body}</p>
    </li>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTournamentBySlug(slug);
  if (!t) return { title: "Event not found" };

  const title = `${t.title} | Houston Premier Soccer`;
  // The fallback blurb has to match what the event actually is — the tournament
  // version promises refs, 25-minute halves and live scores, none of which a
  // one-off open play night has. It promises only what the page can show.
  const description =
    t.description?.slice(0, 200)?.trim() ||
    (isOpenPlay(t)
      ? `${t.title} — ${t.format ?? "7v7"} open play at Houston Premier Soccer. ` +
        `Real grass field under the lights, one night, sides made on the night.`
      : `${t.title} — ${t.format ?? "7v7"} at Houston Premier Soccer. ` +
        `Real grass field, 25-min halves, refs on every match, live scores and standings.`);

  // Link-preview image: tournament banner first (custom upload or preset),
  // fall back to the brand badge so iMessage / WhatsApp / Twitter always
  // get something to render a rich card. Relative URLs are resolved against
  // metadataBase (set in src/app/layout.tsx).
  const bannerUrl = getTournamentBannerUrl(t);
  const ogImage = bannerUrl ?? "/brand/hps-badge.png";
  const ogImageIsBadge = !bannerUrl;
  const canonicalPath = `/events/${t.slug}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website",
      url: canonicalPath,
      siteName: "Houston Premier Soccer",
      title,
      description,
      images: [
        {
          url: ogImage,
          // Square badge fallback uses square dims; banners use a standard
          // landscape ratio. Crawlers honor whatever we declare and crop.
          width: ogImageIsBadge ? 512 : 1200,
          height: ogImageIsBadge ? 512 : 630,
          alt: t.title,
        },
      ],
    },
    twitter: {
      card: ogImageIsBadge ? "summary" : "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function TournamentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ slug }, { tab }] = await Promise.all([params, searchParams]);
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const [
    { updates },
    { rounds, loadError: roundsLoadError },
    { matches, teams, loadError: matchesLoadError },
    attendees,
    freeEntryEvents,
  ] = await Promise.all([
    getTournamentUpdates(tournament.id),
    getTournamentRounds(tournament.id),
    getTournamentMatches(tournament.id),
    // Added to the existing Promise.all rather than awaited after it: this is
    // the most-visited page on the site and it is force-dynamic, so a fourth
    // serial round trip would be paid on every view. The query returns an
    // empty list for anything that is not an open-play night, so asking
    // unconditionally costs one cheap call and keeps the branch out of here.
    getOpenPlayAttendees(tournament.id),
    // Which tournaments confer free entry to this night — display only, so a
    // signed-out visitor can see the deal exists. Zero queries for anything
    // that is not an open play night with a non-empty config.
    getTournamentsByIds(
      isOpenPlay(tournament)
        ? parseFreeEntryTournamentIds(tournament.free_entry_tournament_ids)
        : []
    ),
  ]);

  const openPlay = isOpenPlay(tournament);
  const kindCopy = eventKindCopy(tournament);

  // A schedule that failed to load is said out loud, not rendered as "no
  // matches yet". Open play has no schedule to fail, so nothing to say there.
  const hubLoadError = openPlay ? null : (roundsLoadError ?? matchesLoadError);

  // No standings, no top scorers, no schedule grid for a single evening — even
  // if stray match rows exist against it, a league table for one night is a
  // table of one row and reads as a mistake.
  const hasHub = !openPlay && matches.length > 0;
  // The World Cup table is published from the flyer, not computed; the hub
  // treats those rows as opaque (no re-sorting, no cut line).
  const standingsSource =
    tournament.slug === WORLD_CUP_TOURNAMENT_SLUG ? "published" : "computed";
  const standings = hasHub
    ? standingsSource === "published"
      ? getWorldCupStandingsOverride(teams)
      : computeStandings(teams, matches, rounds)
    : [];
  const topScorers = hasHub ? computeTopScorers(matches) : { rows: [], ownGoals: 0 };
  // Every round in season order (empty ones too). Feeds the at-a-glance card
  // on a live page and the pre-season round list otherwise.
  const groups = openPlay ? [] : groupMatchesByRound(rounds, matches);
  const initialTab = parseHubTab(tab);

  const pill = STATUS_PILL[tournament.status];
  const bannerUrl = tournament.image_url || getPresetUrl(tournament.image_preset);

  /*
    The CTA is answered for *this visitor*, not just for the event.

    Until now `tournamentPrimaryCta` read two boolean flags on the tournament
    and nothing about who was looking, so a player who had signed up, picked a
    team and signed their waiver still saw "Sign up to play" — the operator's
    report: "it still says register even though I am registered." The only way
    to find out what was actually left was to press it and read the next screen.

    No DocuSeal reconcile here, deliberately. `/register` and `/pay` ask
    DocuSeal directly because they are about to hold a player at a gate; this
    page only routes them there, and it is the most-visited page on the site.
    See lib/event-standing.ts.
  */
  const player = await getCurrentPlayer();
  const standing = player
    ? await loadEventStanding({ event: tournament, contact: player.contact })
    : null;

  const cta = viewerEventCta({
    tournament,
    state: standing?.state ?? null,
    teamName: standing?.teamName ?? null,
    entryFeeLabel: standing?.entryFeeLabel ?? null,
    isFinished: resolveEventState(tournament) === "finished",
  });
  const timeRange =
    tournament.time_start && tournament.time_end
      ? `${tournament.time_start} – ${tournament.time_end}`
      : tournament.time_start || tournament.time_end || null;

  // Pinned posts plus the two most recent show at once on a live page; the rest
  // sit behind one button. The loader already orders pinned first, then newest.
  const shownUpdates: TournamentUpdate[] = [];
  const hiddenUpdates: TournamentUpdate[] = [];
  let recentShown = 0;
  for (const u of updates) {
    if (u.pinned) shownUpdates.push(u);
    else if (recentShown < RECENT_UPDATES_SHOWN) {
      shownUpdates.push(u);
      recentShown += 1;
    } else hiddenUpdates.push(u);
  }

  /* ---------------------------------------------------------------- blocks */

  const aboutBlock = (
    <div>
      <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold mb-3">
        {kindCopy.aboutHeading}
      </h2>
      {tournament.description ? (
        <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap">
          {tournament.description}
        </p>
      ) : (
        <p className="text-zinc-500 italic">
          More details coming soon. Check back for the full rundown.
        </p>
      )}
    </div>
  );

  const featuresHeading = (
    <span className="flex items-center gap-2 min-w-0">
      <Sparkles size={18} className="text-brand flex-shrink-0" />
      <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
        What you&apos;re walking into
      </h2>
    </span>
  );

  const featuresBody = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(openPlay ? OPEN_PLAY_FEATURES : TOURNAMENT_FEATURES).map((feature) => {
          const Icon = feature.icon;
          return (
            <div key={feature.title} className="dashboard-card p-4 flex gap-3 items-start">
              <div className="w-10 h-10 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-brand" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{feature.title}</p>
                <p className="text-xs text-zinc-400 leading-relaxed mt-0.5">{feature.body}</p>
              </div>
            </div>
          );
        })}
      </div>
      {/*
        Season-long awards. An open play night has no final whistle to give
        them at and no stats carried anywhere, so promising them would be
        describing an event that isn't happening. Only what the site tracks is
        promised: goals.
      */}
      {!openPlay && (
        <div className="mt-4 dashboard-card border-brand/30 bg-brand/5 p-4 flex gap-3 items-start">
          <div className="w-10 h-10 rounded-lg bg-brand/15 border border-brand/40 flex items-center justify-center flex-shrink-0">
            <Award size={18} className="text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">MVP awards at the final whistle</p>
            <p className="text-xs text-zinc-300 leading-relaxed mt-0.5">
              <span className="text-white">Golden Boot</span> for most goals. Live
              top-scorer table across every match.
            </p>
          </div>
        </div>
      )}
    </>
  );

  const updatesHeading = (
    <div className="flex items-center gap-2 mb-4">
      <Megaphone size={18} className="text-brand" />
      <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
        Updates
      </h2>
      {updates.length > 0 && (
        <span className="text-xs text-zinc-500">
          {updates.length} {updates.length === 1 ? "post" : "posts"}
        </span>
      )}
    </div>
  );

  const updatesEmpty = (
    <div className="dashboard-card p-6 text-center text-zinc-500 text-sm border-dashed">
      No updates yet. Check back as the {kindCopy.noun} gets closer.
    </div>
  );

  const ctaCard = (
    <div
      className={`dashboard-card p-5 space-y-3 ${cta.personalised ? "border-brand/40" : ""}`}
    >
      <div className="flex items-center gap-2">
        <CtaIcon cta={cta} openPlay={openPlay} />
        <h3 className="text-base font-semibold text-white">{cta.heading}</h3>
      </div>

      {/*
        `note` is what turns a button into an answer: which team you're
        on, what you still owe, whether you already told us you're
        paying cash. Without it "Pay $80 now" is the same sentence the
        site showed a total stranger.
      */}
      {cta.note && <p className="text-sm text-zinc-300">{cta.note}</p>}

      {cta.kind === "none" && !cta.note && (
        <p className="text-sm text-zinc-400 italic">
          {cta.heading === "Past event"
            ? "This event has ended. Schedules and updates stay here so you can reference what we ran."
            : "Registration isn't open right now. Watch this page for updates."}
        </p>
      )}

      {cta.kind !== "none" && cta.href && cta.label && (
        <Link href={cta.href} className="btn-primary w-full justify-center text-sm">
          <CtaIcon cta={cta} size={14} openPlay={openPlay} />
          {cta.label}
          <ArrowRight size={14} />
        </Link>
      )}

      {/*
        No `path`: the button shares the URL as it stands, so a link copied
        from the Table tab opens on the Table tab.
      */}
      <ShareTournamentButton
        title={tournament.title}
        description={tournament.description}
        variant="secondary"
        shareNoun={kindCopy.noun}
      />

      {cta.href && (
        <p className="text-center text-xs text-zinc-500 pt-1">
          <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false}>
            Questions? Join WhatsApp
          </WhatsAppCommunityLinkFromSite>
        </p>
      )}
      {tournament.entry_fee != null && (
        <p className="text-xs text-zinc-500 text-center pt-1 border-t border-border-token/50">
          {kindCopy.feeLabel}: ${Number(tournament.entry_fee).toFixed(2)}
          {!openPlay &&
            tournament.max_teams != null &&
            ` · Max ${tournament.max_teams} teams`}
        </p>
      )}
      {/*
        Display only — /api/register/join re-derives the entitlement at
        write time; this line just makes the deal visible signed-out.
      */}
      {openPlay && freeEntryEvents.length > 0 && (
        <p className="text-xs text-emerald-300/90 text-center pt-1">
          Free for{" "}
          {freeEntryEvents.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <Link
                href={`/events/${t.slug}`}
                className="underline underline-offset-2 hover:text-white"
              >
                {t.title}
              </Link>
            </span>
          ))}{" "}
          players — sign in to claim your free spot.
        </p>
      )}
    </div>
  );

  const asideInner = (
    <div className="lg:sticky lg:top-28 space-y-4">
      {ctaCard}
      {tournament.location && <LocationCard compact />}
    </div>
  );

  const scheduleNote = (
    <p className="text-xs text-zinc-400 italic leading-relaxed">
      Scores update through the tournament. Schedule subject to change —
      updates are posted here and pushed to our{" "}
      <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false}>
        WhatsApp community
      </WhatsAppCommunityLinkFromSite>
      .
    </p>
  );

  const header = (
    <section className="bg-base text-white py-10 md:py-14 bg-tactical-grid">
      <div className="max-w-6xl mx-auto px-6">
        <Link
          href="/events"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          All events
        </Link>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider font-semibold border ${pill.cls}`}
          >
            <span
              className={`w-1.5 h-1.5 ${pill.dot} rounded-full ${
                tournament.status === "upcoming" || tournament.status === "ongoing"
                  ? "animate-pulse"
                  : ""
              }`}
            />
            {pill.text}
          </span>
          {tournament.registration_open && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider font-semibold bg-brand-deep text-white border border-brand">
              Registration Open
            </span>
          )}
          {tournament.payments_open && tournament.status !== "completed" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider font-semibold bg-surface-2 text-brand border border-brand/30">
              Payments Open
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mb-4">
          {openPlay ? (
            <Zap size={28} className="text-brand flex-shrink-0" />
          ) : (
            <Trophy size={28} className="text-brand flex-shrink-0" />
          )}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
            {tournament.title}
          </h1>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-300">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-brand" />
            <span>{formatDateRow(tournament)}</span>
          </div>
          {timeRange && (
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-brand" />
              <span>{timeRange}</span>
            </div>
          )}
          {tournament.format && (
            <div className="flex items-center gap-2">
              <Users size={14} className="text-brand" />
              <span>{tournament.format}</span>
            </div>
          )}
          {tournament.location && (
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-brand" />
              <span>{tournament.location}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );

  /* ---------------------------------------------- live tournament: scores first */

  if (hasHub) {
    /*
      Single column on a phone, in this order: at a glance, the hub, the
      sign-up / share card, about, the playbook (collapsed), updates, the flyer.
      On lg the same three DOM blocks land in a two-column grid: the aside is
      pinned to column 3 spanning both rows, the two main blocks fill columns
      1-2 above and below. Nothing is rendered twice.
    */
    return (
      <>
        {header}

        <section className="bg-surface text-white py-6 md:py-14">
          <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            <div className="lg:col-span-2 space-y-6">
              <AtAGlance
                groups={groups}
                standings={standings}
                standingsSource={standingsSource}
              />

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays size={16} className="text-brand" />
                  <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
                    Schedule &amp; standings
                  </h2>
                </div>
                <div className="mb-3">{scheduleNote}</div>
                {hubLoadError && (
                  <div className="mb-3">
                    <LoadErrorBanner message={hubLoadError} />
                  </div>
                )}
                <TournamentHub
                  matches={matches}
                  rounds={rounds}
                  standings={standings}
                  standingsSource={standingsSource}
                  topScorers={topScorers}
                  initialTab={initialTab}
                />
              </div>
            </div>

            <aside className="lg:col-start-3 lg:row-start-1 lg:row-span-2">{asideInner}</aside>

            <div className="lg:col-span-2 space-y-10">
              {aboutBlock}

              <MobileDisclosure summary={featuresHeading}>
                <div className="mt-4">{featuresBody}</div>
              </MobileDisclosure>

              <div>
                {updatesHeading}
                {updates.length === 0 ? (
                  updatesEmpty
                ) : (
                  <ul className="space-y-3">
                    {shownUpdates.map((u) => (
                      <UpdateItem key={u.id} u={u} />
                    ))}
                    {hiddenUpdates.length > 0 && (
                      <ShowMoreItems label={`Show all ${updates.length} updates`}>
                        {hiddenUpdates.map((u) => (
                          <UpdateItem key={u.id} u={u} />
                        ))}
                      </ShowMoreItems>
                    )}
                  </ul>
                )}
              </div>

              {/* The flyer, last: on a phone a portrait poster is a full screen
                  and cannot sit above the scores. Smaller than the hero frame. */}
              {bannerUrl && (
                <div>
                  <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold mb-3">
                    Flyer
                  </h2>
                  <div className="max-w-md mx-auto">
                    <TournamentBannerImage tournament={tournament} variant="hero" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </>
    );
  }

  /* -------------------------------- open play and pre-season: today's order */

  return (
    <>
      {header}

      {/* Banner image — portrait flyers render full poster via TournamentBannerImage */}
      {bannerUrl && (
        <div className="bg-base py-6 md:py-8">
          <div className="max-w-6xl mx-auto px-6">
            <TournamentBannerImage tournament={tournament} variant="hero" priority />
          </div>
        </div>
      )}

      {/* Main content: description + sticky aside */}
      <section className="bg-surface text-white py-10 md:py-14">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
          <div className="lg:col-span-2 space-y-10">
            {aboutBlock}

            {/* What to expect — generic playbook, same every event */}
            <div>
              <div className="mb-4">{featuresHeading}</div>
              {featuresBody}
            </div>

            {/* Updates feed */}
            <div>
              {updatesHeading}
              {updates.length === 0 ? (
                updatesEmpty
              ) : (
                <ul className="space-y-3">
                  {updates.map((u) => (
                    <UpdateItem key={u.id} u={u} />
                  ))}
                </ul>
              )}
            </div>

            {/* Who's coming — open play only. Sits in the wide column where a
                tournament shows its schedule and table, because for a one-night
                event this *is* "what's happening here". */}
            {openPlay && <OpenPlayAttendees attendees={attendees} />}

            {/* The schedule failed to load: say so where it would have been. */}
            {hubLoadError && <LoadErrorBanner message={hubLoadError} />}

            {/* Pre-season: the rounds exist, no match does yet. Same round
                headers the live hub uses, each saying fixtures are to come.
                One night has one date, already in the header, so open play
                shows nothing here. */}
            {!openPlay && !hubLoadError && rounds.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays size={16} className="text-brand" />
                  <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
                    Schedule
                  </h2>
                  <span className="text-xs text-zinc-500">
                    {rounds.length} {rounds.length === 1 ? "round" : "rounds"}
                  </span>
                </div>
                <div className="mb-3">{scheduleNote}</div>
                <MatchList groups={groups} openKeys={openRoundKeys(groups)} />
              </div>
            )}
          </div>

          {/* Sticky CTA card */}
          <aside className="lg:col-span-1">{asideInner}</aside>
        </div>
      </section>
    </>
  );
}
