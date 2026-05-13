import Link from "next/link";
import Image from "next/image";
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
import { getPresetUrl } from "@/lib/tournament-image-presets";
import { safeInternalLink } from "@/lib/safe-internal-link";

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

export function TournamentCard({ tournament }: { tournament: Tournament }) {
  const pill = STATUS_PILL[tournament.status];
  const bannerUrl = tournament.image_url || getPresetUrl(tournament.image_preset);
  const registerHref = safeInternalLink(tournament.register_url, "/register");
  const payHref = safeInternalLink(tournament.pay_url, "/pay");
  const timeRange =
    tournament.time_start && tournament.time_end
      ? `${tournament.time_start} – ${tournament.time_end}`
      : tournament.time_start || tournament.time_end || null;

  return (
    <div className="dashboard-card overflow-hidden">
      <div className={`border-b px-6 py-3 flex items-center gap-2 ${pill.cls}`}>
        <div className={`w-2 h-2 ${pill.dot} rounded-full animate-pulse`} />
        <span className="text-xs font-mono uppercase tracking-wider font-semibold">
          {statusLabel(tournament)}
        </span>
      </div>

      {bannerUrl && (
        <div className="relative w-full aspect-[16/7] bg-surface-2 overflow-hidden">
          <Image
            src={bannerUrl}
            alt={tournament.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 896px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-base/80 via-transparent to-transparent" />
        </div>
      )}

      <div className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <Trophy size={22} className="text-brand flex-shrink-0" />
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
            {tournament.registration_open && (
              <Link href={registerHref} className="btn-primary justify-center text-sm">
                <Trophy size={16} />
                Register Now
                <ArrowRight size={14} />
              </Link>
            )}
            {tournament.payments_open && (
              <Link href={payHref} className="btn-secondary justify-center text-sm">
                <CreditCard size={16} />
                Pay Entry Fee
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
