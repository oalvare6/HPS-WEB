"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Section } from "@/components/shared/section";
import { AdminGate } from "@/components/admin/AdminGate";
import { TournamentForm } from "@/components/admin/TournamentForm";
import type { Tournament } from "@/lib/types";

export default function EditTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <AdminGate>
      <EditContent id={id} />
    </AdminGate>
  );
}

function EditContent({ id }: { id: string }) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/tournaments/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setTournament(data.tournament);
      })
      .catch(() => setError("Failed to load tournament."))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <Link
            href="/admin/tournaments"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            ← Back to tournaments
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-3 mb-2">
            Edit Tournament
          </h1>
          {tournament && <p className="text-zinc-400">{tournament.title}</p>}
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-4xl mx-auto px-6">
          {loading && (
            <div className="flex items-center gap-3 text-zinc-400 py-8">
              <Loader2 size={24} className="animate-spin" />
              <span>Loading tournament…</span>
            </div>
          )}
          {error && <p className="text-red-400">{error}</p>}
          {!loading && tournament && <TournamentForm initial={tournament} />}
        </div>
      </Section>
    </>
  );
}
