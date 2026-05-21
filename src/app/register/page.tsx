import { Section, SectionHeader } from "@/components/shared/section";
import {
  RegistrationForm,
  type RegistrationPrefill,
} from "@/components/register/RegistrationForm";
import { getRegistrationOpenTournaments } from "@/lib/tournaments";
import { getCurrentPlayer } from "@/lib/player-auth";
import { isContactWaiverValid } from "@/lib/contacts";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ tournament?: string }>;

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tournament: preselected = null } = await searchParams;
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
            Register for 7v7 Tournament
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Sign up for upcoming 7v7 leagues and tournaments at Houston Premier Soccer.
          </p>
        </div>
      </section>

      <Section dark className="bg-surface">
        <div className="max-w-2xl mx-auto">
          <SectionHeader
            title="Player Registration"
            subtitle={
              prefill
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
            preselectedSlug={preselected}
            prefill={prefill}
          />
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}
