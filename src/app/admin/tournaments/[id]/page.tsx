"use client";

import { Suspense, useCallback, useEffect, useState, use } from "react";
import {
  CalendarRange,
  Clock,
  MapPin,
  DollarSign,
  Users,
  UsersRound,
  CreditCard,
  ReceiptText,
  Star,
  ListOrdered,
  Megaphone,
  Settings,
} from "lucide-react";
import { Section } from "@/components/shared/section";
import type { Tournament } from "@/lib/types";
import { EventStateBadge } from "@/components/admin/EventStateBadge";
import {
  fetchTournamentById,
  fetchTournamentStats,
  formatPaymentTotal,
  formatTournamentDateRange,
  type TournamentStats,
} from "@/lib/admin-tournaments";
import RosterScreen from "@/components/admin/RosterScreen";
import TournamentTeamsPanel from "@/components/admin/TournamentTeamsPanel";
import { TournamentForm } from "@/components/admin/TournamentForm";
import { TournamentRoundsPanel } from "@/components/admin/TournamentRoundsPanel";
import { TournamentMatchesPanel } from "@/components/admin/TournamentMatchesPanel";
import { TournamentUpdatesPanel } from "@/components/admin/TournamentUpdatesPanel";
import { Breadcrumbs } from "@/components/admin/Breadcrumbs";
import { eventKindCopy } from "@/lib/event-kind";
import { useQueryParam } from "@/lib/admin-url-state";
import { TournamentDetailSkeleton } from "@/components/shared/skeleton";

/**
 * ONE page per event (B6). Everything the owner does to an event happens in
 * these tabs — the old split, where team assignment lived on the view page
 * but scores and announcements lived behind an "Edit" button on a different
 * page, had to simply be memorized. The old "Details" tab (a second, older
 * list of the same people with its own vocabulary) is gone; the Roster is
 * the one list of people.
 */
type EventTab = "roster" | "teams" | "schedule" | "updates" | "settings";

