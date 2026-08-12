"use client";

import { Suspense, useEffect, useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Pencil,
  CalendarRange,
  Clock,
  MapPin,
  Trophy,
  Users,
  UsersRound,
  CreditCard,
  DollarSign,
  ReceiptText,
  Star,
  Hash,
  Repeat,
  Layers,
} from "lucide-react";
import { Section } from "@/components/shared/section";
import { getPresetUrl } from "@/lib/tournament-image-presets";
import type { Tournament } from "@/lib/types";
import { EventStateBadge } from "@/components/admin/EventStateBadge";
import {
  fetchTournamentById,
  fetchTournamentStats,
  formatPaymentTotal,
  formatTournamentDateRange,
  type TournamentStats,
} from "@/lib/admin-tournaments";
import RegistrationsList from "@/components/admin/RegistrationsList";
import RosterScreen from "@/components/admin/RosterScreen";
import TournamentTeamsPanel from "@/components/admin/TournamentTeamsPanel";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { useQueryParam } from "@/lib/admin-url-state";
import { TournamentDetailSkeleton } from "@/components/shared/skeleton";

type RosterTab = "roster" | "registrants" | "teams";

function isRosterTab(value: string): value is RosterTab {
  return value === "roster" || value === "registrants" || value === "teams";
}

export default function AdminTournamentViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <ViewContent id={id} />
    </Suspense>
  );
}

