import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarDays,
  Calendar,
  Clock,
  CreditCard,
  Flag,
  Handshake,
  Megaphone,
  MapPin,
  Pin,
  Shield,
  Sprout,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import {
  getTournamentBySlug,
  getTournamentMatches,
  getTournamentRounds,
  getTournamentUpdates,
} from "@/lib/tournaments";
import { computeStandings, computeTopScorers } from "@/lib/standings";
import {
  getWorldCupStandingsOverride,
  WORLD_CUP_STANDINGS_CAPTION,
  WORLD_CUP_STANDINGS_FOOTNOTE,
} from "@/lib/world-cup-standings";
import { getWorldCupScorersOverride } from "@/lib/world-cup-scorers";
import { WORLD_CUP_TOURNAMENT_SLUG } from "@/lib/world-cup-pricing";
import type {
  Tournament,
  TournamentRound,
  TournamentStatus,
  TournamentUpdate,
} from "@/lib/types";
import { TournamentHub } from "@/components/tournament/TournamentHub";
import { getPresetUrl } from "@/lib/tournament-image-presets";
import { getTournamentBannerUrl } from "@/lib/tournament-image";
import { tournamentPrimaryCta } from "@/lib/tournament-public-links";
import { TournamentBannerImage } from "@/components/shared/TournamentBannerImage";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { ShareTournamentButton } from "@/components/shared/ShareTournamentButton";
import { LocationCard } from "@/components/shared/location-card";

export const dynamic = "force-dynamic";

/**
 * Generic playbook shown on every tournament page, condensed to a facts strip
 * so it frames the event without dominating the page above the scores.
 */
