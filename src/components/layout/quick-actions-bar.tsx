"use client";

import Link from "next/link";
import { Calendar, Trophy, MapPin, Navigation } from "lucide-react";

const GOOGLE_MAPS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=14602+Ambrose+St,+Houston,+TX+77045";

export function QuickActionsBar() {
  return (
    <>
      {/* Desktop: Sticky bar below header */}
      <div className="hidden md:block sticky top-20 z-40 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Link
                href="/events#schedule"
                className="inline-flex items-center gap-2 bg-white text-zinc-900 px-4 py-2.5 text-sm font-medium rounded-md hover:bg-zinc-100 transition-colors"
              >
                <Calendar size={16} />
                Check Schedule
              </Link>
              <Link
                href="/events#standings"
                className="inline-flex items-center gap-2 bg-zinc-800 text-white px-4 py-2.5 text-sm font-medium rounded-md hover:bg-zinc-700 transition-colors border border-zinc-700"
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
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur-sm border-t border-zinc-800 safe-area-inset-bottom">
        <div className="grid grid-cols-2 gap-2 p-3">
          <Link
            href="/events#schedule"
            className="flex items-center justify-center gap-2 bg-white text-zinc-900 h-12 text-sm font-medium rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <Calendar size={18} />
            Schedule
          </Link>
          <a
            href={GOOGLE_MAPS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-zinc-800 text-white h-12 text-sm font-medium rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            <MapPin size={18} />
            Directions
          </a>
        </div>
      </div>
    </>
  );
}
