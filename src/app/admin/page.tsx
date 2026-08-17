"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Section } from "@/components/shared/section";
import { useScrollRestoration } from "@/lib/use-scroll-restoration";
import {
  CheckCircle,
  XCircle,
  Download,
  CreditCard,
  Users,
  DollarSign,
  ClipboardList,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { StatCardsSkeleton, TableSkeleton } from "@/components/shared/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { EventStateBadge } from "@/components/admin/EventStateBadge";
import { resolveEventState } from "@/lib/tournament-state";
import { formatTournamentDateRange } from "@/lib/admin-tournaments";
import type { Tournament } from "@/lib/types";

type LinkedContact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  tags: string[];
};

type LinkedTournament = {
  id: string;
  title: string;
  slug: string;
};

type Payment = {
  id: string;
  created_at: string;
  email: string;
  amount: number;
  currency: string;
  tournament_id: string | null;
  tournament_name: string | null;
  contact_id: string | null;
  drop_in_id: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  status: string;
  notes: string | null;
  registrations: { first_name: string; last_name: string } | null;
  tournament: LinkedTournament | null;
  contact: LinkedContact | null;
};

/** The slice of the registrations API this page needs for per-event counts. */
type RegistrationSlim = {
  id: string;
  tournament_id: string | null;
  payment_status: string;
  waiver_ok: boolean;
};

type EventCounts = { signedUp: number; paid: number; noWaiver: number };

/**
 * If the cookie expired mid-session, the API returns 401. Force a reload so the
 * AdminGate in the layout re-checks `/api/admin/me` and shows the login form.
 */
function handleAuthLost() {
  if (typeof window !== "undefined") window.location.reload();
}

const SETTLED = new Set(["paid", "waived"]);

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageContent />
    </Suspense>
  );
}

/**
 * The Overview answers the owner's actual questions, immediately and with
 * numbers that agree with every other screen: what's coming up, who has
 * signed up and paid, and how much money has come in.
 *
 * What it deliberately no longer has (B6): the "Manage" cards duplicating
 * the nav bar 40 pixels above them, the global registrations list (people
 * live on each event's Roster), and the header that read $0.00 until the
 * Payments tab was clicked — money now loads with the page.
 */
