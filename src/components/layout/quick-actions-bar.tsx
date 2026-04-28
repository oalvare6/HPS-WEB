"use client";

import Link from "next/link";
import { Calendar, Trophy, MapPin, Navigation } from "lucide-react";

const GOOGLE_MAPS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=14062+Ambrose+St,+Houston,+TX+77045";

export function QuickActionsBar() {
  return (
    <>
      {/* Desktop: Sticky bar below header */}
      <div className="hidden md:block sticky top-20 z-40 bg-surface/95 backdrop-blur-sm border-b border-border-token">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Link
                href="/events#schedule"
                className="inline-flex items-center gap-2 bg-brand-deep text-white px-4 py-2.5 text-sm font-bold rounded-md hover:bg-brand transition-all shadow-md shadow-brand/30 border border-brand"
              >
                <Calendar size={16} />
                Check Schedule
              </Link>
              <Link
                href="/events#standings"
                className="inline-flex items-center gap-2 bg-surface-2 text-white px-4 py-2.5 text-sm font-medium rounded-md hover:bg-base transition-colors border border-border-token hover:border-brand/50"
              >
                <Trophy size={16} />
                Standings
              </Link>
            </div>
            <a
              href={GOOGLE_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-zinc-400 hover:text-white px-3 py-2 text-sm font-medium transition-colors"
            >
              <Navigation size={16} />
              Get Directions
            </a>
          </div>
        </div>
      </div>

      {/* Mobile: Fixed bottom bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-sm border-t border-border-token safe-area-inset-bottom">
        <div className="grid grid-cols-2 gap-2 p-3">
          <Link
            href="/events#schedule"
            className="flex items-center justify-center gap-2 bg-brand-deep text-white h-12 text-sm font-bold rounded-lg hover:bg-brand transition-all shadow-lg shadow-brand/40 border border-brand"
          >
            <Calendar size={18} />
            Schedule
          </Link>
          <a
            href={GOOGLE_MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-surface-2 text-white h-12 text-sm font-medium rounded-lg hover:bg-base transition-colors border border-border-token hover:border-brand/50"
          >
            <MapPin size={18} />
            Directions
          </a>
        </div>
      </div>
    </>
  );
}
