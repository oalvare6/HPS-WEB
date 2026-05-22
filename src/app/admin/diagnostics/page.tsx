"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Section } from "@/components/shared/section";
import type { AuthDiagnosticsPayload } from "@/app/api/admin/diagnostics/auth/route";

type CheckStatus = "ok" | "warn" | "fail" | "manual";

function statusIcon(status: CheckStatus) {
  switch (status) {
    case "ok":
      return <CheckCircle2 size={18} className="text-brand shrink-0" />;
    case "warn":
      return <AlertTriangle size={18} className="text-yellow-400 shrink-0" />;
    case "fail":
      return <XCircle size={18} className="text-red-400 shrink-0" />;
    case "manual":
      return <CircleHelp size={18} className="text-zinc-400 shrink-0" />;
  }
}

function statusLabel(status: CheckStatus): string {
  switch (status) {
    case "ok":
      return "OK";
    case "warn":
      return "Warning";
    case "fail":
      return "Fail";
    case "manual":
      return "Verify in dashboard";
  }
}

export default function AdminDiagnosticsPage() {
  const [data, setData] = useState<AuthDiagnosticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/diagnostics/auth");
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      const json = (await res.json()) as AuthDiagnosticsPayload & {
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Failed to load diagnostics.");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("Failed to load diagnostics.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            Auth diagnostics
          </h1>
          <p className="text-zinc-400 text-sm md:text-base max-w-2xl">
            Player magic-link deliverability and Supabase URL configuration. For SMTP
            and template steps, see <code className="text-zinc-300">docs/AUTH-CONFIG.md</code>{" "}
            in the repository.
          </p>
        </div>
      </section>

      <Section dark className="bg-surface min-h-[50vh]" container={false}>
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <p className="text-sm text-zinc-500">
              {data
                ? `Last checked ${new Date(data.checkedAt).toLocaleString()}`
                : "Run a check to refresh status."}
            </p>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white border border-border-token rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          {loading && !data ? (
            <div className="flex justify-center py-16 text-zinc-400">
              <Loader2 size={32} className="animate-spin" />
            </div>
          ) : null}

          {data && (
            <>
              <div className="dashboard-card p-5 space-y-4">
                <h2 className="text-lg font-semibold text-white">Checklist</h2>
                <ul className="space-y-3">
                  {data.checks.map((check) => (
                    <li
                      key={check.id}
                      className="flex gap-3 items-start border-b border-border-token/60 pb-3 last:border-0 last:pb-0"
                    >
                      {statusIcon(check.status)}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-white">
                            {check.label}
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              check.status === "ok"
                                ? "bg-brand/20 text-brand"
                                : check.status === "fail"
                                  ? "bg-red-500/20 text-red-400"
                                  : check.status === "warn"
                                    ? "bg-yellow-500/20 text-yellow-400"
                                    : "bg-surface-2 text-zinc-400"
                            }`}
                          >
                            {statusLabel(check.status)}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400 mt-1">{check.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="dashboard-card p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">
                  Expected redirect URLs
                </h2>
                <p className="text-sm text-zinc-400">{data.auth.redirectUrlsNote}</p>
                <ul className="list-disc list-inside text-sm text-zinc-300 space-y-1 font-mono">
                  {data.auth.redirectUrlsExpected.map((url) => (
                    <li key={url} className="break-all">
                      {url}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-zinc-500">
                  Supabase Dashboard → Authentication → URL Configuration
                </p>
              </div>

              <div className="dashboard-card p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">Site URL</h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-zinc-500">Expected (production)</dt>
                    <dd className="text-white font-mono break-all">
                      {data.auth.siteUrlExpected}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">From API (if available)</dt>
                    <dd className="text-white font-mono break-all">
                      {data.auth.siteUrlFromApi ?? "—"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-zinc-500">Note</dt>
                    <dd className="text-zinc-300">{data.auth.siteUrlNote}</dd>
                  </div>
                </dl>
              </div>

              <div className="dashboard-card p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">Environment</h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">Supabase host</dt>
                    <dd className="text-zinc-200 font-mono text-right break-all">
                      {data.env.supabaseUrl.host ?? "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">Auth health reachable</dt>
                    <dd className="text-zinc-200">
                      {data.env.supabaseUrl.reachable === null
                        ? "n/a"
                        : data.env.supabaseUrl.reachable
                          ? "yes"
                          : "no"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">NEXT_PUBLIC_SITE_URL</dt>
                    <dd className="text-zinc-200 font-mono text-right break-all">
                      {data.env.siteUrl.value ?? "not set"}
                    </dd>
                  </div>
                </dl>
              </div>

              <a
                href="https://supabase.com/dashboard/project/_/auth/url-configuration"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-brand hover:underline"
              >
                Open Supabase URL configuration
                <ExternalLink size={14} />
              </a>
            </>
          )}
        </div>
      </Section>
    </>
  );
}
