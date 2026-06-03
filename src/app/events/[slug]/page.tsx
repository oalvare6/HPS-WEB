import Link from "next/link";
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
  Navigation,
  Pin,
  Shield,
  Sparkles,
  Sprout,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import {
  getTournamentBySlug,
  getTournamentRounds,
  getTournamentUpdates,
} from "@/lib/tournaments";
import { getSiteSetting } from "@/lib/site-settings";
import type {
  Tournament,
  TournamentRound,
  TournamentStatus,
  TournamentUpdate,
} from "@/lib/types";
import { getPresetUrl } from "@/lib/tournament-image-presets";
import { getTournamentBannerUrl } from "@/lib/tournament-image";
import { tournamentPrimaryCta } from "@/lib/tournament-public-links";
import { TournamentBannerImage } from "@/components/shared/TournamentBannerImage";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { ShareTournamentButton } from "@/components/shared/ShareTournamentButton";

export const dynamic = "force-dynamic";

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
    title: "30-minute halves",
    body: "Full 60 minutes of football. Not pickup — real games, real clock.",
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
  {
    icon: Trophy,
    title: "Live scores tracked",
    body: "Goals, assists, and saves logged through every match.",
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
      `Real grass field, 30-min halves, refs on every match, MVP awards at the end.`;

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

  const [{ updates }, { rounds }, mapsUrl] = await Promise.all([
    getTournamentUpdates(tournament.id),
    getTournamentRounds(tournament.id),
    getSiteSetting("footer.maps_url"),
  ]);

  const pill = STATUS_PILL[tournament.status];
  const bannerUrl = tournament.image_url || getPresetUrl(tournament.image_preset);
  const cta = tournamentPrimaryCta(tournament);
  const timeRange =
    tournament.time_start && tournament.time_end
      ? `${tournament.time_start} – ${tournament.time_end}`
      : tournament.time_start || tournament.time_end || null;

  return (
    <>
      {/* Header strip */}
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

          <div className="flex items-center gap-3 mb-4">
            <Trophy size={28} className="text-brand flex-shrink-0" />
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
            {/* About */}
            <div>
              <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold mb-3">
                About this tournament
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

            {/* What to expect — generic tournament playbook, same every event */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={18} className="text-brand" />
                <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
                  What you&apos;re walking into
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TOURNAMENT_FEATURES.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.title}
                      className="dashboard-card p-4 flex gap-3 items-start"
                    >
                      <div className="w-10 h-10 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
                        <Icon size={18} className="text-brand" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">
                          {feature.title}
                        </p>
                        <p className="text-xs text-zinc-400 leading-relaxed mt-0.5">
                          {feature.body}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 dashboard-card border-brand/30 bg-brand/5 p-4 flex gap-3 items-start">
                <div className="w-10 h-10 rounded-lg bg-brand/15 border border-brand/40 flex items-center justify-center flex-shrink-0">
                  <Award size={18} className="text-brand" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    MVP awards at the final whistle
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed mt-0.5">
                    <span className="text-white">Golden Boot</span> for most goals.{" "}
                    <span className="text-white">Golden Glove</span> for most saves.
                    Stats tracked live across every match.
                  </p>
                </div>
              </div>
            </div>

            {/* Updates feed */}
            <div>
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
              {updates.length === 0 ? (
                <div className="dashboard-card p-6 text-center text-zinc-500 text-sm border-dashed">
                  No updates yet. Check back as the tournament gets closer.
                </div>
              ) : (
                <ul className="space-y-3">
                  {updates.map((u: TournamentUpdate) => (
                    <li
                      key={u.id}
                      className={`dashboard-card p-5 ${
                        u.pinned ? "border-brand/50" : ""
                      }`}
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

            {/* Schedule (rounds) */}
            {rounds.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CalendarDays size={18} className="text-brand" />
                  <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
                    Schedule
                  </h2>
                  <span className="text-xs text-zinc-500">
                    {rounds.length} {rounds.length === 1 ? "round" : "rounds"}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 italic mb-4 leading-relaxed">
                  Schedule subject to change. Any updates will be posted on this
                  page and pushed to our{" "}
                  <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false}>
                    WhatsApp community
                  </WhatsAppCommunityLinkFromSite>
                  .
                </p>
                <ul className="dashboard-card divide-y divide-border-token overflow-hidden">
                  {rounds.map((r: TournamentRound) => {
                    const cancelled = r.status === "cancelled";
                    const rescheduled = r.status === "rescheduled";
                    const timeRange =
                      r.time_start && r.time_end
                        ? `${r.time_start} – ${r.time_end}`
                        : r.time_start || r.time_end || null;
                    return (
                      <li
                        key={r.id}
                        className={`px-5 py-4 ${cancelled ? "opacity-70" : ""}`}
                      >
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
                        {(timeRange || r.note || (rescheduled && r.rescheduled_to)) && (
                          <div className="text-xs text-zinc-400 mt-1 space-x-2">
                            {timeRange && <span>{timeRange}</span>}
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
                      className="btn-primary w-full justify-center text-sm"
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
                    <p className="text-sm text-zinc-400 italic">
                      Registration isn&apos;t open right now. Watch this page
                      for updates.
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

              {tournament.location && (
                <div className="dashboard-card p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={18} className="text-brand" />
                    <h3 className="text-base font-semibold text-white">Location</h3>
                  </div>
                  <p className="text-sm text-zinc-300">{tournament.location}</p>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary w-full justify-center text-sm"
                  >
                    <Navigation size={14} />
                    Get Directions
                  </a>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      {/* Bottom padding for mobile fixed bar */}
      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}
