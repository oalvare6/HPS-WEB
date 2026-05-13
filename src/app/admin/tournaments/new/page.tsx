"use client";

import Link from "next/link";
import { Section } from "@/components/shared/section";
import { TournamentForm } from "@/components/admin/TournamentForm";

export default function NewTournamentPage() {
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
            New Tournament
          </h1>
          <p className="text-zinc-400">Create a new tournament or event.</p>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-4xl mx-auto px-6">
          <TournamentForm initial={null} />
        </div>
      </Section>
    </>
  );
}
