import { Section, SectionHeader } from "@/components/shared/section";
import { TournamentCard } from "@/components/shared/TournamentCard";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { getFeaturedTournaments, getPublicTournaments } from "@/lib/tournaments";
import { isOpenPlay } from "@/lib/event-kind";
import type { Tournament, TournamentStatus } from "@/lib/types";

const STATUS_SORT: Record<TournamentStatus, number> = {
  upcoming: 0,
  ongoing: 1,
  completed: 2,
  cancelled: 3,
};

function sortEventsForList(tournaments: Tournament[]): Tournament[] {
  return [...tournaments].sort((a, b) => {
    const statusDiff = STATUS_SORT[a.status] - STATUS_SORT[b.status];
    if (statusDiff !== 0) return statusDiff;
    const aTime = a.start_date ? new Date(a.start_date).getTime() : 0;
    const bTime = b.start_date ? new Date(b.start_date).getTime() : 0;
    if (a.status === "completed") return bTime - aTime;
    return aTime - bTime;
  });
}

export const dynamic = "force-dynamic";

const DEFAULT_HERO_SUBTITLE =
  "Upcoming tournaments, leagues, and open play nights at Houston Premier Soccer.";

export default async function EventsPage() {
  const { tournaments: rawTournaments, loadError: listLoadError } =
    await getPublicTournaments();
  const tournaments = sortEventsForList(rawTournaments);
  const tournamentEvents = tournaments.filter((t) => !isOpenPlay(t));
  const openPlayEvents = tournaments.filter((t) => isOpenPlay(t));
  const { loadError: featuredLoadError } = await getFeaturedTournaments();

  // Always the static line. Reusing the featured event's description here
  // printed the same paragraph twice — once as the page intro, once in that
  // event's own card directly below it.
  const heroSubtitle = DEFAULT_HERO_SUBTITLE;

  const listBanner = listLoadError;
  const featuredBanner = featuredLoadError && !listLoadError;

  return (
    <>
      {/* Hero */}
      <section className="bg-base text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Tournaments &amp; Events
          </h1>
          <p className="text-xl text-zinc-300 max-w-2xl line-clamp-3">{heroSubtitle}</p>
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

      {/*
        Split by kind. A ten-week season and a Friday pop-up night are different
        commitments, and interleaving them by date made a player read every card
        to work out which was which.

        Each section is hidden when empty rather than showing an empty state:
        there is nothing useful to say about "no open play nights scheduled", and
        a page of empty boxes reads as a broken site.
      */}
      <Section dark className="bg-surface">
        <div className="max-w-4xl mx-auto space-y-12">
          {listLoadError ? null : tournaments.length === 0 ? (
            <div className="dashboard-card border-2 border-dashed border-border-token p-10 text-center">
              <p className="text-zinc-400">No events listed yet. Check back soon!</p>
            </div>
          ) : (
            <>
              {tournamentEvents.length > 0 && (
                <div className="space-y-6">
                  <SectionHeader
                    title="Tournaments"
                    subtitle="Seasons with teams, a schedule and a league table. Upcoming first, then completed events you can still browse."
                    dark
                  />
                  {tournamentEvents.map((t) => (
                    <TournamentCard key={t.id} tournament={t} />
                  ))}
                </div>
              )}

              {openPlayEvents.length > 0 && (
                <div className="space-y-6">
                  <SectionHeader
                    title="Open play nights"
                    subtitle="One-off nights. Turn up, pay at the door or online, sides are made on the night — no season, no commitment."
                    dark
                  />
                  {openPlayEvents.map((t) => (
                    <TournamentCard key={t.id} tournament={t} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </Section>

      {/* CTA */}
      <Section dark className="bg-base">
        <div className="text-center max-w-2xl mx-auto">
          <SectionHeader
            title="Don't see your event?"
            subtitle="New tournaments go up here as we schedule them. Join the community chat for first looks and quick questions."
            align="center"
            dark
          />
          <div className="flex justify-center">
            <WhatsAppCommunityLinkFromSite
              variant="button"
              className="sm:w-auto sm:min-w-[280px]"
            />
          </div>
        </div>
      </Section>

    </>
  );
}