const TOURNAMENT_FACTS: { icon: typeof Sprout; label: string }[] = [
  { icon: Sprout, label: "Real grass field" },
  { icon: Timer, label: "25-minute halves" },
  { icon: Flag, label: "Refs on every match" },
  { icon: Shield, label: "Cleats required" },
  { icon: Handshake, label: "No slide tackling" },
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

function formatRoundDate(iso: string | null): string {
  if (!iso) return "Date TBA";
  // YYYY-MM-DD comes from a date column; build it as a local date so the day
  // doesn't shift backwards in negative-UTC time zones.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTournamentBySlug(slug);
  if (!t) return { title: "Tournament not found" };

  const title = `${t.title} | Houston Premier Soccer`;
  const description =
    t.description?.slice(0, 200)?.trim() ||
    `${t.title} — ${t.format ?? "7v7"} at Houston Premier Soccer. ` +
      `Real grass field, 25-min halves, refs on every match, MVP awards at the end.`;

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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const [{ updates }, { rounds }, { matches, teams }] = await Promise.all([
    getTournamentUpdates(tournament.id),
    getTournamentRounds(tournament.id),
    getTournamentMatches(tournament.id),
  ]);

  const hasHub = matches.length > 0;
  const isWorldCup = tournament.slug === WORLD_CUP_TOURNAMENT_SLUG;
  const standings = hasHub
    ? isWorldCup
      ? getWorldCupStandingsOverride(teams)
      : computeStandings(teams, matches)
    : [];
  // World Cup scorers publish the operator's list verbatim (with unresolved
  // jersey-number rows split out); everything else aggregates match scorers.
  const scorersOverride = hasHub && isWorldCup ? getWorldCupScorersOverride(teams) : null;
  const topScorers = hasHub
    ? scorersOverride?.ranked ?? computeTopScorers(matches)
    : [];

  const pill = STATUS_PILL[tournament.status];
  const bannerUrl = tournament.image_url || getPresetUrl(tournament.image_preset);
  const cta = tournamentPrimaryCta(tournament);
  const timeRange =
    tournament.time_start && tournament.time_end
      ? `${tournament.time_start} – ${tournament.time_end}`
      : tournament.time_start || tournament.time_end || null;
  const showMobileCta = tournament.status !== "completed" && cta.kind !== "none";

  const aboutSection = (
    <div>
      <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider font-semibold mb-3">
        About this tournament
      </h2>
      {tournament.description ? (
        <p className="text-zinc-200 leading-relaxed whitespace-pre-wrap">
          {tournament.description}
        </p>
      ) : (
        <p className="text-sm text-zinc-400">
          Full details land here soon — schedule, format, and everything worth
          knowing before matchday.
        </p>
      )}
    </div>
  );

  const factsSection = (
    <div className="dashboard-card px-4 py-3.5 sm:px-5">
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-300">
        {TOURNAMENT_FACTS.map((f) => {
          const Icon = f.icon;
          return (
            <li key={f.label} className="flex items-center gap-1.5">
              <Icon size={14} className="text-zinc-500 flex-shrink-0" />
              <span>{f.label}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 pt-2.5 border-t border-border-token/50 flex items-center gap-1.5 text-xs text-zinc-400">
        <Award size={13} className="text-brand flex-shrink-0" />
        <span>
          <span className="text-zinc-200">Golden Boot</span> for most goals ·{" "}
          <span className="text-zinc-200">Golden Glove</span> for most saves —
          tracked live across every match.
        </span>
      </p>
    </div>
  );

  const updatesSection = (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Megaphone size={18} className="text-brand" />
        <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider font-semibold">
          Updates
        </h2>
        {updates.length > 0 && (
          <span className="text-xs text-zinc-500">
            {updates.length} {updates.length === 1 ? "post" : "posts"}
          </span>
        )}
      </div>
      {updates.length === 0 ? (
        <div className="dashboard-card p-6 text-center border-dashed">
          <p className="text-sm font-semibold text-white">Nothing posted yet</p>
          <p className="mt-1 text-sm text-zinc-400">
            Announcements show up here as the tournament gets closer.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {updates.map((u: TournamentUpdate) => (
            <li
              key={u.id}
              className={`dashboard-card p-5 ${u.pinned ? "border-brand/50" : ""}`}
            >
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
              <p className="text-sm md:text-base text-zinc-100 whitespace-pre-wrap">
                {u.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const hubSection = hasHub ? (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays size={18} className="text-brand" />
        <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider font-semibold">
          Schedule &amp; standings
        </h2>
      </div>
      <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
        Scores update through the tournament. Schedule subject to change —
        updates are posted here and pushed to our{" "}
        <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false}>
          WhatsApp community
        </WhatsAppCommunityLinkFromSite>
        .
      </p>
      <Suspense fallback={null}>
        <TournamentHub
          matches={matches}
          rounds={rounds}
          standings={standings}
          topScorers={topScorers}
          unconfirmedScorers={scorersOverride?.unconfirmed}
          standingsCaption={isWorldCup ? WORLD_CUP_STANDINGS_CAPTION : undefined}
          standingsFootnote={isWorldCup ? WORLD_CUP_STANDINGS_FOOTNOTE : undefined}
        />
      </Suspense>
    </div>
  ) : null;

  const roundsFallback =
    !hasHub && rounds.length > 0 ? (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={18} className="text-brand" />
          <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider font-semibold">
            Schedule
          </h2>
          <span className="text-xs text-zinc-500">
            {rounds.length} {rounds.length === 1 ? "round" : "rounds"}
          </span>
        </div>
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
          Schedule subject to change. Any updates will be posted on this page
          and pushed to our{" "}
          <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false}>
            WhatsApp community
          </WhatsAppCommunityLinkFromSite>
          .
        </p>
        <ul className="dashboard-card divide-y divide-border-token overflow-hidden">
          {rounds.map((r: TournamentRound) => {
            const cancelled = r.status === "cancelled";
            const rescheduled = r.status === "rescheduled";
            const roundTimeRange =
              r.time_start && r.time_end
                ? `${r.time_start} – ${r.time_end}`
                : r.time_start || r.time_end || null;
            return (
              <li key={r.id} className={`px-5 py-4 ${cancelled ? "opacity-70" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`font-medium truncate ${
                        cancelled
                          ? "text-zinc-500 line-through"
                          : r.status === "note"
                            ? "text-zinc-300"
                            : "text-white"
                      }`}
                    >
                      {r.label}
                    </span>
                    {cancelled && (
                      <span className="text-xs font-mono bg-red-500/20 text-red-300 px-2 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
                        Cancelled
                      </span>
                    )}
                    {rescheduled && (
                      <span className="text-xs font-mono bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
                        Rescheduled
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-sm text-right pl-4 flex-shrink-0 ${
                      cancelled ? "text-zinc-500 line-through" : "text-zinc-300"
                    }`}
                  >
                    {formatRoundDate(r.round_date)}
                  </span>
                </div>
                {(roundTimeRange || r.note || (rescheduled && r.rescheduled_to)) && (
                  <div className="text-xs text-zinc-400 mt-1 space-x-2">
                    {roundTimeRange && <span>{roundTimeRange}</span>}
                    {rescheduled && r.rescheduled_to && (
                      <span className="text-yellow-300">
                        → {formatRoundDate(r.rescheduled_to)}
                      </span>
                    )}
                    {r.note && <span>· {r.note}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  return (
    <>
      {/* Hero: status, title, meta, and the one primary action. The tactical
          grid texture lives here and only here. */}
      <section className="bg-base text-white py-10 md:py-14 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 py-2 text-sm text-zinc-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft size={14} />
            All events
          </Link>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider font-semibold border ${pill.cls}`}
            >
              <span className={`w-1.5 h-1.5 ${pill.dot} rounded-full ${tournament.status === "upcoming" || tournament.status === "ongoing" ? "animate-pulse" : ""}`} />
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

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
            {tournament.title}
          </h1>

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

          {tournament.status !== "completed" && cta.kind !== "none" && (
            <div className="mt-6">
              <Link
                href={cta.href}
                className="btn-primary inline-flex min-h-11 text-sm"
              >
                {cta.kind === "pay" ? <CreditCard size={15} /> : <Trophy size={15} />}
                {cta.label}
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Banner image — portrait flyers render full poster via TournamentBannerImage */}
      {bannerUrl && (
        <div className="bg-base py-6 md:py-8">
          <div className="max-w-6xl mx-auto px-6">
            <TournamentBannerImage tournament={tournament} variant="hero" priority />
          </div>
        </div>
      )}

      {/* Main content: scores first when the tournament is live, then the
          story sections; sticky CTA aside on desktop. */}
      <section className="bg-surface text-white py-10 md:py-14">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
          <div className="lg:col-span-2 space-y-10 min-w-0">
            {hasHub ? (
              <>
                {hubSection}
                {aboutSection}
                {factsSection}
                {updatesSection}
              </>
            ) : (
              <>
                {aboutSection}
                {factsSection}
                {updatesSection}
                {roundsFallback}
              </>
            )}
          </div>

          {/* Sticky CTA card */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-28 space-y-4">
              <div className="dashboard-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Trophy size={18} className="text-brand" />
                  <h3 className="text-base font-semibold text-white">
                    {tournament.status === "completed" ? "Past event" : "Take part"}
                  </h3>
                </div>
                {tournament.status === "completed" ? (
                  <p className="text-sm text-zinc-400">
                    This tournament has ended. Schedules and updates stay here
                    so you can reference what we ran.
                  </p>
                ) : cta.kind !== "none" ? (
                  <>
                    <Link
                      href={cta.href}
                      className="btn-primary w-full min-h-11 justify-center text-sm"
                    >
                      {cta.kind === "pay" ? <CreditCard size={14} /> : <Trophy size={14} />}
                      {cta.label}
                      <ArrowRight size={14} />
                    </Link>
                    <ShareTournamentButton
                      title={tournament.title}
                      description={tournament.description}
                      path={`/events/${tournament.slug}`}
                      variant="secondary"
                    />
                    <p className="text-center text-xs text-zinc-500 pt-1">
                      <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false}>
                        Questions? Join WhatsApp
                      </WhatsAppCommunityLinkFromSite>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-zinc-400">
                      Registration isn&apos;t open right now — watch this page
                      or the WhatsApp community for the announcement.
                    </p>
                    <ShareTournamentButton
                      title={tournament.title}
                      description={tournament.description}
                      path={`/events/${tournament.slug}`}
                      variant="secondary"
                    />
                  </>
                )}
                {tournament.entry_fee != null && (
                  <p className="text-xs text-zinc-500 text-center pt-1 border-t border-border-token/50">
                    Entry fee: ${Number(tournament.entry_fee).toFixed(2)}
                    {tournament.max_teams != null && ` · Max ${tournament.max_teams} teams`}
                  </p>
                )}
              </div>

              {tournament.location && <LocationCard compact />}
            </div>
          </aside>
        </div>
      </section>

      {/* Mobile: the primary action rides along at the bottom of the screen */}
      {showMobileCta && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border-token bg-surface/95 backdrop-blur-sm px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Link href={cta.href} className="btn-primary w-full min-h-12 justify-center text-sm">
            {cta.kind === "pay" ? <CreditCard size={16} /> : <Trophy size={16} />}
            {cta.label}
            <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {/* Bottom padding so the fixed mobile bar never covers content */}
      {showMobileCta && <div className="h-24 md:hidden bg-surface" />}
    </>
  );
}