function ViewContent({ id }: { id: string }) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // The Roster screen (A3) is the default view — it is what the owner opens
  // this page for. "Registrants" keeps the older detailed list available.
  const [rosterParam, setRosterParam] = useQueryParam("roster", "roster");
  const rosterTab: RosterTab = isRosterTab(rosterParam) ? rosterParam : "roster";
  const setRosterTab = (next: RosterTab) => {
    setRosterParam(next === "roster" ? null : next);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([fetchTournamentById(id), fetchTournamentStats(id)])
      .then(([tournamentRes, statsRes]) => {
        if (cancelled) return;
        if (tournamentRes.error || !tournamentRes.data) {
          setError(tournamentRes.error ?? "Failed to load tournament.");
          setTournament(null);
        } else {
          setTournament(tournamentRes.data);
          setError("");
        }
        if (statsRes.data) {
          setStats(statsRes.data);
        } else {
          setStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const thumb =
    tournament &&
    (tournament.image_url || getPresetUrl(tournament.image_preset));

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <Breadcrumbs
            items={[
              { label: "Admin", href: "/admin" },
              { label: "Tournaments", href: "/admin/tournaments" },
              { label: tournament?.title ?? "Tournament" },
            ]}
          />
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {tournament?.title ?? "Tournament"}
              </h1>
              {tournament?.slug && (
                <p className="mt-1 text-sm text-zinc-500 font-mono">
                  {tournament.slug}
                </p>
              )}
            </div>
            {tournament && (
              <Link
                href={`/admin/tournaments/${tournament.id}/edit`}
                className="btn-primary"
              >
                <Pencil size={16} />
                Edit tournament
              </Link>
            )}
          </div>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-6xl mx-auto px-6 space-y-6">
          {loading && <TournamentDetailSkeleton />}

          {!loading && error && (
            <div className="dashboard-card p-6">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {!loading && tournament && (
            <>
              <StatusPills tournament={tournament} />

              <StatsCards stats={stats} />

              <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 dashboard-card p-6">
                  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">
                    Details
                  </h2>
                  <DetailGrid tournament={tournament} />
                  {tournament.description && (
                    <div className="mt-6">
                      <p className="data-label mb-2">Description</p>
                      <p className="text-zinc-300 whitespace-pre-wrap">
                        {tournament.description}
                      </p>
                    </div>
                  )}
                </div>

                <div className="dashboard-card p-4 flex flex-col gap-3">
                  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider px-2 pt-2">
                    Image
                  </h2>
                  <div className="relative w-full aspect-[16/7] rounded-lg overflow-hidden bg-surface-2 border border-border-token">
                    {thumb ? (
                      <Image
                        src={thumb}
                        alt={tournament.title}
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 320px, 100vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-zinc-500">
                        <Trophy size={24} />
                      </div>
                    )}
                  </div>
                  <dl className="text-sm px-2 pb-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <dt className="text-zinc-400">Display order</dt>
                      <dd className="text-zinc-200 font-mono">
                        {tournament.display_order}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-zinc-400">Created</dt>
                      <dd className="text-zinc-200">
                        {formatTimestamp(tournament.created_at)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-zinc-400">Updated</dt>
                      <dd className="text-zinc-200">
                        {formatTimestamp(tournament.updated_at)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
                    Roster
                  </h2>
                  <RosterTabs value={rosterTab} onChange={setRosterTab} />
                </div>

                {rosterTab === "roster" && (
                  <RosterScreen tournamentId={tournament.id} />
                )}

                {/* Keep Registrants mounted to preserve internal filter/sort
                    state when toggling tabs; matches the pattern used on the
                    Overview page (Phase 2). */}
                <div className={rosterTab === "registrants" ? "" : "hidden"}>
                  <RegistrationsList tournamentId={tournament.id} />
                </div>

                {rosterTab === "teams" && (
                  <TournamentTeamsPanel
                    tournamentId={tournament.id}
                    maxTeams={tournament.max_teams}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </Section>
    </>
  );
}

function RosterTabs({
  value,
  onChange,
}: {
  value: RosterTab;
  onChange: (next: RosterTab) => void;
}) {
  const tabs: { id: RosterTab; label: string; icon: React.ReactNode }[] = [
    { id: "roster", label: "Roster", icon: <Users size={14} /> },
    { id: "registrants", label: "Details", icon: <ReceiptText size={14} /> },
    { id: "teams", label: "Teams", icon: <UsersRound size={14} /> },
  ];
  return (
    <div
      role="tablist"
      aria-label="Tournament roster view"
      className="inline-flex gap-1 bg-surface-2 rounded-lg p-1"
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              active
                ? "bg-base text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusPills({ tournament }: { tournament: Tournament }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EventStateBadge tournament={tournament} />
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
          tournament.is_featured
            ? "bg-brand/20 text-brand"
            : "bg-surface-2 text-zinc-400 border border-border-token"
        }`}
      >
        <Star
          size={12}
          className={tournament.is_featured ? "fill-current" : ""}
        />
        {tournament.is_featured ? "Featured" : "Not featured"}
      </span>
    </div>
  );
}

function StatsCards({ stats }: { stats: TournamentStats | null }) {
  const registrantCount = stats?.registrantCount ?? 0;
  const paidCount = stats?.paidRegistrantCount ?? 0;
  const paymentCount = stats?.paymentCount ?? 0;
  const totalLabel = stats
    ? formatPaymentTotal(stats)
    : formatPaymentTotal({ paymentTotalCents: 0, currency: "usd" });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<Users size={16} />}
        label="Registrants"
        value={String(registrantCount)}
      />
      <StatCard
        icon={<CreditCard size={16} />}
        label="Paid registrants"
        value={`${paidCount} / ${registrantCount}`}
      />
      <StatCard
        icon={<ReceiptText size={16} />}
        label="Payments succeeded"
        value={String(paymentCount)}
      />
      <StatCard
        icon={<DollarSign size={16} />}
        label="Payment total"
        value={totalLabel}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="dashboard-card p-4">
      <div className="flex items-center gap-2 text-zinc-400 mb-2">
        {icon}
        <p className="text-xs uppercase tracking-wider font-medium">{label}</p>
      </div>
      <p className="data-display text-2xl">{value}</p>
    </div>
  );
}

function DetailGrid({ tournament }: { tournament: Tournament }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <DetailItem
        icon={<Layers size={14} />}
        label="Format"
        value={tournament.format ?? "—"}
      />
      <DetailItem
        icon={<CalendarRange size={14} />}
        label="Dates"
        value={formatTournamentDateRange(
          tournament.start_date,
          tournament.end_date
        )}
      />
      <DetailItem
        icon={<Clock size={14} />}
        label="Time window"
        value={formatTimeRange(tournament.time_start, tournament.time_end)}
      />
      <DetailItem
        icon={<Repeat size={14} />}
        label="Recurrence"
        value={tournament.recurrence ?? "—"}
      />
      <DetailItem
        icon={<MapPin size={14} />}
        label="Location"
        value={tournament.location ?? "—"}
      />
      <DetailItem
        icon={<DollarSign size={14} />}
        label="Entry fee"
        value={formatEntryFee(tournament)}
      />
      <DetailItem
        icon={<Users size={14} />}
        label="Max teams"
        value={
          tournament.max_teams === null ? "—" : String(tournament.max_teams)
        }
      />
      <DetailItem
        icon={<Hash size={14} />}
        label="Tournament id"
        value={tournament.id}
        mono
      />
    </dl>
  );
}

function DetailItem({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-zinc-400 text-xs uppercase tracking-wider font-medium mb-1">
        {icon}
        {label}
      </dt>
      <dd
        className={`text-zinc-100 ${mono ? "font-mono text-xs break-all" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? "—";
}

function formatEntryFee(tournament: Tournament): string {
  const cents = tournament.entry_fee_cents;
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  }
  if (typeof tournament.entry_fee === "number") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(tournament.entry_fee);
  }
  return "—";
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
