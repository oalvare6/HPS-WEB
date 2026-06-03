import Link from "next/link";
import { ArrowRight, Calendar, Clock, CreditCard, MapPin, Trophy, Users } from "lucide-react";
import type { Tournament, TournamentStatus } from "@/lib/types";
import { tournamentPrimaryCta } from "@/lib/tournament-public-links";
import { TournamentBannerImage } from "@/components/shared/TournamentBannerImage";
import { getTournamentBannerUrl } from "@/lib/tournament-image";

function formatDateRow(t: Tournament): string {
  if (t.recurrence) return t.recurrence;
  if (!t.start_date) return "Date TBA";
  return new Date(t.start_date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const STATUS_PILL: Record<
  TournamentStatus,
  { text: string; cls: string; dot: string; pulse: boolean }
> = {
  upcoming: {
    text: "Upcoming",
    cls: "text-brand",
    dot: "bg-brand",
    pulse: true,
  },
  ongoing: {
    text: "Ongoing",
    cls: "text-green-400",
    dot: "bg-green-400",
    pulse: true,
  },
  completed: {
    text: "Completed",
    cls: "text-zinc-400",
    dot: "bg-zinc-500",
    pulse: false,
  },
  cancelled: {
    text: "Cancelled",
    cls: "text-red-400",
    dot: "bg-red-400",
    pulse: false,
  },
};

export function FeaturedTournamentCard({
  tournament,
  imagePriority = true,
  highlighted = false,
}: {
  tournament: Tournament;
  /** Avoid eager-loading every slide when multiple featured tournaments rotate. */
  imagePriority?: boolean;
  highlighted?: boolean;
}) {
  const bannerUrl = getTournamentBannerUrl(tournament);
  const timeRange =
    tournament.time_start && tournament.time_end
      ? `${tournament.time_start} – ${tournament.time_end}`
      : tournament.time_start || tournament.time_end;
  const cta = tournamentPrimaryCta(tournament);
  const pill = STATUS_PILL[tournament.status];

  return (
    <div
      className={`dashboard-card overflow-hidden border shadow-xl transition-all ${
        highlighted
          ? "border-brand/70 ring-2 ring-brand/50 shadow-brand/20"
          : "border-border-token/70 shadow-black/30"
      }`}
    >
      {bannerUrl ? (
        <Link
          href={`/events/${tournament.slug}`}
          className="block bg-surface-2 group"
        >
          <TournamentBannerImage
            tournament={tournament}
            variant="card"
            priority={imagePriority}
            className="transition-transform duration-300 group-hover:scale-[1.01]"
          />
        </Link>
      ) : null}

      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider font-semibold ${pill.cls}`}
              >
                <span
                  className={`w-2 h-2 ${pill.dot} rounded-full ${pill.pulse ? "animate-pulse" : ""}`}
                />
                {pill.text}
              </span>
              {tournament.registration_open && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold bg-brand/15 text-brand">
                  Registration Open
                </span>
              )}
              {tournament.payments_open && !tournament.registration_open && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold bg-brand/10 text-brand">
                  Payments Open
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white">
              <Link
                href={`/events/${tournament.slug}`}
                className="hover:text-brand transition-colors"
              >
                {tournament.title}
              </Link>
            </h2>
          </div>
          <Trophy size={24} className="text-brand flex-shrink-0" />
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-zinc-300">
            <Calendar size={14} className="text-brand flex-shrink-0" />
            <span>{formatDateRow(tournament)}</span>
          </div>
          {timeRange && (
            <div className="flex items-center gap-2 text-zinc-300">
              <Clock size={14} className="text-brand flex-shrink-0" />
              <span>{timeRange}</span>
            </div>
          )}
          {tournament.location && (
            <div className="flex items-center gap-2 text-zinc-300">
              <MapPin size={14} className="text-brand flex-shrink-0" />
              <span>{tournament.location.split(",")[0]}</span>
            </div>
          )}
          {tournament.format && (
            <div className="flex items-center gap-2 text-zinc-300">
              <Users size={14} className="text-brand flex-shrink-0" />
              <span>{tournament.format}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {cta.kind !== "none" && (
            <Link href={cta.href} className="btn-primary w-full justify-center text-sm">
              {cta.kind === "pay" ? <CreditCard size={14} /> : <Trophy size={14} />}
              {cta.label}
              <ArrowRight size={14} />
            </Link>
          )}
          <Link
            href={`/events/${tournament.slug}`}
            className="text-xs text-zinc-400 hover:text-white text-center inline-flex items-center justify-center gap-1 transition-colors mt-1"
          >
            View tournament details
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
