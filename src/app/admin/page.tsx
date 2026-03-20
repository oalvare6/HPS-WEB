"use client";

import { Fragment, useEffect, useState } from "react";
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
} from "lucide-react";

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
  payment_status: string;
  docuseal_status: string;
  docuseal_sign_url: string | null;
  docuseal_submission_id: number | null;
};

type SortField = "created_at" | "last_name" | "waiver_signed" | "registration_type";
type Filter = "all" | "signed" | "unsigned";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [loginLoading, setLoginLoading] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadRegistrations = () => {
    setLoading(true);
    fetch("/api/admin/registrations")
      .then((res) => {
        if (res.status === 401) {
          setAuthed(false);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setRegistrations(data.registrations);
        setAuthed(true);
      })
      .catch(() => setError("Failed to load registrations."))
      .finally(() => {
        setLoading(false);
        setLoginLoading(false);
      });
  };

  useEffect(() => {
    loadRegistrations();
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    const formData = new FormData(e.currentTarget);
    const username = String(formData.get("username") || "");
    const password = String(formData.get("password") || "");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.error || "Login failed.");
        setLoginLoading(false);
        return;
      }

      setAuthed(true);
      loadRegistrations();
    } catch {
      setLoginError("Login failed. Please try again.");
      setLoginLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
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
    }
    return sortAsc ? cmp : -cmp;
  });

  const totalSigned = registrations.filter((r) => r.waiver_signed).length;
  const totalUnsigned = registrations.filter((r) => !r.waiver_signed).length;

  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? (
      sortAsc ? (
        <ChevronUp size={14} className="inline ml-1" />
      ) : (
        <ChevronDown size={14} className="inline ml-1" />
      )
    ) : null;

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const handleExportCsv = () => {
    const headers = [
      "Name",
      "Email",
      "Phone",
      "DOB",
      "Type",
      "Waiver Signed",
      "Signed At",
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
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Username
              </label>
              <input
                type="text"
                name="username"
                required
                autoComplete="username"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent transition-colors"
              />
            </div>
            {loginError && (
              <p className="text-sm text-red-400 text-center">{loginError}</p>
            )}
            <button
              type="submit"
              className="w-full btn-primary h-12"
            >
              Log In
            </button>
          </form>
        </div>
      </Section>
    );
  }

  if (loading) {
    return (
      <Section dark className="bg-zinc-900 min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-zinc-400">
          <Loader2 size={40} className="animate-spin" />
          <p>Loading registrations...</p>
        </div>
      </Section>
    );
  }

  if (error) {
    return (
      <Section dark className="bg-zinc-900 min-h-[60vh] flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </Section>
    );
  }

  return (
    <>
      <section className="bg-zinc-950 text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            Admin — Registrations
          </h1>
          <p className="text-zinc-400">
            {registrations.length} total registrations
          </p>
        </div>
      </section>

      <Section dark className="bg-zinc-900">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="dashboard-card p-4 text-center">
              <p className="text-2xl font-bold text-white">
                {registrations.length}
              </p>
              <p className="text-xs text-zinc-400 uppercase tracking-wide">
                Total
              </p>
            </div>
            <div className="dashboard-card p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{totalSigned}</p>
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
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
              {(["all", "signed", "unsigned"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    filter === f
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {f === "all"
                    ? "All"
                    : f === "signed"
                      ? "Signed"
                      : "Pending"}
                </button>
              ))}
            </div>
            <button
              onClick={handleExportCsv}
              className="ml-auto inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
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
                  <tr className="border-b border-zinc-700 text-left">
                    <th
                      className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort("last_name")}
                    >
                      Name
                      <SortIcon field="last_name" />
                    </th>
                    <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">
                      Email
                    </th>
                    <th className="px-4 py-3 text-zinc-400 font-medium hidden lg:table-cell">
                      Phone
                    </th>
                    <th
                      className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort("registration_type")}
                    >
                      Type
                      <SortIcon field="registration_type" />
                    </th>
                    <th
                      className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white"
                      onClick={() => handleSort("waiver_signed")}
                    >
                      Waiver
                      <SortIcon field="waiver_signed" />
                    </th>
                    <th
                      className="px-4 py-3 text-zinc-400 font-medium cursor-pointer hover:text-white hidden sm:table-cell"
                      onClick={() => handleSort("created_at")}
                    >
                      Registered
                      <SortIcon field="created_at" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer transition-colors"
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
                        <td className="px-4 py-3 text-zinc-300 hidden lg:table-cell">
                          {r.phone}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              r.registration_type === "youth"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-zinc-700 text-zinc-300"
                            }`}
                          >
                            {r.registration_type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                              r.docuseal_status === "signed"
                                ? "bg-green-500/20 text-green-400"
                                : r.docuseal_status === "sent"
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : "bg-zinc-700 text-zinc-400"
                            }`}
                          >
                            {r.docuseal_status === "signed" ? (
                              <CheckCircle size={12} />
                            ) : (
                              <XCircle size={12} />
                            )}
                            {r.docuseal_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 hidden sm:table-cell">
                          {formatDate(r.created_at)}
                        </td>
                      </tr>
                      {expandedId === r.id && (
                        <tr>
                          <td
                            colSpan={6}
                            className="bg-zinc-800/40 px-4 py-4"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
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
                              <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-3">
                                {r.docuseal_status === "signed" && r.docuseal_submission_id && (
                                  <a
                                    href={`https://docuseal.com/submissions/${r.docuseal_submission_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300"
                                  >
                                    <ExternalLink size={14} />
                                    View Signed Document
                                  </a>
                                )}
                                {r.docuseal_sign_url && r.docuseal_status !== "signed" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyLink(r.id, r.docuseal_sign_url!);
                                    }}
                                    className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
                                  >
                                    <Copy size={14} />
                                    {copiedId === r.id ? "Copied!" : "Copy Waiver Link"}
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
                      <td
                        colSpan={6}
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
        </div>
      </Section>

    </>
  );
}
