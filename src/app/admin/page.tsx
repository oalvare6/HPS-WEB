"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Section } from "@/components/shared/section";
import {
  Loader2,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Lock,
  Copy,
  ExternalLink,
  CreditCard,
  Users,
  DollarSign,
  ClipboardList,
  RefreshCw,
  FileText,
  X,
} from "lucide-react";

type LinkedPayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  tournament_name: string | null;
  created_at: string;
};

type Registration = {
  id: string;
  created_at: string;
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
  payments: LinkedPayment[] | null;
};

type Payment = {
  id: string;
  created_at: string;
  email: string;
  amount: number;
  currency: string;
  tournament_name: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  status: string;
  notes: string | null;
  registrations: { first_name: string; last_name: string } | null;
};

type SortField = "created_at" | "last_name" | "waiver_signed" | "registration_type" | "payment_status";
type Filter = "all" | "signed" | "unsigned";
type AdminTab = "registrations" | "payments";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [loginLoading, setLoginLoading] = useState(true);
  const [loginError, setLoginError] = useState("");

  const [activeTab, setActiveTab] = useState<AdminTab>("registrations");

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [waiverViewUrl, setWaiverViewUrl] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markedId, setMarkedId] = useState<string | null>(null);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const loadRegistrations = () => {
    setRegLoading(true);
    fetch("/api/admin/registrations")
      .then((res) => {
        if (res.status === 401) { setAuthed(false); return null; }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.error) {
          const debugInfo = data._debug ? ` [${data._debug.code}] ${data._debug.message} | hint: ${data._debug.hint} | details: ${data._debug.details}` : "";
          setRegError(data.error + debugInfo);
          return;
        }
        setRegistrations(data.registrations);
        setAuthed(true);
      })
      .catch(() => setRegError("Failed to load registrations."))
      .finally(() => { setRegLoading(false); setLoginLoading(false); });
  };

  const loadPayments = useCallback(() => {
    setPayLoading(true);
    fetch("/api/admin/payments")
      .then((res) => {
        if (res.status === 401) { setAuthed(false); return null; }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.error) { setPayError(data.error); return; }
        setPayments(data.payments);
      })
      .catch(() => setPayError("Failed to load payments."))
      .finally(() => setPayLoading(false));
  }, []);

  useEffect(() => { loadRegistrations(); }, []);

  useEffect(() => {
    if (authed && activeTab === "payments") loadPayments();
  }, [authed, activeTab, loadPayments]);

  const handleSyncWaivers = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync-waivers", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setSyncResult(data.error || "Sync failed."); return; }
      setSyncResult(`Synced ${data.synced} of ${data.total} pending waivers.`);
      if (data.synced > 0) loadRegistrations();
    } catch {
      setSyncResult("Sync request failed.");
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkSigned = async (id: string) => {
    if (!window.confirm("Are you sure you want to mark this waiver as signed? This should only be done after verifying the waiver was completed.")) return;
    setMarkingId(id);
    try {
      const res = await fetch("/api/admin/override-waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: id }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Failed to override waiver."); return; }
      setMarkedId(id);
      loadRegistrations();
      setTimeout(() => setMarkedId(null), 2000);
    } catch {
      alert("Request failed. Please try again.");
    } finally {
      setMarkingId(null);
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || "Login failed."); setLoginLoading(false); return; }
      setAuthed(true);
      loadRegistrations();
    } catch {
      setLoginError("Login failed. Please try again.");
      setLoginLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const handleCopyLink = (id: string, url: string) => {
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
      case "created_at": cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
      case "last_name": cmp = a.last_name.localeCompare(b.last_name); break;
      case "waiver_signed": cmp = Number(a.waiver_signed) - Number(b.waiver_signed); break;
      case "registration_type": cmp = a.registration_type.localeCompare(b.registration_type); break;
      case "payment_status": cmp = a.payment_status.localeCompare(b.payment_status); break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const totalSigned = registrations.filter((r) => r.waiver_signed).length;
  const totalUnsigned = registrations.filter((r) => !r.waiver_signed).length;
  const totalPaid = registrations.filter((r) => r.payment_status === "paid").length;

  const totalRevenue = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const succeededPayments = payments.filter((p) => p.status === "succeeded").length;

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? (
      sortAsc ? <ChevronUp size={14} className="inline ml-1" /> : <ChevronDown size={14} className="inline ml-1" />
    ) : null;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });

  const formatCurrency = (amount: number, currency = "usd") =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount);

  const getLinkedPaymentTotal = (r: Registration) => {
    if (!r.payments?.length) return 0;
    return r.payments
      .filter((p) => p.status === "succeeded")
      .reduce((sum, p) => sum + Number(p.amount), 0);
  };

  const handleExportCsv = () => {
    const headers = ["Name","Email","Phone","DOB","Type","Waiver","Waiver Signed At","Payment Status","Amount Paid","Emergency Contact","Emergency Phone","Registered"];
    const rows = sorted.map((r) => [
      `${r.first_name} ${r.last_name}`, r.email, r.phone, r.dob, r.registration_type,
      r.waiver_signed ? "Yes" : "No",
      r.waiver_signed_at ? formatDate(r.waiver_signed_at) : "",
      r.payment_status,
      getLinkedPaymentTotal(r) || "",
      r.emergency_name, r.emergency_phone, formatDate(r.created_at),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPaymentsCsv = () => {
    const headers = ["Name","Email","Tournament","Amount","Currency","Status","Stripe Session","Date"];
    const rows = payments.map((p) => [
      p.registrations ? `${p.registrations.first_name} ${p.registrations.last_name}` : "",
      p.email, p.tournament_name ?? "", p.amount, p.currency, p.status,
      p.stripe_session_id ?? "", formatDate(p.created_at),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Login / loading gates ── */

  if (loginLoading && !authed) {
    return (
      <Section dark className="bg-zinc-900 min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-zinc-400">
          <Loader2 size={40} className="animate-spin" />
        </div>
      </Section>
    );
  }

  if (!authed) {
    return (
      <Section dark className="bg-zinc-900 min-h-[80vh] flex items-center justify-center">
        <div className="dashboard-card p-8 max-w-sm w-full">
          <div className="flex flex-col items-center mb-6">
            <Lock size={32} className="text-zinc-400 mb-3" />
            <h2 className="text-xl font-semibold text-white">Admin Login</h2>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
              <input type="text" name="username" required autoComplete="username"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
              <input type="password" name="password" required autoComplete="current-password"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent transition-colors" />
            </div>
            {loginError && <p className="text-sm text-red-400 text-center">{loginError}</p>}
            <button type="submit" className="w-full btn-primary h-12">Log In</button>
          </form>
        </div>
      </Section>
    );
  }

  /* ── Dashboard ── */

  return (
    <>
      {/* Waiver PDF modal */}
      {waiverViewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setWaiverViewUrl(null)}>
          <div className="relative w-full max-w-3xl h-[80vh] bg-zinc-900 rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
              <span className="text-sm font-medium text-white">Signed Waiver</span>
              <div className="flex items-center gap-2">
                <a href={waiverViewUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
                  <ExternalLink size={12} /> Open in new tab
                </a>
                <button onClick={() => setWaiverViewUrl(null)} className="text-zinc-400 hover:text-white ml-2">
                  <X size={18} />
                </button>
              </div>
            </div>
            <iframe src={waiverViewUrl} className="w-full h-full border-0" title="Signed Waiver Document" />
          </div>
        </div>
      )}

      {/* Header */}
      <section className="bg-zinc-950 text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Admin Dashboard</h1>
          <p className="text-zinc-400">
            {registrations.length} registrations · {succeededPayments} payments · {formatCurrency(totalRevenue)} revenue
          </p>
        </div>
      </section>

      <Section dark className="bg-zinc-900 !py-8 md:!py-12" container={false}>
        <div className="max-w-6xl mx-auto px-6 space-y-6">

          {/* Tabs */}
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab("registrations")}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === "registrations" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Users size={15} />
              Registrations
              <span className="text-xs bg-zinc-600 rounded px-1.5 py-0.5">{registrations.length}</span>
            </button>
            <button
              onClick={() => setActiveTab("payments")}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors ${
                activeTab === "payments" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <CreditCard size={15} />
              Payments
              {succeededPayments > 0 && (
                <span className="text-xs bg-green-600 rounded px-1.5 py-0.5">{succeededPayments}</span>
              )}
            </button>
          </div>

          {/* ── REGISTRATIONS TAB ── */}
          {activeTab === "registrations" && (
            <>
              {regError && <p className="text-red-400">{regError}</p>}
              {syncResult && (
                <p className={`text-sm px-3 py-2 rounded-lg ${syncResult.startsWith("Synced") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
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
                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="dashboard-card p-4 text-center">
                      <p className="text-2xl font-bold text-white">{registrations.length}</p>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">Total</p>
                    </div>
                    <div className="dashboard-card p-4 text-center">
                      <p className="text-2xl font-bold text-green-400">{totalSigned}</p>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">Waiver Signed</p>
                    </div>
                    <div className="dashboard-card p-4 text-center">
                      <p className="text-2xl font-bold text-red-400">{totalUnsigned}</p>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">Pending Waiver</p>
                    </div>
                    <div className="dashboard-card p-4 text-center">
                      <div className="flex justify-center mb-1">
                        <DollarSign size={16} className="text-green-400" />
                      </div>
                      <p className="text-2xl font-bold text-green-400">{totalPaid}</p>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">Paid</p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
                      {(["all", "signed", "unsigned"] as Filter[]).map((f) => (
                        <button key={f} onClick={() => setFilter(f)}
                          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                            filter === f ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                          }`}>
                          {f === "all" ? "All" : f === "signed" ? "Signed" : "Pending"}
                        </button>
                      ))}
                    </div>
                    <button onClick={handleSyncWaivers} disabled={syncing}
                      className="ml-auto inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
                      <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                      {syncing ? "Syncing…" : "Sync Waivers"}
                    </button>
                    <button onClick={handleExportCsv}
                      className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
                      <Download size={14} />
                      Export CSV
                    </button>
                  </div>

                  {/* Table */}
                  <div className="dashboard-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-700 text-left">
                            <th className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("last_name")}>
                              Name <SortIcon field="last_name" />
                            </th>
                            <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">Email</th>
                            <th className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("registration_type")}>
                              Type <SortIcon field="registration_type" />
                            </th>
                            <th className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("waiver_signed")}>
                              Waiver <SortIcon field="waiver_signed" />
                            </th>
                            <th className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white" onClick={() => handleSort("payment_status")}>
                              Payment <SortIcon field="payment_status" />
                            </th>
                            <th className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white hidden sm:table-cell" onClick={() => handleSort("created_at")}>
                              Registered <SortIcon field="created_at" />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((r) => (
                            <Fragment key={r.id}>
                              <tr
                                className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                              >
                                <td className="px-4 py-3 text-white font-medium">{r.first_name} {r.last_name}</td>
                                <td className="px-4 py-3 text-zinc-300 hidden md:table-cell">{r.email}</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                    r.registration_type === "youth" ? "bg-blue-500/20 text-blue-400" : "bg-zinc-700 text-zinc-300"
                                  }`}>
                                    {r.registration_type}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                                    r.docuseal_status === "signed"
                                      ? "bg-green-500/20 text-green-400"
                                      : r.docuseal_status === "sent"
                                        ? "bg-yellow-500/20 text-yellow-400"
                                        : "bg-zinc-700 text-zinc-400"
                                  }`}>
                                    {r.docuseal_status === "signed" ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                    {r.docuseal_status}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                                    r.payment_status === "paid"
                                      ? "bg-green-500/20 text-green-400"
                                      : r.payment_status === "pending"
                                        ? "bg-yellow-500/20 text-yellow-400"
                                        : "bg-zinc-700 text-zinc-400"
                                  }`}>
                                    {r.payment_status === "paid" ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                    {r.payment_status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell">{formatDate(r.created_at)}</td>
                              </tr>

                              {/* Expanded detail row */}
                              {expandedId === r.id && (
                                <tr>
                                  <td colSpan={6} className="bg-zinc-800/40 px-4 py-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                      <div>
                                        <p className="text-zinc-500 text-xs uppercase">Email</p>
                                        <p className="text-zinc-200">{r.email}</p>
                                      </div>
                                      <div>
                                        <p className="text-zinc-500 text-xs uppercase">Phone</p>
                                        <p className="text-zinc-200">{r.phone}</p>
                                      </div>
                                      <div>
                                        <p className="text-zinc-500 text-xs uppercase">Date of Birth</p>
                                        <p className="text-zinc-200">{r.dob}</p>
                                      </div>
                                      <div>
                                        <p className="text-zinc-500 text-xs uppercase">Emergency Contact</p>
                                        <p className="text-zinc-200">{r.emergency_name} — {r.emergency_phone}</p>
                                      </div>
                                      <div>
                                        <p className="text-zinc-500 text-xs uppercase">Waiver Signed At</p>
                                        <p className="text-zinc-200">
                                          {r.waiver_signed_at ? formatDate(r.waiver_signed_at) : "Not signed"}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-zinc-500 text-xs uppercase">Payment Status</p>
                                        <p className="text-zinc-200 capitalize">{r.payment_status}</p>
                                      </div>

                                      {/* Linked payments */}
                                      {r.payments && r.payments.length > 0 && (
                                        <div className="sm:col-span-2 lg:col-span-3">
                                          <p className="text-zinc-500 text-xs uppercase mb-2">Payments</p>
                                          <div className="space-y-1.5">
                                            {r.payments.map((p) => (
                                              <div key={p.id} className="flex items-center gap-3 bg-zinc-800/60 rounded-lg px-3 py-2">
                                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                                                  p.status === "succeeded" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                                                }`}>
                                                  {p.status === "succeeded" ? <CheckCircle size={10} /> : <XCircle size={10} />}
                                                  {p.status}
                                                </span>
                                                <span className="text-white font-semibold">{formatCurrency(p.amount, p.currency)}</span>
                                                {p.tournament_name && <span className="text-zinc-400 text-xs">{p.tournament_name}</span>}
                                                <span className="text-zinc-500 text-xs ml-auto">{formatDate(p.created_at)}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {(!r.payments || r.payments.length === 0) && (
                                        <div className="sm:col-span-2 lg:col-span-3">
                                          <p className="text-zinc-500 text-xs uppercase mb-1">Payments</p>
                                          <p className="text-zinc-500 text-sm italic">No payments linked to this registration.</p>
                                        </div>
                                      )}

                                      {/* Actions */}
                                      <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-700/50">
                                        {r.docuseal_status === "signed" && r.waiver_document_url && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setWaiverViewUrl(r.waiver_document_url); }}
                                            className="inline-flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300"
                                          >
                                            <FileText size={14} />
                                            View Signed Waiver
                                          </button>
                                        )}
                                        {r.docuseal_sign_url && (
                                          <a
                                            href={r.docuseal_sign_url}
                                            target="_blank" rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
                                          >
                                            <ExternalLink size={14} />
                                            View on DocuSeal
                                          </a>
                                        )}
                                        {r.docuseal_sign_url && r.docuseal_status !== "signed" && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleCopyLink(r.id, r.docuseal_sign_url!); }}
                                            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
                                          >
                                            <Copy size={14} />
                                            {copiedId === r.id ? "Copied!" : "Copy Waiver Link"}
                                          </button>
                                        )}
                                        {r.waiver_signed ? (
                                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-green-500/20 text-green-400">
                                            <CheckCircle size={12} />
                                            Signed
                                          </span>
                                        ) : (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleMarkSigned(r.id); }}
                                            disabled={markingId === r.id}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                                          >
                                            {markingId === r.id ? (
                                              <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                              <CheckCircle size={12} />
                                            )}
                                            {markedId === r.id ? "Marked!" : markingId === r.id ? "Saving…" : "Mark as Signed"}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                          {sorted.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
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
          )}

          {/* ── PAYMENTS TAB ── */}
          {activeTab === "payments" && (
            <>
              {payError && <p className="text-red-400">{payError}</p>}
              {payLoading ? (
                <div className="flex items-center gap-3 text-zinc-400 py-8">
                  <Loader2 size={24} className="animate-spin" />
                  <span>Loading payments…</span>
                </div>
              ) : (
                <>
                  {/* Payment Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="dashboard-card p-4 text-center">
                      <div className="flex justify-center mb-1">
                        <DollarSign size={18} className="text-green-400" />
                      </div>
                      <p className="text-2xl font-bold text-green-400">{formatCurrency(totalRevenue)}</p>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">Total Revenue</p>
                    </div>
                    <div className="dashboard-card p-4 text-center">
                      <div className="flex justify-center mb-1">
                        <CheckCircle size={18} className="text-green-400" />
                      </div>
                      <p className="text-2xl font-bold text-white">{succeededPayments}</p>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">Succeeded</p>
                    </div>
                    <div className="dashboard-card p-4 text-center">
                      <div className="flex justify-center mb-1">
                        <ClipboardList size={18} className="text-yellow-400" />
                      </div>
                      <p className="text-2xl font-bold text-yellow-400">
                        {payments.filter((p) => p.status === "pending").length}
                      </p>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">Pending</p>
                    </div>
                    <div className="dashboard-card p-4 text-center">
                      <div className="flex justify-center mb-1">
                        <XCircle size={18} className="text-red-400" />
                      </div>
                      <p className="text-2xl font-bold text-red-400">
                        {payments.filter((p) => p.status === "refunded" || p.status === "failed").length}
                      </p>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">Refunded / Failed</p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex flex-wrap items-center gap-3 justify-end">
                    <button
                      onClick={async () => {
                        setSyncing(true);
                        setSyncResult(null);
                        try {
                          const res = await fetch("/api/admin/sync-payments", { method: "POST" });
                          const data = await res.json();
                          if (data.error) {
                            setSyncResult(`Error: ${data.error}`);
                          } else {
                            setSyncResult(`Synced ${data.synced} new payment(s), ${data.skipped} already recorded.`);
                            if (data.synced > 0) {
                              loadPayments();
                              loadRegistrations();
                            }
                          }
                        } catch {
                          setSyncResult("Sync failed.");
                        } finally {
                          setSyncing(false);
                        }
                      }}
                      disabled={syncing}
                      className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                      {syncing ? "Syncing…" : "Sync from Stripe"}
                    </button>
                    <button onClick={handleExportPaymentsCsv}
                      className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
                      <Download size={14} />
                      Export CSV
                    </button>
                  </div>
                  {syncResult && (
                    <p className={`text-sm ${syncResult.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                      {syncResult}
                    </p>
                  )}

                  {/* Payments Table */}
                  <div className="dashboard-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-700 text-left">
                            <th className="px-4 py-3 text-zinc-400 font-medium">Player</th>
                            <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">Email</th>
                            <th className="px-4 py-3 text-zinc-400 font-medium hidden lg:table-cell">Tournament</th>
                            <th className="px-4 py-3 text-zinc-400 font-medium">Amount</th>
                            <th className="px-4 py-3 text-zinc-400 font-medium">Status</th>
                            <th className="px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p) => (
                            <tr key={p.id} className="border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-3 text-white font-medium">
                                {p.registrations
                                  ? `${p.registrations.first_name} ${p.registrations.last_name}`
                                  : <span className="text-zinc-500 italic">Unknown</span>}
                              </td>
                              <td className="px-4 py-3 text-zinc-300 hidden md:table-cell">{p.email}</td>
                              <td className="px-4 py-3 text-zinc-300 hidden lg:table-cell">
                                {p.tournament_name ?? <span className="text-zinc-500">—</span>}
                              </td>
                              <td className="px-4 py-3 text-white font-semibold">
                                {formatCurrency(p.amount, p.currency)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                                  p.status === "succeeded"
                                    ? "bg-green-500/20 text-green-400"
                                    : p.status === "pending"
                                      ? "bg-yellow-500/20 text-yellow-400"
                                      : "bg-red-500/20 text-red-400"
                                }`}>
                                  {p.status === "succeeded" ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                  {p.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell">
                                {formatDateTime(p.created_at)}
                              </td>
                            </tr>
                          ))}
                          {payments.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                                No payments yet. Once players pay via Stripe, they&apos;ll appear here.
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
          )}

        </div>
      </Section>
    </>
  );
}
