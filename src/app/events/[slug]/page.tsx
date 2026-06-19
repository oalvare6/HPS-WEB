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
  Goal,
  Handshake,
  ListOrdered,
  Medal,
  Megaphone,
  MapPin,
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
import type {
  Tournament,
  TournamentRound,
  TournamentStatus,
  TournamentUpdate,
} from "@/lib/types";
import { getPresetUrl } from "@/lib/tournament-image-presets";
import { getTournamentBannerUrl } from "@/lib/tournament-image";
import { tournamentPrimaryCta } from "@/lib/tournament-public-links";
import { summarizeText } from "@/lib/text";
import {
  getTournamentMatches,
  computeStandings,
  computeTopScorers,
} from "@/lib/tournament-matches";
import { TournamentBannerImage } from "@/components/shared/TournamentBannerImage";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { ShareTournamentButton } from "@/components/shared/ShareTournamentButton";
import { MobileTournamentCtaBar } from "@/components/shared/MobileTournamentCtaBar";
import { LocationCard } from "@/components/shared/location-card";

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
  const description = t.description
    ? summarizeText(t.description, 200)
    : `${t.title} — ${t.format ?? "7v7"} at Houston Premier Soccer. ` +
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

  const [{ updates }, { rounds }, { matches }] = await Promise.all([
    getTournamentUpdates(tournament.id),
    getTournamentRounds(tournament.id),
    getTournamentMatches(tournament.id),
  ]);

  const standings = computeStandings(matches);
  const topScorers = computeTopScorers(matches, 5);
  const playedMatches = matches
    .filter((m) => m.status === "final" || m.status === "postponed")
    .slice()
    .reverse();

  const pill = STATUS_PILL[tournament.status];
  const bannerUrl = tournament.image_url || getPresetUrl(tournament.image_preset);
  const cta = tournamentPrimaryCta(tournament);
  const showMobileCta = tournament.status !== "completed" && cta.kind !== "none";
  const timeRange =
    tournament.time_start && tournament.time_end
      ? `${tournament.time_start} – ${tournament.time_end}`
      : tournament.time_start || tournament.time_end || null;

  return (
    <>
      {/* Header strip */}
      <section className="bg-base text-white py-6 md:py-14 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors mb-3 md:mb-4"
          >
            <ArrowLeft size={14} />
            All events
          </Link>

          <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3 md:mb-4">
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

          <div className="flex items-center gap-3 mb-3 md:mb-4">
            <Trophy size={24} className="text-brand flex-shrink-0" />
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight">
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

            {/* Standings + results — only renders once matches exist */}
            {matches.length > 0 && (
              <div className="space-y-8">
                {standings.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ListOrdered size={18} className="text-brand" />
                      <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
                        Standings
                      </h2>
                    </div>
                    <div className="dashboard-card overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border-token">
                            <th className="px-4 py-3 font-medium">Team</th>
                            <th className="px-3 py-3 font-medium text-center">P</th>
                            <th className="px-3 py-3 font-medium text-center">W</th>
                            <th className="px-3 py-3 font-medium text-center">D</th>
                            <th className="px-3 py-3 font-medium text-center">L</th>
                            <th className="px-3 py-3 font-medium text-center">GD</th>
                            <th className="px-4 py-3 font-medium text-center">Pts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-token">
                          {standings.map((row, i) => (
                            <tr key={row.team_id} className={i === 0 ? "bg-brand/5" : ""}>
                              <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                                {row.team_name}
                              </td>
                              <td className="px-3 py-3 text-center text-zinc-300">{row.played}</td>
                              <td className="px-3 py-3 text-center text-zinc-300">{row.won}</td>
                              <td className="px-3 py-3 text-center text-zinc-300">{row.drawn}</td>
                              <td className="px-3 py-3 text-center text-zinc-300">{row.lost}</td>
                              <td className="px-3 py-3 text-center text-zinc-300">
                                {row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-white">
                                {row.points}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {topScorers.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Medal size={18} className="text-brand" />
                      <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
                        Top scorers
                      </h2>
                    </div>
                    <ul className="dashboard-card divide-y divide-border-token overflow-hidden">
                      {topScorers.map((s, i) => (
                        <li
                          key={`${s.team_id}-${s.player_name}`}
                          className="px-5 py-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-mono text-zinc-500 w-5 flex-shrink-0">
                              {i + 1}
                            </span>
                            <span className="font-medium text-white truncate">{s.player_name}</span>
                            <span className="text-xs text-zinc-500 truncate">{s.team_name}</span>
                          </div>
                          <span className="text-sm font-semibold text-brand flex-shrink-0">
                            {s.goals} {s.goals === 1 ? "goal" : "goals"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {playedMatches.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Goal size={18} className="text-brand" />
                      <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
                        Results
                      </h2>
                    </div>
                    <ul className="space-y-3">
                      {playedMatches.map((m) => (
                        <li key={m.id} className="dashboard-card p-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 text-sm flex-wrap">
                              <span className="font-medium text-white">{m.home_team_name}</span>
                              {m.status === "final" ? (
                                <span className="font-mono text-brand">
                                  {m.home_score} – {m.away_score}
                                </span>
                              ) : (
                                <span className="text-xs font-mono uppercase tracking-wider text-yellow-300">
                                  Postponed
                                </span>
                              )}
                              <span className="font-medium text-white">{m.away_team_name}</span>
                            </div>
                            <span className="text-xs text-zinc-500 flex-shrink-0">
                              {formatRoundDate(m.match_date)}
                            </span>
                          </div>
                          {m.goals.length > 0 && (
                            <p className="text-xs text-zinc-400 mt-2">
                              {m.goals.map((g) => `${g.player_name} ${g.goals}`).join(" · ")}
                            </p>
                          )}
                          {m.notes && (
                            <p className="text-xs text-zinc-500 mt-1 italic">{m.notes}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

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

              {tournament.location && <LocationCard compact />}
            </div>
          </aside>
        </div>
      </section>

      {/* Spacer so content can scroll clear of the fixed mobile CTA bar */}
      {showMobileCta && <div className="h-20 md:hidden" />}
      <MobileTournamentCtaBar show={showMobileCta} cta={cta} />
    </>
  );
}