function AdminPageContent() {
  useScrollRestoration("admin-overview");

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationSlim[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [payLoading, setPayLoading] = useState(true);
  const [payError, setPayError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const loadPayments = useCallback(() => {
    setPayLoading(true);
    fetch("/api/admin/payments")
      .then((res) => {
        if (res.status === 401) {
          handleAuthLost();
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.error) {
          setPayError(data.error);
          return;
        }
        setPayments(data.payments);
        setPayError("");
      })
      .catch(() => setPayError("Failed to load payments."))
      .finally(() => setPayLoading(false));
  }, []);

  useEffect(() => {
    loadPayments();
    Promise.all([
      fetch("/api/admin/tournaments").then((res) =>
        res.status === 401 ? (handleAuthLost(), null) : res.json()
      ),
      fetch("/api/admin/registrations").then((res) =>
        res.status === 401 ? (handleAuthLost(), null) : res.json()
      ),
    ])
      .then(([tournamentsBody, registrationsBody]) => {
        if (tournamentsBody?.tournaments) {
          setTournaments(tournamentsBody.tournaments as Tournament[]);
        }
        if (registrationsBody?.registrations) {
          setRegistrations(
            registrationsBody.registrations as RegistrationSlim[]
          );
        }
      })
      .catch(() => {})
      .finally(() => setEventsLoading(false));
  }, [loadPayments]);

  const countsByEvent = useMemo(() => {
    const map = new Map<string, EventCounts>();
    for (const r of registrations) {
      if (!r.tournament_id) continue;
      const counts =
        map.get(r.tournament_id) ?? { signedUp: 0, paid: 0, noWaiver: 0 };
      counts.signedUp++;
      if (SETTLED.has(r.payment_status)) counts.paid++;
      if (!r.waiver_ok) counts.noWaiver++;
      map.set(r.tournament_id, counts);
    }
    return map;
  }, [registrations]);

  const { currentEvents, pastEvents } = useMemo(() => {
    const current: Tournament[] = [];
    const past: Tournament[] = [];
    for (const t of tournaments) {
      if (resolveEventState(t) === "finished") past.push(t);
      else current.push(t);
    }
    // Most recent finished events first — the archive reads newest-down.
    past.sort((a, b) =>
      (b.end_date ?? b.start_date ?? "").localeCompare(
        a.end_date ?? a.start_date ?? ""
      )
    );
    return { currentEvents: current, pastEvents: past };
  }, [tournaments]);

  const totalRevenue = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const succeededPayments = payments.filter(
    (p) => p.status === "succeeded"
  ).length;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const formatCurrency = (amount: number, currency = "usd") =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);

  const runStripeCheck = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync-payments", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncResult(`Error: ${data.error}`);
      } else {
        setSyncResult(
          data.synced > 0
            ? `Found ${data.synced} payment(s) we were missing. ${data.skipped} were already recorded.`
            : `Nothing missing — all ${data.skipped} recent Stripe payments are already recorded.`
        );
        if (data.synced > 0) loadPayments();
      }
    } catch {
      setSyncResult("Could not reach Stripe. Try again.");
    } finally {
      setSyncing(false);
    }
  };

  const handleExportPaymentsCsv = () => {
    const headers = [
      "Name",
      "Email",
      "Event",
      "Amount",
      "Currency",
      "Status",
      "Reference",
      "Date",
    ];
    const rows = payments.map((p) => [
      p.registrations
        ? `${p.registrations.first_name} ${p.registrations.last_name}`
        : "",
      p.email,
      p.tournament_name ?? "",
      p.amount,
      p.currency,
      p.status,
      p.stripe_session_id ?? "",
      formatDate(p.created_at),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Header */}
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            Overview
          </h1>
          <p className="text-zinc-400">
            {payLoading
              ? "Loading…"
              : `${formatCurrency(totalRevenue)} collected by card · ${succeededPayments} card payments`}
          </p>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-6xl mx-auto px-6 space-y-10">
          {/* ── EVENTS ── */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
              Your events
            </h2>
            {eventsLoading ? (
              <StatCardsSkeleton count={2} />
            ) : currentEvents.length === 0 ? (
              <AdminEmptyState
                icon={Users}
                title="No upcoming events"
                description="Create an event to start taking signups."
                actionLabel="Add event"
                actionHref="/admin/tournaments/new"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentEvents.map((t) => (
                  <EventCard
                    key={t.id}
                    tournament={t}
                    counts={countsByEvent.get(t.id)}
                  />
                ))}
              </div>
            )}
            {pastEvents.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-200 transition-colors select-none">
                  Past events ({pastEvents.length})
                </summary>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pastEvents.map((t) => (
                    <EventCard
                      key={t.id}
                      tournament={t}
                      counts={countsByEvent.get(t.id)}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* ── MONEY ── */}
          <div className="space-y-6">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
              Money
            </h2>

            {payError && <p className="text-red-400">{payError}</p>}
            {payLoading ? (
              <div className="space-y-6">
                <StatCardsSkeleton count={4} />
                <TableSkeleton rows={6} columns={6} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="dashboard-card p-4 text-center">
                    <div className="flex justify-center mb-1">
                      <DollarSign size={18} className="text-brand" />
                    </div>
                    <p className="text-2xl font-bold text-brand">
                      {formatCurrency(totalRevenue)}
                    </p>
                    <p className="text-xs text-zinc-400 uppercase tracking-wide">
                      Collected by card
                    </p>
                  </div>
                  <div className="dashboard-card p-4 text-center">
                    <div className="flex justify-center mb-1">
                      <CheckCircle size={18} className="text-brand" />
                    </div>
                    <p className="text-2xl font-bold text-white">
                      {succeededPayments}
                    </p>
                    <p className="text-xs text-zinc-400 uppercase tracking-wide">
                      Card payments
                    </p>
                  </div>
                  <div className="dashboard-card p-4 text-center">
                    <div className="flex justify-center mb-1">
                      <ClipboardList size={18} className="text-yellow-400" />
                    </div>
                    <p className="text-2xl font-bold text-yellow-400">
                      {payments.filter((p) => p.status === "pending").length}
                    </p>
                    <p className="text-xs text-zinc-400 uppercase tracking-wide">
                      Not completed
                    </p>
                  </div>
                  <div className="dashboard-card p-4 text-center">
                    <div className="flex justify-center mb-1">
                      <XCircle size={18} className="text-red-400" />
                    </div>
                    <p className="text-2xl font-bold text-red-400">
                      {
                        payments.filter(
                          (p) =>
                            p.status === "refunded" || p.status === "failed"
                        ).length
                      }
                    </p>
                    <p className="text-xs text-zinc-400 uppercase tracking-wide">
                      Refunded / failed
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 justify-end">
                  <button
                    onClick={() => void runStripeCheck()}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-border-token rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      size={14}
                      className={syncing ? "animate-spin" : ""}
                    />
                    {syncing ? "Checking…" : "Check Stripe for missed payments"}
                  </button>
                  <button
                    onClick={handleExportPaymentsCsv}
                    className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-border-token rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <Download size={14} />
                    Download spreadsheet
                  </button>
                </div>
                {syncResult && (
                  <p
                    className={`text-sm ${
                      syncResult.startsWith("Error")
                        ? "text-red-400"
                        : "text-brand"
                    }`}
                  >
                    {syncResult}
                  </p>
                )}

                {payments.length === 0 ? (
                  <AdminEmptyState
                    icon={CreditCard}
                    title="No payments yet"
                    description="When players pay by card, the payments appear here."
                    actionLabel="Check Stripe for missed payments"
                    onAction={() => void runStripeCheck()}
                  />
                ) : (
                  <div className="dashboard-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border-token text-left">
                            <th className="px-4 py-3 text-zinc-400 font-medium">
                              Player
                            </th>
                            <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">
                              Email
                            </th>
                            <th className="px-4 py-3 text-zinc-400 font-medium hidden lg:table-cell">
                              Event
                            </th>
                            <th className="px-4 py-3 text-zinc-400 font-medium">
                              Amount
                            </th>
                            <th className="px-4 py-3 text-zinc-400 font-medium">
                              Status
                            </th>
                            <th className="px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p) => (
                            <tr
                              key={p.id}
                              className="border-b border-border-token hover:bg-surface-2/30 transition-colors"
                            >
                              <td className="px-4 py-3 text-white font-medium">
                                {p.contact ? (
                                  <Link
                                    href={`/admin/contacts?q=${encodeURIComponent(p.contact.email)}`}
                                    className="hover:text-brand"
                                  >
                                    {p.contact.first_name} {p.contact.last_name}
                                  </Link>
                                ) : p.registrations ? (
                                  `${p.registrations.first_name} ${p.registrations.last_name}`
                                ) : (
                                  <span className="text-zinc-500 italic">
                                    Unknown
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-zinc-300 hidden md:table-cell">
                                {p.email}
                              </td>
                              <td className="px-4 py-3 text-zinc-300 hidden lg:table-cell">
                                {p.tournament ? (
                                  <Link
                                    href={`/admin/tournaments/${p.tournament.id}`}
                                    className="text-brand hover:underline"
                                  >
                                    {p.tournament.title}
                                  </Link>
                                ) : (
                                  <span className="text-zinc-300">
                                    {p.tournament_name ?? "—"}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-white font-semibold">
                                {formatCurrency(p.amount, p.currency)}
                              </td>
                              <td className="px-4 py-3">
                                <PaymentStatusPill status={p.status} />
                              </td>
                              <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell">
                                {formatDateTime(p.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}

/** Stripe's internal words translated for the person reading them. */
function PaymentStatusPill({ status }: { status: string }) {
  const label =
    status === "succeeded"
      ? "Paid"
      : status === "pending"
        ? "Not completed"
        : status === "refunded"
          ? "Refunded"
          : "Failed";
  const cls =
    status === "succeeded"
      ? "bg-brand/20 text-brand"
      : status === "pending"
        ? "bg-yellow-500/20 text-yellow-400"
        : "bg-red-500/20 text-red-400";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cls}`}
    >
      {status === "succeeded" ? <CheckCircle size={12} /> : <XCircle size={12} />}
      {label}
    </span>
  );
}

function EventCard({
  tournament,
  counts,
}: {
  tournament: Tournament;
  counts: EventCounts | undefined;
}) {
  const dates = formatTournamentDateRange(
    tournament.start_date,
    tournament.end_date
  );
  const signedUp = counts?.signedUp ?? 0;
  const paid = counts?.paid ?? 0;
  const owes = signedUp - paid;
  const noWaiver = counts?.noWaiver ?? 0;
  return (
    <Link href={`/admin/tournaments/${tournament.id}`} className="block group">
      <div className="dashboard-card p-5 h-full hover:border-brand/50 transition-colors">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <h3 className="text-base font-semibold text-white min-w-0">
            {tournament.title}
          </h3>
          <EventStateBadge tournament={tournament} />
        </div>
        {dates && dates !== "—" && (
          <p className="text-sm text-zinc-400 mb-3">{dates}</p>
        )}
        <p className="text-sm text-zinc-300">
          {signedUp === 0 ? (
            "Nobody signed up yet"
          ) : (
            <>
              {signedUp} signed up · {paid} paid
              {owes > 0 && (
                <span className="text-yellow-400"> · {owes} still owe</span>
              )}
              {noWaiver > 0 && (
                <span className="text-red-400"> · {noWaiver} no waiver</span>
              )}
            </>
          )}
        </p>
        <span className="mt-3 inline-flex items-center gap-1 text-xs text-brand group-hover:gap-2 transition-all">
          Open <ArrowRight size={12} />
        </span>
      </div>
    </Link>
  );
}
