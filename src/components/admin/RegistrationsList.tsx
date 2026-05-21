"use client";

import Link from "next/link";
import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
  User,
  X,
  XCircle,
} from "lucide-react";
import { isContactWaiverValid } from "@/lib/contacts";
import type { WaiverType } from "@/lib/types";

/**
 * Imperative handle exposed to parents (e.g. Admin Overview's Payments tab
 * still needs to force a refresh after a Stripe sync updates payment_status).
 */
export type RegistrationsListHandle = {
  refresh: () => void;
};

export type RegistrationsListProps = {
  /**
   * When provided, the list is filtered to a single tournament. The Tournament
   * column and overview stats cards are also hidden, since they're redundant
   * in a per-tournament context.
   */
  tournamentId?: string;
  /**
   * Notifies the parent of the current total count after a successful fetch.
   * Used by the Overview page to drive its header counter and tab badge.
   */
  onCountChange?: (count: number) => void;
  /**
   * Optional controlled waiver filter. When both `filter` and `onFilterChange`
   * are supplied, the parent owns the filter state and can mirror it to the
   * URL (Phase 4). When omitted, the component falls back to internal state
   * so existing call sites (e.g. the tournament view page) keep working.
   */
  filter?: RegistrationsFilter;
  onFilterChange?: (next: RegistrationsFilter) => void;
};

type LinkedPayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  tournament_id: string | null;
  tournament_name: string | null;
  created_at: string;
};

type LinkedContact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  tags: string[];
  waiver_type: WaiverType | null;
  waiver_signed_at: string | null;
  waiver_expires_at: string | null;
};

type LinkedTournament = {
  id: string;
  title: string;
  slug: string;
};

type Registration = {
  id: string;
  created_at: string;
  tournament_id: string | null;
  contact_id: string | null;
  registration_type: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  dob: string;
  emergency_name: string;
  emergency_phone: string;
  waiver_type: string;
  waiver_signed: boolean;
  waiver_signed_at: string | null;
  waiver_submission_id: string | null;
  waiver_match_key: string;
  waiver_document_url: string | null;
  payment_status: string;
  docuseal_status: string;
  docuseal_sign_url: string | null;
  docuseal_submission_id: number | null;
  tournament: LinkedTournament | null;
  contact: LinkedContact | null;
  payments: LinkedPayment[] | null;
};

type SortField =
  | "created_at"
  | "last_name"
  | "waiver_signed"
  | "registration_type"
  | "payment_status";
export type RegistrationsFilter = "all" | "signed" | "unsigned";
type Filter = RegistrationsFilter;

type WaiverPillTone = "ok" | "pending" | "missing";
type WaiverPill = { label: string; tone: WaiverPillTone };

type RegistrationsResponse = {
  registrations?: Registration[];
  error?: string;
  _debug?: {
    code?: string;
    message?: string;
    hint?: string;
    details?: string;
  };
};

function handleAuthLost(): void {
  if (typeof window !== "undefined") window.location.reload();
}

function deriveWaiverPill(r: Registration): WaiverPill {
  const waiverType: WaiverType = r.registration_type === "youth" ? "youth" : "adult";
  const contactSlice = r.contact
    ? {
        waiver_type: r.contact.waiver_type,
        waiver_signed_at: r.contact.waiver_signed_at,
        waiver_expires_at: r.contact.waiver_expires_at,
      }
    : null;
  const onFile = r.waiver_signed || isContactWaiverValid(contactSlice, waiverType);
  if (onFile) return { label: "signed", tone: "ok" };
  if (r.docuseal_status === "sent") return { label: "sent", tone: "pending" };
  return { label: r.docuseal_status || "missing", tone: "missing" };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

function getLinkedPaymentTotal(r: Registration): number {
  if (!r.payments?.length) return 0;
  return r.payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + Number(p.amount), 0);
}

const RegistrationsList = forwardRef<
  RegistrationsListHandle,
  RegistrationsListProps
