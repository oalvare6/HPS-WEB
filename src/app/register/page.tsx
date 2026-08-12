import { Section, SectionHeader } from "@/components/shared/section";
import {
  RegistrationForm,
  type RegistrationPrefill,
} from "@/components/register/RegistrationForm";
import { getRegistrationOpenTournaments, getTeamsByTournament } from "@/lib/tournaments";
import { getCurrentPlayer } from "@/lib/player-auth";
import { isContactWaiverValid } from "@/lib/contacts";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { WORLD_CUP_TOURNAMENT_SLUG } from "@/lib/world-cup-pricing";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ tournament?: string; type?: string }>;

function parsePreselectedType(
  raw: string | undefined
): "adult" | "youth" | null {
  if (raw === "adult" || raw === "youth") return raw;
  return null;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tournament: preselected = null, type: typeParam } = await searchParams;
  const preselectedType = parsePreselectedType(typeParam);
  const [{ tournaments, loadError }, player] = await Promise.all([
    getRegistrationOpenTournaments(),
    getCurrentPlayer(),
  ]);

  const options = tournaments.map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    format: t.format,
  }));

  // Teams are picked at signup now (D3), not at payment. Fetched here for every
  // listed event so switching the tournament dropdown doesn't cost a round-trip.
  const teamsByTournament = await getTeamsByTournament(options.map((t) => t.id));

  const isWorldCupLanding = preselected === WORLD_CUP_TOURNAMENT_SLUG;

  const prefill: RegistrationPrefill | null = player
    ? {
        email: player.email,
        firstName: player.contact.first_name ?? "",
        lastName: player.contact.last_name ?? "",
        phone: player.contact.phone ?? "",
        dob: player.contact.dob ?? "",
        emergencyName: player.contact.emergency_name ?? "",
        emergencyPhone: player.contact.emergency_phone ?? "",
        hasAdultWaiverOnFile: isContactWaiverValid(player.contact, "adult"),
        hasYouthWaiverOnFile: isContactWaiverValid(player.contact, "youth"),
      }
    : null;

  return (
    <>
      <section className="bg-base text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            {isWorldCupLanding
              ? "World Cup 7v7 Registration"
              : "Register for 7v7 Tournament"}
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            {isWorldCupLanding
              ? "Each player completes their own registration and waiver. Team payment and team name come next on the pay page."
              : "Sign up for upcoming 7v7 leagues and tournaments at Houston Premier Soccer."}
          </p>
          <p className="mt-4 text-sm text-zinc-500">
            Questions?{" "}
            <WhatsAppCommunityLinkFromSite variant="inline" showIcon={false} />
          </p>
        </div>
      </section>

      <Section dark className="bg-surface">
        <div className="max-w-2xl mx-auto">
          <SectionHeader
            title="Player Registration"
            subtitle={
              isWorldCupLanding
                ? prefill
                  ? "World Cup: one registration per player. We've pre-filled your details below."
                  : "World Cup: one registration per player. You'll sign the waiver next, then pay on the team payment page."
                : prefill
                  ? "We've pre-filled your details. Edit them if anything has changed."
                  : "Fill out the form below to register. You'll sign the waiver on the next page."
            }
            dark
          />

          {loadError && (
            <p className="text-sm text-red-400 mb-6">{loadError}</p>
          )}

          <RegistrationForm
            tournaments={options}
            teamsByTournament={teamsByTournament}
            preselectedSlug={preselected}
            preselectedType={preselectedType}
            prefill={prefill}
          />
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}
