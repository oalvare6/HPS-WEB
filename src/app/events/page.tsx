import Link from "next/link";
import { Section, SectionHeader } from "@/components/shared/section";
import { ArrowRight, Calendar, Clock, CreditCard, Users } from "lucide-react";
import { TournamentCard } from "@/components/shared/TournamentCard";
import { getFeaturedTournaments, getPublicTournaments } from "@/lib/tournaments";
import { formatLeagueDateLong } from "@/lib/spring-2026-league-schedule";
import {
  getEnhancedHighlight,
  getEnhancedLeagueSchedule,
} from "@/lib/league-schedule-overrides";

export const dynamic = "force-dynamic";

const DEFAULT_HERO_SUBTITLE =
  "Adult 7v7 league — Spring 2026. 8 rounds of Friday night soccer, 7–10 PM.";

export default async function EventsPage() {
  const { tournaments, loadError: listLoadError } = await getPublicTournaments();
  const { tournaments: featuredTournaments, loadError: featuredLoadError } =
    await getFeaturedTournaments();
  const featuredTournament = featuredTournaments[0] ?? null;

  const heroSource =
    featuredTournament ??
    (!listLoadError ? tournaments.find((t) => t.status === "upcoming") : undefined) ??
    (!listLoadError ? tournaments[0] : undefined);
  const heroSubtitle = heroSource?.description?.trim() || DEFAULT_HERO_SUBTITLE;

  const listBanner = listLoadError;
  const featuredBanner = featuredLoadError && !listLoadError;

  const enhancedSchedule = await getEnhancedLeagueSchedule();
  const scheduleHighlight = getEnhancedHighlight(enhancedSchedule);

  return (
    <>
      {/* Hero */}
      <section className="bg-base text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Schedule & Events
          </h1>
          <p className="text-xl text-zinc-300 max-w-2xl">{heroSubtitle}</p>
        </div>
      </section>

      {(listBanner || featuredBanner) && (
        <div className="bg-surface border-b border-border-token">
          <div className="max-w-4xl mx-auto px-6 py-4">
            {listBanner && (
              <p
                role="alert"
                className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
              >
                {listBanner}
              </p>
            )}
            {featuredBanner && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
              >
                {featuredLoadError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tournaments */}
      <Section dark className="bg-surface border-b border-border-token">
        <div className="max-w-4xl mx-auto space-y-6">
          {listLoadError ? null : tournaments.length === 0 ? (
            <div className="dashboard-card border-2 border-dashed border-border-token p-10 text-center">
              <p className="text-zinc-400">No upcoming events. Check back soon!</p>
            </div>
          ) : (
            tournaments.map((t) => <TournamentCard key={t.id} tournament={t} />)
          )}
        </div>
      </Section>

      {/* Schedule Section */}
      <Section dark className="bg-surface bg-topo-lines" id="schedule">
        <SectionHeader
          title="Adult 7v7 — Spring 2026 Schedule"
          subtitle="Eight Friday league nights, 7:00–10 PM Central. Dates are fixed for this season; the highlighted row follows today’s calendar (Houston time)."
          dark
        />

        <div className="dashboard-card overflow-hidden">
          <div className="p-4 border-b border-border-token flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-brand" />
              <h3 className="font-semibold text-white">Adult 7v7 League — Spring 2026</h3>
            </div>
            <div className="flex items-center gap-2 text-zinc-400 text-xs">
              <Clock size={13} />
              <span>7:00 PM – 10:00 PM Central</span>
            </div>
          </div>

          <ul className="divide-y divide-border-token">
            {enhancedSchedule.map((row, index) => {
              const current = scheduleHighlight.activeIndex === index;
              const dateLabel = formatLeagueDateLong(row.dateKey);
              const badge = current ? scheduleHighlight.badge : null;
              const cancelled = row.effectiveStatus === "cancelled";
              const rescheduled = row.effectiveStatus === "rescheduled";
              const pulse = current && scheduleHighlight.isToday && !row.special && !cancelled;
              return (
                <li
                  key={row.id}
                  className={`flex flex-col gap-1 px-6 py-4 ${current ? "bg-brand/10" : "hover:bg-surface-2/30"} ${cancelled ? "opacity-70" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {current && (
                        <div
                          className={`w-2 h-2 bg-brand rounded-full flex-shrink-0 ${pulse ? "animate-pulse" : ""}`}
                        />
                      )}
                      <span
                        className={`font-medium truncate ${cancelled ? "text-zinc-500 line-through" : row.special ? "text-zinc-400 italic" : current ? "text-brand" : "text-white"}`}
                      >
                        {row.label}
                        {row.note ? ` (${row.note})` : ""}
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
                      {badge && !cancelled && (
                        <span className="text-xs font-mono bg-brand/20 text-brand px-2 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
                          {badge}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-sm text-right pl-4 flex-shrink-0 ${cancelled ? "text-zinc-500 line-through" : row.special ? "text-zinc-500 italic" : current ? "text-brand font-semibold" : "text-zinc-400"}`}
                    >
                      {dateLabel}
                    </span>
                  </div>
                  {(row.override?.note || row.rescheduledToLabel) && (
                    <p className="text-xs text-zinc-400 ml-5">
                      {row.rescheduledToLabel && (
                        <span className="text-yellow-300 font-medium">
                          → {row.rescheduledToLabel}
                          {row.override?.note ? " · " : ""}
                        </span>
                      )}
                      {row.override?.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {scheduleHighlight.seasonComplete && (
            <p className="px-6 py-4 text-sm text-zinc-500 border-t border-border-token bg-surface-2/20">
              This Spring 2026 Friday calendar has finished. See tournaments above for current seasons and sign-ups.
            </p>
          )}
        </div>
      </Section>

      {/* Leagues Section */}
      <Section dark className="bg-surface">
        <SectionHeader
          title="Adult 7v7 League"
          subtitle="Spring 2026 — Registration and payments are open."
          dark
        />

        <div className="dashboard-card p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-surface-2 rounded-lg flex items-center justify-center flex-shrink-0">
              <Users size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">Join the Spring 2026 Season</h3>
              <p className="text-zinc-400 mb-4 max-w-xl">
                8 rounds of adult 7v7, every Friday night 7–10 PM starting March 27. Register your team or sign up as a
                free agent.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 text-white font-medium hover:text-zinc-300 transition-colors"
                >
                  Register Now
                  <ArrowRight size={18} />
                </Link>
                <Link
                  href="/pay"
                  className="inline-flex items-center gap-2 text-zinc-400 font-medium hover:text-zinc-300 transition-colors"
                >
                  Pay Entry Fee
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* CTA */}
      <Section dark className="bg-surface">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Want to Play 7v7?</h2>
          <p className="text-zinc-400 mb-8">
            Register to get updates on upcoming 7v7 leagues and tournaments. We&apos;ll notify you when registration
            opens.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="btn-primary">
              Register Now
            </Link>
            <Link href="/pay" className="btn-secondary">
              <CreditCard size={18} />
              Pay Entry Fee
            </Link>
          </div>
        </div>
      </Section>

      {/* Bottom padding for mobile fixed bar */}
      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}
