import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  Clock,
  CreditCard,
  MapPin,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import type { Tournament, TournamentStatus } from "@/lib/types";
import { isOpenPlay } from "@/lib/event-kind";
import { tournamentPrimaryCta } from "@/lib/tournament-public-links";
import { resolveEventView, type EventView } from "@/lib/tournament-state";
import { TournamentBannerImage } from "@/components/shared/TournamentBannerImage";
import { getTournamentBannerUrl } from "@/lib/tournament-image";

/** Styles only. The words come from the resolver, so no card can say its own thing. */
const STATUS_PILL: Record<TournamentStatus, { dot: string; cls: string }> = {
  upcoming: { dot: "bg-brand", cls: "text-brand bg-brand/10 border-brand/20" },
  ongoing: { dot: "bg-green-400", cls: "text-green-400 bg-green-500/10 border-green-500/20" },
  completed: { dot: "bg-zinc-500", cls: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
  cancelled: { dot: "bg-red-400", cls: "text-red-400 bg-red-500/10 border-red-500/20" },
};

/**
 * "Ongoing — Registration Open". The suffix follows `view.availability`, which
 * is the same answer the sign-up gate gives — this strip used to read the raw
 * flags and advertised open registration on a finished event for four weeks.
 */
function statusLabel(view: EventView): string {
  if (view.availability === "open") return `${view.label} — Registration Open`;
  if (view.availability === "pay_only") return `${view.label} — Payments Open`;
  return view.label;
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

export function TournamentCard({ tournament }: { tournament: Tournament }) {
  const view = resolveEventView(tournament);
  const pill = STATUS_PILL[view.status];
  const bannerUrl = getTournamentBannerUrl(tournament);
  const openPlay = isOpenPlay(tournament);
  const cta = tournamentPrimaryCta(tournament);
  const timeRange =
    tournament.time_start && tournament.time_end
      ? `${tournament.time_start} – ${tournament.time_end}`
      : tournament.time_start || tournament.time_end || null;

  return (
    <div className="dashboard-card overflow-hidden">
      <div className={`border-b px-6 py-3 flex items-center gap-2 ${pill.cls}`}>
        <div
          className={`w-2 h-2 ${pill.dot} rounded-full ${
            view.status === "upcoming" || view.status === "ongoing"
              ? "animate-pulse"
              : ""
          }`}
        />
        <span className="text-xs font-mono uppercase tracking-wider font-semibold">
          {statusLabel(view)}
        </span>
      </div>

      {bannerUrl && (
        <TournamentBannerImage tournament={tournament} variant="card" />
      )}

      <div className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              {/*
                A card can be seen outside its section — the homepage carousel,
                a shared link — so the icon has to carry the kind on its own.
              */}
              {openPlay ? (
                <Zap size={22} className="text-brand flex-shrink-0" />
              ) : (
                <Trophy size={22} className="text-brand flex-shrink-0" />
              )}
              <h2 className="text-2xl font-bold text-white">
                <Link
                  href={`/events/${tournament.slug}`}
                  className="hover:text-brand transition-colors"
                >
                  {tournament.title}
                </Link>
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
              <Link href={cta.href} className="btn-primary justify-center text-sm">
                {cta.kind === "pay" ? (
                  <CreditCard size={16} />
                ) : openPlay ? (
                  <Zap size={16} />
                ) : (
                  <Trophy size={16} />
                )}
                {cta.label}
                <ArrowRight size={14} />
              </Link>
            )}
            <Link
              href={`/events/${tournament.slug}`}
              className="inline-flex items-center justify-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              View details
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
