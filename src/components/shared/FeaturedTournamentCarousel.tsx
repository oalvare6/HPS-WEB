"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Tournament } from "@/lib/types";
import { FeaturedTournamentCard } from "@/components/shared/FeaturedTournamentCard";

const ROTATE_INTERVAL_MS = 6000;

export function FeaturedTournamentCarousel({
  tournaments,
}: {
  tournaments: Tournament[];
}) {
  const count = tournaments.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const indexRef = useRef(0);
  indexRef.current = index;

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      const normalized = ((next % count) + count) % count;
      setIndex(normalized);
    },
    [count]
  );
  const next = useCallback(() => goTo(indexRef.current + 1), [goTo]);
  const prev = useCallback(() => goTo(indexRef.current - 1), [goTo]);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = window.setInterval(() => {
      next();
    }, ROTATE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, paused, next]);

  // Reset to first slide if the data shrinks under our current index.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  if (count === 0) return null;
  if (count === 1) {
    return <FeaturedTournamentCard tournament={tournaments[0]} imagePriority />;
  }

  const current = tournaments[index];

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured tournaments"
    >
      <div key={current.id} aria-live="polite">
        <FeaturedTournamentCard tournament={current} imagePriority={index === 0} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={prev}
          aria-label="Previous featured tournament"
          className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-surface-2/80 hover:bg-surface-2 text-zinc-300 hover:text-white border border-border-token transition-colors"
        >
          <ChevronLeft size={18} />
        </button>

        <div
          role="tablist"
          aria-label="Choose featured tournament"
          className="flex items-center gap-2"
        >
          {tournaments.map((t, i) => {
            const active = i === index;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Show ${t.title}`}
                onClick={() => goTo(i)}
                className={`h-3 rounded-full transition-all ${
                  active ? "w-8 bg-brand" : "w-3 bg-zinc-600 hover:bg-zinc-400"
                }`}
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={next}
          aria-label="Next featured tournament"
          className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-surface-2/80 hover:bg-surface-2 text-zinc-300 hover:text-white border border-border-token transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