>(function RegistrationsList(
  { tournamentId, onCountChange, filter: filterProp, onFilterChange },
  ref,
) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [regLoading, setRegLoading] = useState(true);
  const [regError, setRegError] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [internalFilter, setInternalFilter] = useState<Filter>("all");
  const isFilterControlled =
    filterProp !== undefined && onFilterChange !== undefined;
  const filter: Filter = isFilterControlled ? filterProp : internalFilter;
  const setFilter = (next: Filter) => {
    if (isFilterControlled) onFilterChange(next);
    else setInternalFilter(next);
  };
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [waiverViewUrl, setWaiverViewUrl] = useState<string | null>(null);

  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markedId, setMarkedId] = useState<string | null>(null);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [paidId, setPaidId] = useState<string | null>(null);

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resentId, setResentId] = useState<string | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const loadRegistrations = useCallback(() => {
    setRegLoading(true);
    const url = tournamentId
      ? `/api/admin/registrations?tournament_id=${encodeURIComponent(tournamentId)}`
      : "/api/admin/registrations";
    fetch(url)
      .then((res) => {
        if (res.status === 401) {
          handleAuthLost();
          return null;
        }
        return res.json() as Promise<RegistrationsResponse>;
      })
      .then((data) => {
        if (!data) return;
        if (data.error) {
          const debugInfo = data._debug
            ? ` [${data._debug.code ?? ""}] ${data._debug.message ?? ""} | hint: ${data._debug.hint ?? ""} | details: ${data._debug.details ?? ""}`
            : "";
          setRegError(data.error + debugInfo);
          return;
        }
        const list: Registration[] = data.registrations ?? [];
        setRegistrations(list);
        setRegError("");
        onCountChange?.(list.length);
      })
      .catch(() => setRegError("Failed to load registrations."))
      .finally(() => setRegLoading(false));
  }, [tournamentId, onCountChange]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  useImperativeHandle(
    ref,
    () => ({ refresh: loadRegistrations }),
    [loadRegistrations]
  );

  const handleSyncWaivers = async (): Promise<void> => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync-waivers", { method: "POST" });
      const data = (await res.json()) as {
        synced?: number;
        total?: number;
        error?: string;
      };
      if (!res.ok) {
        setSyncResult(data.error || "Sync failed.");
        return;
      }
      setSyncResult(
        `Synced ${data.synced ?? 0} of ${data.total ?? 0} pending waivers.`
      );
      if ((data.synced ?? 0) > 0) loadRegistrations();
    } catch {
      setSyncResult("Sync request failed.");
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkSigned = async (id: string): Promise<void> => {
    if (
      !window.confirm(
        "Are you sure you want to mark this waiver as signed? This should only be done after verifying the waiver was completed."
      )
    )
      return;
    setMarkingId(id);
    try {
      const res = await fetch("/api/admin/override-waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error || "Failed to override waiver.");
        return;
      }
      setMarkedId(id);
      loadRegistrations();
      setTimeout(() => setMarkedId(null), 2000);
    } catch {
      alert("Request failed. Please try again.");
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkPaid = async (id: string): Promise<void> => {
    if (
      !window.confirm(
        "Mark this registration as paid? This updates the registration's payment_status; it does not create a Stripe payment record."
      )
    )
      return;
    setPayingId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_status: "paid" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error || "Failed to mark as paid.");
        return;
      }
      setPaidId(id);
      loadRegistrations();
      setTimeout(() => setPaidId(null), 2000);
    } catch {
      alert("Request failed. Please try again.");
    } finally {
      setPayingId(null);
    }
  };

  const handleResendWaiver = async (id: string): Promise<void> => {
    setResendingId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}/resend-waiver`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string; resent?: number };
      if (!res.ok) {
        alert(data.error || "Failed to resend waiver.");
        return;
      }
      setResentId(id);
      setTimeout(() => setResentId(null), 2000);
    } catch {
      alert("Request failed. Please try again.");
    } finally {
      setResendingId(null);
    }
  };

  const handleUnregister = async (id: string): Promise<void> => {
    if (
      !window.confirm(
        "Unregister this player from this tournament? The registration row will be deleted. Their contact and any past payments will remain."
      )
    )
      return;
    setRemovingId(id);
    try {
      const res = await fetch(`/api/admin/registrations/${id}`, {
        method: "DELETE",
      });
      const data = (await res
        .json()
        .catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        alert(data?.error || "Failed to unregister.");
        return;
      }
      loadRegistrations();
    } catch {
      alert("Request failed. Please try again.");
    } finally {
      setRemovingId(null);
    }
  };

  const handleSort = (field: SortField): void => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleCopyLink = (id: string, url: string): void => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const filtered = registrations.filter((r) => {
    if (filter === "signed") return r.waiver_signed;
    if (filter === "unsigned") return !r.waiver_signed;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "created_at":
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case "last_name":
        cmp = a.last_name.localeCompare(b.last_name);
        break;
      case "waiver_signed":
        cmp = Number(a.waiver_signed) - Number(b.waiver_signed);
        break;
      case "registration_type":
        cmp = a.registration_type.localeCompare(b.registration_type);
        break;
      case "payment_status":
        cmp = a.payment_status.localeCompare(b.payment_status);
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const totalSigned = registrations.filter((r) => r.waiver_signed).length;
  const totalUnsigned = registrations.filter((r) => !r.waiver_signed).length;
  const totalPaid = registrations.filter(
    (r) => r.payment_status === "paid"
  ).length;

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? (
      sortAsc ? (
        <ChevronUp size={14} className="inline ml-1" />
      ) : (
        <ChevronDown size={14} className="inline ml-1" />
      )
    ) : null;

  const handleExportCsv = (): void => {
    const headers = [
      "Name",
      "Email",
      "Phone",
      "DOB",
      "Type",
      "Waiver",
      "Waiver Signed At",
      "Payment Status",
      "Amount Paid",
      "Emergency Contact",
      "Emergency Phone",
      "Registered",
    ];
    const rows = sorted.map((r) => [
      `${r.first_name} ${r.last_name}`,
      r.email,
      r.phone,
      r.dob,
      r.registration_type,
      r.waiver_signed ? "Yes" : "No",
      r.waiver_signed_at ? formatDate(r.waiver_signed_at) : "",
      r.payment_status,
      getLinkedPaymentTotal(r) || "",
      r.emergency_name,
      r.emergency_phone,
      formatDate(r.created_at),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showTournamentColumn = !tournamentId;
  const showStatsCards = !tournamentId;
  const colSpan = showTournamentColumn ? 7 : 6;

  return (
    <>
      {/* Waiver PDF modal */}
      {waiverViewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setWaiverViewUrl(null)}
        >
          <div
            className="relative w-full max-w-3xl h-[80vh] bg-surface rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-token">
              <span className="text-sm font-medium text-white">Signed Waiver</span>
              <div className="flex items-center gap-2">
                <a
                  href={waiverViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  <ExternalLink size={12} /> Open in new tab
                </a>
                <button
                  onClick={() => setWaiverViewUrl(null)}
                  className="text-zinc-400 hover:text-white ml-2"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <iframe
              src={waiverViewUrl}
              className="w-full h-full border-0"
              title="Signed Waiver Document"
            />
          </div>
        </div>
      )}

      {regError && <p className="text-red-400">{regError}</p>}
      {syncResult && (
        <p
          className={`text-sm px-3 py-2 rounded-lg ${
            syncResult.startsWith("Synced")
              ? "bg-brand/10 text-brand"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {syncResult}
        </p>
      )}

      {regLoading ? (
        <div className="flex items-center gap-3 text-zinc-400 py-8">
          <Loader2 size={24} className="animate-spin" />
          <span>Loading registrations…</span>
        </div>
      ) : (
        <>
          {showStatsCards && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="dashboard-card p-4 text-center">
                <p className="text-2xl font-bold text-white">{registrations.length}</p>
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Total</p>
              </div>
              <div className="dashboard-card p-4 text-center">
                <p className="text-2xl font-bold text-brand">{totalSigned}</p>
                <p className="text-xs text-zinc-400 uppercase tracking-wide">
                  Waiver Signed
                </p>
              </div>
              <div className="dashboard-card p-4 text-center">
                <p className="text-2xl font-bold text-red-400">{totalUnsigned}</p>
                <p className="text-xs text-zinc-400 uppercase tracking-wide">
                  Pending Waiver
                </p>
              </div>
              <div className="dashboard-card p-4 text-center">
                <div className="flex justify-center mb-1">
                  <DollarSign size={16} className="text-brand" />
                </div>
                <p className="text-2xl font-bold text-brand">{totalPaid}</p>
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Paid</p>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-surface-2 rounded-lg p-1">
              {(["all", "signed", "unsigned"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    filter === f
                      ? "bg-base text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {f === "all" ? "All" : f === "signed" ? "Signed" : "Pending"}
                </button>
              ))}
            </div>
            <button
              onClick={handleSyncWaivers}
              disabled={syncing}
              className="ml-auto inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-border-token rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync Waivers"}
            </button>
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-border-token rounded-lg px-3 py-1.5 transition-colors"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>

          {/* Table */}
          <div className="dashboard-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-token text-left">
                    <th
                      className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort("last_name")}
                    >
                      Name <SortIcon field="last_name" />
                    </th>
                    <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">
                      Email
                    </th>
                    {showTournamentColumn && (
                      <th className="px-4 py-3 text-zinc-400 font-medium hidden lg:table-cell">
                        Tournament
                      </th>
                    )}
                    <th
                      className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort("registration_type")}
                    >
                      Type <SortIcon field="registration_type" />
                    </th>
                    <th
                      className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort("waiver_signed")}
                    >
                      Waiver <SortIcon field="waiver_signed" />
                    </th>
                    <th
                      className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort("payment_status")}
                    >
                      Payment <SortIcon field="payment_status" />
                    </th>
                    <th
                      className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white hidden sm:table-cell"
                      onClick={() => handleSort("created_at")}
                    >
                      Registered <SortIcon field="created_at" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const waiverPill = deriveWaiverPill(r);
                    const waiverToneClass =
                      waiverPill.tone === "ok"
                        ? "bg-brand/20 text-brand"
                        : waiverPill.tone === "pending"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "bg-base text-zinc-400";
                    const docUrl = r.waiver_document_url;
                    const signUrl = r.docuseal_sign_url;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          className="border-b border-border-token hover:bg-surface-2/50 cursor-pointer transition-colors"
                          onClick={() =>
                            setExpandedId(expandedId === r.id ? null : r.id)
                          }
                        >
                          <td className="px-4 py-3 text-white font-medium">
                            {r.first_name} {r.last_name}
                          </td>
                          <td className="px-4 py-3 text-zinc-300 hidden md:table-cell">
                            {r.email}
                          </td>
                          {showTournamentColumn && (
                            <td className="px-4 py-3 text-zinc-300 hidden lg:table-cell">
                              {r.tournament ? (
                                <Link
                                  href={`/admin/tournaments/${r.tournament.id}`}
                                  className="text-brand hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {r.tournament.title}
                                </Link>
                              ) : (
                                <span className="text-yellow-400 text-xs">
                                  unlinked
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                r.registration_type === "youth"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-base text-zinc-300"
                              }`}
                            >
                              {r.registration_type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${waiverToneClass}`}
                            >
                              {waiverPill.tone === "ok" ? (
                                <CheckCircle size={12} />
                              ) : (
                                <XCircle size={12} />
                              )}
                              {waiverPill.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                                r.payment_status === "paid"
                                  ? "bg-brand/20 text-brand"
                                  : r.payment_status === "pending"
                                    ? "bg-yellow-500/20 text-yellow-400"
                                    : "bg-base text-zinc-400"
                              }`}
                            >
                              {r.payment_status === "paid" ? (
                                <CheckCircle size={12} />
                              ) : (
                                <XCircle size={12} />
                              )}
                              {r.payment_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell">
                            {formatDate(r.created_at)}
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {expandedId === r.id && (
                          <tr>
                            <td
                              colSpan={colSpan}
                              className="bg-surface-2/40 px-4 py-4"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                {showTournamentColumn && (
                                  <div>
                                    <p className="text-zinc-500 text-xs uppercase">
                                      Tournament
                                    </p>
                                    <p className="text-zinc-200">
                                      {r.tournament ? (
                                        <Link
                                          href={`/admin/tournaments/${r.tournament.id}`}
                                          className="text-brand hover:underline"
                                        >
                                          {r.tournament.title}
                                        </Link>
                                      ) : (
                                        <span className="text-yellow-400">
                                          Not linked to a tournament
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-zinc-500 text-xs uppercase">
                                    Contact
                                  </p>
                                  <p className="text-zinc-200">
                                    {r.contact ? (
                                      <Link
                                        href={`/admin/contacts?q=${encodeURIComponent(r.contact.email)}`}
                                        className="text-brand hover:underline"
                                      >
                                        {r.contact.first_name} {r.contact.last_name}
                                      </Link>
                                    ) : (
                                      <span className="text-yellow-400">
                                        No contact link
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-500 text-xs uppercase">
                                    Email
                                  </p>
                                  <p className="text-zinc-200">{r.email}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500 text-xs uppercase">
                                    Phone
                                  </p>
                                  <p className="text-zinc-200">{r.phone}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500 text-xs uppercase">
                                    Date of Birth
                                  </p>
                                  <p className="text-zinc-200">{r.dob}</p>
                                </div>
                                <div>
                                  <p className="text-zinc-500 text-xs uppercase">
                                    Emergency Contact
                                  </p>
                                  <p className="text-zinc-200">
                                    {r.emergency_name} — {r.emergency_phone}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-500 text-xs uppercase">
                                    Waiver Signed At
                                  </p>
                                  <p className="text-zinc-200">
                                    {r.waiver_signed_at
                                      ? formatDate(r.waiver_signed_at)
                                      : "Not signed"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-zinc-500 text-xs uppercase">
                                    Payment Status
                                  </p>
                                  <p className="text-zinc-200 capitalize">
                                    {r.payment_status}
                                  </p>
                                </div>

                                {r.payments && r.payments.length > 0 ? (
                                  <div className="sm:col-span-2 lg:col-span-3">
                                    <p className="text-zinc-500 text-xs uppercase mb-2">
                                      Payments
                                    </p>
                                    <div className="space-y-1.5">
                                      {r.payments.map((p) => (
                                        <div
                                          key={p.id}
                                          className="flex items-center gap-3 bg-surface-2/60 rounded-lg px-3 py-2"
                                        >
                                          <span
                                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                                              p.status === "succeeded"
                                                ? "bg-brand/20 text-brand"
                                                : "bg-yellow-500/20 text-yellow-400"
                                            }`}
                                          >
                                            {p.status === "succeeded" ? (
                                              <CheckCircle size={10} />
                                            ) : (
                                              <XCircle size={10} />
                                            )}
                                            {p.status}
                                          </span>
                                          <span className="text-white font-semibold">
                                            {formatCurrency(p.amount, p.currency)}
                                          </span>
                                          {p.tournament_name && (
                                            <span className="text-zinc-400 text-xs">
                                              {p.tournament_name}
                                            </span>
                                          )}
                                          <span className="text-zinc-500 text-xs ml-auto">
                                            {formatDate(p.created_at)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="sm:col-span-2 lg:col-span-3">
                                    <p className="text-zinc-500 text-xs uppercase mb-1">
                                      Payments
                                    </p>
                                    <p className="text-zinc-500 text-sm italic">
                                      No payments linked to this registration.
                                    </p>
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3 pt-2 border-t border-border-token/50">
                                  {r.contact ? (
                                    <Link
                                      href={`/admin/contacts?q=${encodeURIComponent(r.contact.email)}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white"
                                    >
                                      <User size={14} />
                                      View contact
                                    </Link>
                                  ) : (
                                    <span
                                      className="inline-flex items-center gap-1.5 text-sm text-zinc-600 cursor-not-allowed"
                                      title="No contact linked to this registration"
                                    >
                                      <User size={14} />
                                      View contact
                                    </span>
                                  )}

                                  {r.docuseal_status === "signed" && docUrl && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setWaiverViewUrl(docUrl);
                                      }}
                                      className="inline-flex items-center gap-1.5 text-sm text-brand hover:text-brand-hover"
                                    >
                                      <FileText size={14} />
                                      View Signed Waiver
                                    </button>
                                  )}
                                  {signUrl && (
                                    <a
                                      href={signUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
                                    >
                                      <ExternalLink size={14} />
                                      View on DocuSeal
                                    </a>
                                  )}
                                  {signUrl && r.docuseal_status !== "signed" && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCopyLink(r.id, signUrl);
                                      }}
                                      className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
                                    >
                                      <Copy size={14} />
                                      {copiedId === r.id
                                        ? "Copied!"
                                        : "Copy Waiver Link"}
                                    </button>
                                  )}
                                  {r.docuseal_status !== "signed" &&
                                    r.docuseal_submission_id && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleResendWaiver(r.id);
                                        }}
                                        disabled={resendingId === r.id}
                                        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white disabled:opacity-50"
                                      >
                                        {resendingId === r.id ? (
                                          <Loader2
                                            size={14}
                                            className="animate-spin"
                                          />
                                        ) : (
                                          <Mail size={14} />
                                        )}
                                        {resentId === r.id
                                          ? "Sent!"
                                          : resendingId === r.id
                                            ? "Sending…"
                                            : "Resend waiver"}
                                      </button>
                                    )}
                                  {r.waiver_signed ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-brand/20 text-brand">
                                      <CheckCircle size={12} />
                                      Signed
                                    </span>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMarkSigned(r.id);
                                      }}
                                      disabled={markingId === r.id}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-brand/20 text-brand hover:bg-brand/30 transition-colors disabled:opacity-50"
                                    >
                                      {markingId === r.id ? (
                                        <Loader2
                                          size={12}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <CheckCircle size={12} />
                                      )}
                                      {markedId === r.id
                                        ? "Marked!"
                                        : markingId === r.id
                                          ? "Saving…"
                                          : "Mark as Signed"}
                                    </button>
                                  )}
                                  {r.payment_status !== "paid" && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMarkPaid(r.id);
                                      }}
                                      disabled={payingId === r.id}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-brand/20 text-brand hover:bg-brand/30 transition-colors disabled:opacity-50"
                                    >
                                      {payingId === r.id ? (
                                        <Loader2
                                          size={12}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <DollarSign size={12} />
                                      )}
                                      {paidId === r.id
                                        ? "Paid!"
                                        : payingId === r.id
                                          ? "Saving…"
                                          : "Mark as Paid"}
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUnregister(r.id);
                                    }}
                                    disabled={removingId === r.id}
                                    className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-300 hover:text-red-200 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                  >
                                    {removingId === r.id ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      <Trash2 size={12} />
                                    )}
                                    {removingId === r.id
                                      ? "Removing…"
                                      : "Unregister"}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {sorted.length === 0 && (
                    <tr>
                      <td
                        colSpan={colSpan}
                        className="px-4 py-8 text-center text-zinc-500"
                      >
                        No registrations found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
});

export default RegistrationsList;
