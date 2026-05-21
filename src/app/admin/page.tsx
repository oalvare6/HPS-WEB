"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Section } from "@/components/shared/section";
import RegistrationsList, {
  type RegistrationsFilter,
  type RegistrationsListHandle,
} from "@/components/admin/RegistrationsList";
import { useQueryParam } from "@/lib/admin-url-state";
import { useScrollRestoration } from "@/lib/use-scroll-restoration";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Download,
  ExternalLink,
  CreditCard,
  Users,
  DollarSign,
  ClipboardList,
  RefreshCw,
  Trophy,
  Settings,
  ArrowRight,
  Ticket,
} from "lucide-react";
import { StatCardsSkeleton, TableSkeleton } from "@/components/shared/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

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

type AdminTab = "registrations" | "payments";

/**
 * If the cookie expired mid-session, the API returns 401. Force a reload so the
 * AdminGate in the layout re-checks `/api/admin/me` and shows the login form.
 */
function handleAuthLost() {
  if (typeof window !== "undefined") window.location.reload();
}

type HubLink = {
  href: string;
  title: string;
  description: string;
  icon: typeof Trophy;
  external?: boolean;
  badgeKey?: "tournaments";
};

const HUB_LINKS: HubLink[] = [
  {
    href: "/admin/tournaments",
    title: "Tournaments",
    description:
      "Add, edit, reorder, feature on homepage, or post per-tournament updates.",
    icon: Trophy,
    badgeKey: "tournaments",
  },
  {
    href: "/admin/contacts",
    title: "Contacts",
    description:
      "Canonical people records. Search, merge duplicates, edit tags and opt-in.",
    icon: Users,
  },
  {
    href: "/admin/drop-ins",
    title: "Drop-ins",
    description:
      "One-night guest plays. Create a drop-in, generate a Stripe pay link, mark paid.",
    icon: Ticket,
  },
  {
    href: "/admin/site",
    title: "Site settings",
    description: "Edit homepage status pills, footer address, and shared links.",
    icon: Settings,
  },
  {
    href: "/",
    title: "View public site",
    description: "Open the live homepage in a new tab.",
    icon: ExternalLink,
    external: true,
  },
];

type OverviewStats = { featuredCount: number; updatesThisWeek: number };

function isAdminTab(value: string): value is AdminTab {
  return value === "registrations" || value === "payments";
}

function isWaiverFilter(value: string): value is RegistrationsFilter {
  return value === "all" || value === "signed" || value === "unsigned";
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageContent />
    </Suspense>
  );
}

