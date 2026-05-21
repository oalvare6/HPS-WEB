"use client";

import { useEffect, useState, use } from "react";
import { Loader2 } from "lucide-react";
import { Section } from "@/components/shared/section";
import { TournamentForm } from "@/components/admin/TournamentForm";
import { TournamentRoundsPanel } from "@/components/admin/TournamentRoundsPanel";
import { TournamentUpdatesPanel } from "@/components/admin/TournamentUpdatesPanel";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import type { Tournament } from "@/lib/types";
import { fetchTournamentById } from "@/lib/admin-tournaments";

export default function EditTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return <EditContent id={id} />;
}

function EditContent({ id }: { id: string }) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchTournamentById(id)
      .then((result) => {
        if (cancelled) return;
        if (result.error || !result.data) {
          setError(result.error ?? "Failed to load tournament.");
          setTournament(null);
        } else {
          setTournament(result.data);
          setError("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <Breadcrumbs
            items={[
              { label: "Admin", href: "/admin" },
              { label: "Tournaments", href: "/admin/tournaments" },
              {
                label: tournament?.title ?? "Tournament",
                href: tournament ? `/admin/tournaments/${tournament.id}` : undefined,
              },
              { label: "Edit" },
            ]}
          />
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-3 mb-2">
            Edit Tournament
          </h1>
          {tournament && <p className="text-zinc-400">{tournament.title}</p>}
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-4xl mx-auto px-6 space-y-6">
          {loading && (
            <div className="flex items-center gap-3 text-zinc-400 py-8">
              <Loader2 size={24} className="animate-spin" />
              <span>Loading tournament…</span>
            </div>
          )}
          {error && <p className="text-red-400">{error}</p>}
          {!loading && tournament && (
            <>
              <TournamentForm initial={tournament} />
              <TournamentRoundsPanel tournamentId={tournament.id} />
              <TournamentUpdatesPanel tournamentId={tournament.id} />
            </>
          )}
        </div>
      </Section>
    </>
  );
}