function isEventTab(value: string): value is EventTab {
  return (
    value === "roster" ||
    value === "teams" ||
    value === "schedule" ||
    value === "updates" ||
    value === "settings"
  );
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
  // Old ?roster= links (bookmarks, back buttons) still resolve: "registrants"
  // is not a tab any more and falls through to the roster.
  const [tabParam, setTabParam] = useQueryParam("tab", "roster");
  const tab: EventTab = isEventTab(tabParam) ? tabParam : "roster";
  const setTab = (next: EventTab) => {
    setTabParam(next === "roster" ? null : next);
  };

  const kindCopy = eventKindCopy(tournament);
  // A tab that doesn't apply to this event kind (teams on an open-play
  // night) falls back rather than rendering an empty screen.
  const effectiveTab: EventTab =
    tab === "teams" && !kindCopy.hasTeams ? "roster" : tab;

  const load = useCallback(() => {
    return Promise.all([fetchTournamentById(id), fetchTournamentStats(id)]).then(
      ([tournamentRes, statsRes]) => {
        if (tournamentRes.error || !tournamentRes.data) {
          setError(tournamentRes.error ?? "Failed to load this event.");
          setTournament(null);
        } else {
          setTournament(tournamentRes.data);
          setError("");
        }
        setStats(statsRes.data ?? null);
      }
    );
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <Breadcrumbs
            items={[
              { label: "Admin", href: "/admin" },
              { label: "Events", href: "/admin/tournaments" },
              { label: tournament?.title ?? "Event" },
            ]}
          />
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {tournament?.title ?? "Event"}
              </h1>
              {tournament && <MetaLine tournament={tournament} />}
            </div>
            {tournament && (
              <div className="flex items-center gap-2 shrink-0">
                <EventStateBadge tournament={tournament} />
                {tournament.is_featured && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-brand/20 text-brand">
                    <Star size={12} className="fill-current" />
                    On homepage
                  </span>
                )}
              </div>
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
              <StatsCards stats={stats} />

              <EventTabs
                value={effectiveTab}
                onChange={setTab}
                showTeams={kindCopy.hasTeams}
                rosterLabel={kindCopy.rosterHeading}
              />

              {effectiveTab === "roster" && (
                <RosterScreen
                  tournamentId={tournament.id}
                  showTeams={kindCopy.hasTeams}
                />
              )}

              {effectiveTab === "teams" && kindCopy.hasTeams && (
                <TournamentTeamsPanel
                  tournamentId={tournament.id}
                  maxTeams={tournament.max_teams}
                />
              )}

              {effectiveTab === "schedule" && (
                <div className="space-y-6">
                  <TournamentRoundsPanel tournamentId={tournament.id} />
                  <TournamentMatchesPanel tournamentId={tournament.id} />
                </div>
              )}

              {effectiveTab === "updates" && (
                <TournamentUpdatesPanel tournamentId={tournament.id} />
              )}

              {effectiveTab === "settings" && (
                <div className="max-w-4xl">
                  <TournamentForm
                    initial={tournament}
                    onSaved={() => {
                      void load();
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </Section>
    </>
  );
}

/** Dates · time · place · price, in one quiet line under the title. */
function MetaLine({ tournament }: { tournament: Tournament }) {
  const parts: { icon: React.ReactNode; text: string }[] = [];
  const dates = formatTournamentDateRange(
    tournament.start_date,
    tournament.end_date
  );
  if (dates && dates !== "—") {
    parts.push({ icon: <CalendarRange size={13} />, text: dates });
  }
  if (tournament.time_start) {
    parts.push({
      icon: <Clock size={13} />,
      text: tournament.time_end
        ? `${tournament.time_start} – ${tournament.time_end}`
        : tournament.time_start,
    });
  }
  if (tournament.location) {
    parts.push({ icon: <MapPin size={13} />, text: tournament.location });
  }
  const fee = tournament.entry_fee_cents;
  if (typeof fee === "number" && Number.isFinite(fee) && fee > 0) {
    parts.push({
      icon: <DollarSign size={13} />,
      text: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(fee / 100),
    });
  }
  if (parts.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {p.icon}
          {p.text}
        </span>
      ))}
    </p>
  );
}

function EventTabs({
  value,
  onChange,
  showTeams,
  rosterLabel,
}: {
  value: EventTab;
  onChange: (next: EventTab) => void;
  showTeams: boolean;
  rosterLabel: string;
}) {
  const tabs: { id: EventTab; label: string; icon: React.ReactNode }[] = [
    { id: "roster", label: rosterLabel, icon: <Users size={14} /> },
    ...(showTeams
      ? [{ id: "teams" as const, label: "Teams", icon: <UsersRound size={14} /> }]
      : []),
    {
      id: "schedule",
      label: "Schedule & scores",
      icon: <ListOrdered size={14} />,
    },
    { id: "updates", label: "Announcements", icon: <Megaphone size={14} /> },
    { id: "settings", label: "Settings", icon: <Settings size={14} /> },
  ];
  return (
    <div
      role="tablist"
      aria-label="Event sections"
      className="inline-flex flex-wrap gap-1 bg-surface-2 rounded-lg p-1"
    >
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
              active ? "bg-base text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Paid" (a status the owner sets, cash included) and "Card payments" (rows
 * Stripe recorded) are different measurements and routinely differ — cash
 * marked paid creates no card payment. The labels now say which is which
 * instead of presenting two unexplained disagreeing numbers.
 */
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
        label="Signed up"
        value={String(registrantCount)}
      />
      <StatCard
        icon={<CreditCard size={16} />}
        label="Paid (cash or card)"
        value={`${paidCount} / ${registrantCount}`}
      />
      <StatCard
        icon={<ReceiptText size={16} />}
        label="Card payments"
        value={String(paymentCount)}
      />
      <StatCard
        icon={<DollarSign size={16} />}
        label="Collected by card"
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