function AdminPageContent() {
  useScrollRestoration("admin-overview");

  const [tabParam, setTabParam] = useQueryParam("tab", "registrations");
  const activeTab: AdminTab = isAdminTab(tabParam) ? tabParam : "registrations";
  const setActiveTab = (next: AdminTab) => {
    setTabParam(next === "registrations" ? null : next);
  };

  const [waiverParam, setWaiverParam] = useQueryParam("waiver", "all");
  const waiverFilter: RegistrationsFilter = isWaiverFilter(waiverParam)
    ? waiverParam
    : "all";
  const setWaiverFilter = (next: RegistrationsFilter) => {
    setWaiverParam(next === "all" ? null : next);
  };

  const registrationsRef = useRef<RegistrationsListHandle | null>(null);
  const [registrationsCount, setRegistrationsCount] = useState(0);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview-stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setOverviewStats(data as OverviewStats);
      })
      .catch(() => {});
  }, []);

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
    if (activeTab === "payments") loadPayments();
  }, [activeTab, loadPayments]);

  const totalRevenue = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const succeededPayments = payments.filter((p) => p.status === "succeeded").length;

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

  const handleExportPaymentsCsv = () => {
    const headers = [
      "Name",
      "Email",
      "Tournament",
      "Amount",
      "Currency",
      "Status",
      "Stripe Session",
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
            Admin Overview
          </h1>
          <p className="text-zinc-400">
            {registrationsCount} registrations · {succeededPayments} payments ·{" "}
            {formatCurrency(totalRevenue)} revenue
          </p>
        </div>
      </section>

      {/* Hub: jump to every editable area */}
      <Section dark className="bg-surface !pt-8 md:!pt-12 !pb-4" container={false}>
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
            Manage
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {HUB_LINKS.map((link) => {
              const Icon = link.icon;
              const showTournamentsBadge =
                link.badgeKey === "tournaments" && overviewStats !== null;
              const inner = (
                <div className="dashboard-card p-5 h-full hover:border-brand/50 transition-colors group">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center text-brand">
                      <Icon size={18} />
                    </div>
                    <h3 className="text-base font-semibold text-white">
                      {link.title}
                    </h3>
                  </div>
                  <p className="text-sm text-zinc-400 mb-3">{link.description}</p>
                  {showTournamentsBadge && (
                    <p className="text-xs text-zinc-500 mb-3">
                      <span
                        className={
                          overviewStats!.featuredCount > 0
                            ? "text-brand font-medium"
                            : "text-zinc-500"
                        }
                      >
                        {overviewStats!.featuredCount} featured
                      </span>
                      <span className="mx-1.5 text-zinc-600">·</span>
                      <span
                        className={
                          overviewStats!.updatesThisWeek > 0
                            ? "text-brand font-medium"
                            : "text-zinc-500"
                        }
                      >
                        {overviewStats!.updatesThisWeek} update
                        {overviewStats!.updatesThisWeek === 1 ? "" : "s"} this week
                      </span>
                    </p>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-brand group-hover:gap-2 transition-all">
                    {link.external ? "Open" : "Open"} <ArrowRight size={12} />
                  </span>
                </div>
              );
              if (link.external) {
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {inner}
                  </a>
                );
              }
              return (
                <Link key={link.href} href={link.href}>
                  {inner}
                </Link>
              );
            })}
          </div>
        </div>
      </Section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-6xl mx-auto px-6 space-y-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
            Operations
          </h2>

          {/* Tabs */}
          <div className="flex gap-1 bg-surface-2 rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab("registrations")}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === "registrations"
                  ? "bg-base text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Users size={15} />
              Registrations
              <span className="text-xs bg-surface-2 rounded px-1.5 py-0.5">
                {registrationsCount}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("payments")}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === "payments"
                  ? "bg-base text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <CreditCard size={15} />
              Payments
              {succeededPayments > 0 && (
                <span className="text-xs bg-brand-deep rounded px-1.5 py-0.5">
                  {succeededPayments}
                </span>
              )}
            </button>
          </div>

          {/* Registrations tab content — kept mounted so the count badge stays
              accurate when the user is on Payments. */}
          <div
            hidden={activeTab !== "registrations"}
            className="space-y-6"
          >
            <RegistrationsList
              ref={registrationsRef}
              onCountChange={setRegistrationsCount}
              filter={waiverFilter}
              onFilterChange={setWaiverFilter}
            />
          </div>

          {/* ── PAYMENTS TAB ── */}
          {activeTab === "payments" && (
            <>
              {payError && <p className="text-red-400">{payError}</p>}
              {payLoading ? (
                <div className="space-y-6">
                  <StatCardsSkeleton count={4} />
                  <TableSkeleton rows={6} columns={6} />
                </div>
              ) : (
                <>
                  {/* Payment Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="dashboard-card p-4 text-center">
                      <div className="flex justify-center mb-1">
                        <DollarSign size={18} className="text-brand" />
                      </div>
                      <p className="text-2xl font-bold text-brand">
                        {formatCurrency(totalRevenue)}
                      </p>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">
                        Total Revenue
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
                        Succeeded
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
                        Pending
                      </p>
                    </div>
                    <div className="dashboard-card p-4 text-center">
                      <div className="flex justify-center mb-1">
                        <XCircle size={18} className="text-red-400" />
                      </div>
                      <p className="text-2xl font-bold text-red-400">
                        {
                          payments.filter(
                            (p) => p.status === "refunded" || p.status === "failed"
                          ).length
                        }
                      </p>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">
                        Refunded / Failed
                      </p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex flex-wrap items-center gap-3 justify-end">
                    <button
                      onClick={async () => {
                        setSyncing(true);
                        setSyncResult(null);
                        try {
                          const res = await fetch("/api/admin/sync-payments", {
                            method: "POST",
                          });
                          const data = await res.json();
                          if (data.error) {
                            setSyncResult(`Error: ${data.error}`);
                          } else {
                            setSyncResult(
                              `Synced ${data.synced} new payment(s), ${data.skipped} already recorded.`
                            );
                            if (data.synced > 0) {
                              loadPayments();
                              registrationsRef.current?.refresh();
                            }
                          }
                        } catch {
                          setSyncResult("Sync failed.");
                        } finally {
                          setSyncing(false);
                        }
                      }}
                      disabled={syncing}
                      className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-border-token rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                      {syncing ? "Syncing…" : "Sync from Stripe"}
                    </button>
                    <button
                      onClick={handleExportPaymentsCsv}
                      className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-border-token rounded-lg px-3 py-1.5 transition-colors"
                    >
                      <Download size={14} />
                      Export CSV
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

                  {/* Payments Table */}
                  {payments.length === 0 ? (
                    <AdminEmptyState
                      icon={CreditCard}
                      title="No payments yet"
                      description="When players complete Stripe checkout, payments appear here. Sync from Stripe if you expect recent charges."
                      actionLabel="Sync from Stripe"
                      onAction={async () => {
                        setSyncing(true);
                        setSyncResult(null);
                        try {
                          const res = await fetch("/api/admin/sync-payments", {
                            method: "POST",
                          });
                          const data = await res.json();
                          if (data.error) {
                            setSyncResult(`Error: ${data.error}`);
                          } else {
                            setSyncResult(
                              `Synced ${data.synced} new payment(s), ${data.skipped} already recorded.`
                            );
                            if (data.synced > 0) {
                              loadPayments();
                              registrationsRef.current?.refresh();
                            }
                          }
                        } catch {
                          setSyncResult("Sync failed.");
                        } finally {
                          setSyncing(false);
                        }
                      }}
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
                              Tournament
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
                                    href={`/admin/tournaments/${p.tournament.id}/edit`}
                                    className="text-brand hover:underline"
                                  >
                                    {p.tournament.title}
                                  </Link>
                                ) : p.tournament_name ? (
                                  <span className="text-zinc-300">
                                    {p.tournament_name}{" "}
                                    <span className="text-yellow-400 text-xs">
                                      (unlinked)
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-zinc-500">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-white font-semibold">
                                {formatCurrency(p.amount, p.currency)}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                                    p.status === "succeeded"
                                      ? "bg-brand/20 text-brand"
                                      : p.status === "pending"
                                        ? "bg-yellow-500/20 text-yellow-400"
                                        : "bg-red-500/20 text-red-400"
                                  }`}
                                >
                                  {p.status === "succeeded" ? (
                                    <CheckCircle size={12} />
                                  ) : (
                                    <XCircle size={12} />
                                  )}
                                  {p.status}
                                </span>
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
            </>
          )}
        </div>
      </Section>
    </>
  );
}
