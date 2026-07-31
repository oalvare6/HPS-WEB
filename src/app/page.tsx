import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, Trophy, Clock } from "lucide-react";
import { Section, SectionHeader } from "@/components/shared/section";
import { EventCard } from "@/components/shared/event-card";
import { LocationCard } from "@/components/shared/location-card";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { QuickActionsBar } from "@/components/layout/quick-actions-bar";
import { QroBadge } from "@/components/layout/qro-badge";
import { FeaturedTournamentCard } from "@/components/shared/FeaturedTournamentCard";
import { TournamentBannerImage } from "@/components/shared/TournamentBannerImage";
import { getTournamentBannerUrl } from "@/lib/tournament-image";
import { safeInternalLink } from "@/lib/safe-internal-link";
import {
  getFeaturedTournaments,
  getRecentEvents,
  TOURNAMENTS_LOAD_USER_MESSAGE,
} from "@/lib/tournaments";
import { getSiteSetting } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

function formatRecentEventDate(start: string | null): string {
  if (!start) return "Date TBA";
  return new Date(start).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function recentEventStatus(
  status: string
): "completed" | "upcoming" | "registration-open" {
  if (status === "upcoming") return "upcoming";
  return "completed";
}

function formatFeaturedTournamentDate(start: string | null): string {
  if (!start) return "Date TBA";
  return new Date(start).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default async function Home() {
  const [
    { tournaments: featuredTournaments, loadError: featuredLoadError },
    { tournaments: recentEvents },
    statusItems,
  ] = await Promise.all([
    getFeaturedTournaments(),
    getRecentEvents(3),
    getSiteSetting("home.status_pills"),
  ]);
  const heroTournament = featuredTournaments[0];
  const heroTournamentHref = heroTournament
    ? heroTournament.registration_open
      ? safeInternalLink(heroTournament.register_url, `/events/${heroTournament.slug}`)
      : `/events/${heroTournament.slug}`
    : "/events";
  const heroTournamentImage =
    heroTournament && getTournamentBannerUrl(heroTournament);

  return (
    <>
      {/* Quick Actions Bar */}
      <QuickActionsBar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-base text-white">
        <div className="absolute inset-0">
          <Image
            src="/community/field-hero.png"
            alt="Houston Premier Soccer field under the lights"
            fill
            className="object-cover"
            sizes="(min-width: 1280px) 1920px, 100vw"
            quality={90}
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-base/90 via-base/55 to-base/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-base/85 via-base/15 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_38%,rgba(34,211,238,0.16),transparent_30%),linear-gradient(rgba(34,211,238,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.03)_1px,transparent_1px)] bg-[length:100%_100%,56px_56px,56px_56px]" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-16 md:py-24 lg:py-28">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] gap-10 lg:gap-14 items-end">
            <div className="max-w-3xl space-y-6">
              <div className="inline-flex rounded-full bg-white p-1.5 shadow-[0_0_50px_rgba(34,211,238,0.35)] ring-2 ring-brand/45">
                <Image
                  src="/brand/hps-badge.png"
                  alt="Houston Premier Soccer"
                  width={160}
                  height={160}
                  className="h-28 w-28 rounded-full sm:h-32 sm:w-32 md:h-36 md:w-36"
                  priority
                />
              </div>

              <StatusIndicator items={statusItems} className="rounded-full border border-white/10 bg-base/50 px-4 py-2 backdrop-blur-md" />

              <div className="space-y-4">
                <h1 className="max-w-3xl text-5xl md:text-7xl lg:text-8xl font-bold leading-tight tracking-normal drop-shadow-2xl">
                  Houston <span className="text-brand drop-shadow-[0_0_22px_rgba(34,211,238,0.35)]">Premier</span> Soccer
                </h1>
                <p className="max-w-2xl text-lg md:text-xl text-zinc-200 leading-relaxed drop-shadow">
                  Competitive 7v7, bright lights, and a field built for nights your team remembers.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/register" className="btn-primary btn-shimmer group">
                  <Trophy size={18} />
                  Register for Tournament
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/events" className="btn-secondary bg-base/70 backdrop-blur-md">
                  <Calendar size={18} />
                  View Tournaments
                </Link>
              </div>
            </div>

            <div className="dashboard-card relative overflow-hidden border-brand/25 bg-base/65 shadow-2xl shadow-black/50 group">
              {heroTournament ? (
                <>
                  <Link
                    href={heroTournamentHref}
                    aria-label={`View ${heroTournament.title}`}
                    className="absolute inset-0 z-0"
                  />
                  {heroTournamentImage && (
                    <TournamentBannerImage
                      tournament={heroTournament}
                      variant="card"
                      priority
                    />
                  )}
                  <div className="p-5 space-y-4">
                    <p className="text-xs font-mono uppercase tracking-[0.24em] text-brand">
                      Featured Tournament
                    </p>
                    <div>
                      <h2 className="text-2xl font-bold text-white transition-colors group-hover:text-brand">
                        {heroTournament.title}
                      </h2>
                      <div className="mt-3 grid gap-2 text-sm text-zinc-300">
                        <div className="flex items-center gap-2">
                          <Calendar size={15} className="text-brand" />
                          <span>{formatFeaturedTournamentDate(heroTournament.start_date)}</span>
                        </div>
                        {heroTournament.recurrence && (
                          <div className="flex items-center gap-2">
                            <Clock size={15} className="text-brand" />
                            <span>{heroTournament.recurrence}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand/35 bg-brand/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors group-hover:bg-brand/20">
                      {heroTournament.registration_open ? "Register now" : "View tournament"}
                      <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </>
              ) : (
                <div className="p-5 space-y-4">
                  <p className="text-xs font-mono uppercase tracking-[0.24em] text-brand">
                    Featured Tournament
                  </p>
                  <h2 className="text-2xl font-bold text-white">Tournaments under the lights</h2>
                  <p className="text-sm leading-relaxed text-zinc-300">
                    Explore upcoming leagues, tournaments, and field events at Houston Premier Soccer.
                  </p>
                  <Link
                    href="/events"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-brand transition-colors group"
                  >
                    View schedule
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {(featuredLoadError || featuredTournaments.length > 0) && (
        <Section id="featured-tournaments" dark className="bg-base bg-tactical-grid-dense scroll-mt-24">
          <SectionHeader
            title="Featured Tournaments"
            subtitle="Upcoming competitions and registration windows."
            dark
          />
          {featuredLoadError && (
            <p
              role="alert"
              className="mb-6 rounded-lg border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
            >
              {TOURNAMENTS_LOAD_USER_MESSAGE}
            </p>
          )}
          {featuredTournaments.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              {featuredTournaments.map((tournament, index) => (
                <FeaturedTournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  imagePriority={index === 0}
                  highlighted={tournament.id === heroTournament?.id}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* What Happens Here */}
      <Section dark className="bg-surface overflow-hidden relative">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=1400&q=80"
            alt="Soccer field"
            fill
            className="object-cover opacity-[0.07]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-base/60 via-transparent to-base/60" />
        </div>

        <div className="relative">
          <SectionHeader
            title="What Happens Here"
            subtitle="Fast-paced 7v7 soccer for all ages and skill levels."
            dark
          />

          <div className="grid md:grid-cols-3 gap-6">
            <div className="dashboard-card overflow-hidden hover:border-border-token transition-colors">
              <div className="aspect-video bg-surface-2 relative">
                <Image
                  src="https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&q=80"
                  alt="Soccer tournament action"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-2">7v7 Tournaments</h3>
                <p className="text-zinc-400">
                  Weekend 7v7 competitions for youth and adult divisions. Fast-paced single-day and multi-day formats.
                </p>
                <Link
                  href="/events"
                  className="inline-flex items-center gap-1 text-white hover:text-zinc-300 text-sm font-medium mt-4 transition-colors"
                >
                  View Tournaments
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            <div className="dashboard-card overflow-hidden hover:border-border-token transition-colors">
              <div className="aspect-video bg-surface-2 relative">
                <Image
                  src="https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=600&q=80"
                  alt="Soccer league match"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-2">7v7 Leagues</h3>
                <p className="text-zinc-400">
                  Seasonal 7v7 play with consistent scheduling. Youth development and adult recreational divisions.
                </p>
                <Link
                  href="/events"
                  className="inline-flex items-center gap-1 text-white hover:text-zinc-300 text-sm font-medium mt-4 transition-colors"
                >
                  View Tournaments
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            <div className="dashboard-card overflow-hidden hover:border-border-token transition-colors">
              <div className="aspect-video bg-surface-2 relative">
                <Image
                  src="https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=600&q=80"
                  alt="Soccer field at night"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-2">Field Rentals</h3>
                <p className="text-zinc-400">
                  Book 7v7 field time for your team, training sessions, or private matches.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1 text-white hover:text-zinc-300 text-sm font-medium mt-4 transition-colors"
                >
                  Book a Field
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Past Events */}
      {recentEvents.length > 0 && (
        <Section dark className="bg-base bg-tactical-grid-dense">
          <SectionHeader
            title="Recent Events"
            subtitle="Completed tournaments and leagues."
            dark
          />

          <div className="grid md:grid-cols-3 gap-6">
            {recentEvents.map((t) => (
              <Link
                key={t.id}
                href={`/events/${t.slug}`}
                className="block hover:opacity-95 transition-opacity"
              >
                <EventCard
                  title={t.title}
                  date={formatRecentEventDate(t.start_date)}
                  division={t.format ?? "7v7"}
                  status={recentEventStatus(t.status)}
                />
              </Link>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/events"
              className="inline-flex items-center gap-2 text-zinc-400 hover:text-white font-medium transition-colors"
            >
              View all events
              <ArrowRight size={18} />
            </Link>
          </div>
        </Section>
      )}

      {/* Location Section */}
      <Section dark className="bg-surface">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <SectionHeader
              title="Find the Fields"
              subtitle="Located in South Houston."
              dark
            />
            
            <div className="space-y-6 text-zinc-300">
              <p className="leading-relaxed">
                Our facility is located at <span className="text-brand font-semibold">14062 Ambrose St</span> in Houston. Easy access from 
                I-45 and 610, with on-site parking for players and spectators.
              </p>
              
              <div className="p-4 bg-surface-2/50 rounded-lg border border-border-token/50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-brand/20 to-brand/5 rounded-lg flex items-center justify-center flex-shrink-0 border border-brand/30">
                    <Clock size={20} className="text-brand" />
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-2">Field Hours</p>
                    <div className="space-y-1 text-sm">
                      <p className="text-zinc-300">
                        <span className="text-brand font-mono">Mon-Fri:</span> 5PM - 10PM
                      </p>
                      <p className="text-zinc-300">
                        <span className="text-brand font-mono">Sat-Sun:</span> 8AM - 10PM
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Link
              href="/facility"
              className="inline-flex items-center gap-2 text-white hover:text-brand font-medium mt-6 transition-colors group"
            >
              View Facility Details
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <LocationCard />
        </div>
      </Section>

      {/* CTA Section */}
      <Section dark className="bg-base relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1400&q=80"
            alt="Soccer action"
            fill
            className="object-cover opacity-[0.07]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-base/80 via-transparent to-base/80" />
        </div>
        <div className="relative text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Ready to Play 7v7?
          </h2>
          <p className="text-zinc-400 mb-8">
            Register for upcoming 7v7 tournaments and league seasons. 
            Contact us for group rates and field rental inquiries.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="btn-primary">
              Register for Tournament
            </Link>
            <Link href="/contact" className="btn-secondary">
              Contact Us
            </Link>
          </div>
        </div>
      </Section>

      {/* Bottom padding for mobile fixed bar */}
      <div className="h-20 md:hidden bg-base" />

      {/* Site credit: homepage only */}
      <QroBadge />
    </>
  );
}
