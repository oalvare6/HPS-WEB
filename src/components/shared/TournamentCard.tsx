import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Clock,
  CreditCard,
  MapPin,
  Trophy,
  Users,
} from "lucide-react";
import type { Tournament, TournamentStatus } from "@/lib/types";
import { tournamentPrimaryCta } from "@/lib/tournament-public-links";
import { TournamentBannerImage } from "@/components/shared/TournamentBannerImage";
import { getTournamentBannerUrl } from "@/lib/tournament-image";

const STATUS_PILL: Record<TournamentStatus, { text: string; dot: string; cls: string }> = {
  upcoming: { text: "Upcoming", dot: "bg-brand", cls: "text-brand bg-brand/10 border-brand/20" },
  ongoing: { text: "Ongoing", dot: "bg-green-400", cls: "text-green-400 bg-green-500/10 border-green-500/20" },
  completed: { text: "Completed", dot: "bg-zinc-500", cls: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
  cancelled: { text: "Cancelled", dot: "bg-red-400", cls: "text-red-400 bg-red-500/10 border-red-500/20" },
};

function statusLabel(t: Tournament): string {
  const base = STATUS_PILL[t.status].text;
  if (t.registration_open && t.payments_open) return `${base} — Registration & Payments Open`;
  if (t.registration_open) return `${base} — Registration Open`;
  if (t.payments_open) return `${base} — Payments Open`;
  return base;
}

function formatDateRow(t: Tournament): string {
  if (t.recurrence) return t.recurrence;
  if (!t.start_date) return "Date TBA";
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric", year: "numeric" };
  const s = new Date(t.start_date).toLocaleDateString("en-US", opts);
  if (t.end_date) {
    const e = new Date(t.end_date).toLocaleDateString("en-US", opts);
    return `${s} – ${e}`;
  }
  return s;
}

/**
 * One card, one destination: the whole card (banner included) is a single
 * stretched link to the tournament page; only the pay/register CTA sits above
 * it at z-10 because it goes somewhere else.
 */
export function TournamentCard({ tournament }: { tournament: Tournament }) {
  const pill = STATUS_PILL[tournament.status];
  const bannerUrl = getTournamentBannerUrl(tournament);
  const cta = tournamentPrimaryCta(tournament);
  const timeRange =
    tournament.time_start && tournament.time_end
      ? `${tournament.time_start} – ${tournament.time_end}`
      : tournament.time_start || tournament.time_end || null;

  return (
    <div className="dashboard-card group relative overflow-hidden transition-colors hover:border-brand/40">
      <Link
        href={`/events/${tournament.slug}`}
        aria-label={`View ${tournament.title}`}
        className="absolute inset-0 z-0"
      />

      <div className={`border-b px-6 py-3 flex items-center gap-2 ${pill.cls}`}>
        <div
          className={`w-2 h-2 ${pill.dot} rounded-full ${
            tournament.status === "upcoming" || tournament.status === "ongoing"
              ? "animate-pulse"
              : ""
          }`}
        />
        <span className="text-xs font-mono uppercase tracking-wider font-semibold">
          {statusLabel(tournament)}
        </span>
      </div>

      {bannerUrl && (
        <TournamentBannerImage tournament={tournament} variant="card" />
      )}

      <div className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <Trophy size={22} className="text-brand flex-shrink-0" />
              <h2 className="text-2xl font-bold text-white transition-colors group-hover:text-brand">
                {tournament.title}
              </h2>
            </div>

            {tournament.description && (
              <p className="text-zinc-400 mb-4">{tournament.description}</p>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm mb-4">
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
                  <span>{tournament.location}</span>
                </div>
              )}
              {tournament.format && (
                <div className="flex items-center gap-2 text-zinc-300">
                  <Users size={14} className="text-brand flex-shrink-0" />
                  <span>{tournament.format}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:min-w-[200px]">
            {cta.kind !== "none" && (
              <Link
                href={cta.href}
                className="btn-primary relative z-10 min-h-11 justify-center text-sm"
              >
                {cta.kind === "pay" ? <CreditCard size={16} /> : <Trophy size={16} />}
                {cta.label}
                <ArrowRight size={14} />
              </Link>
            )}
            <span className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm text-zinc-400 transition-colors group-hover:text-white">
              View details
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
