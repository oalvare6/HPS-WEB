"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Section } from "@/components/shared/section";
import {
  SPRING_2026_LEAGUE_ROUNDS,
  formatLeagueDateLong,
} from "@/lib/spring-2026-league-schedule";
import {
  LEAGUE_ROUND_STATUSES,
  type LeagueRoundOverride,
  type LeagueRoundStatus,
} from "@/lib/league-schedule-overrides";

type RowState = {
  status: LeagueRoundStatus;
  note: string;
  rescheduled_to: string;
  dirty: boolean;
  saving: boolean;
};

const STATUS_LABELS: Record<LeagueRoundStatus, string> = {
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  note: "Add note",
};

const STATUS_DESCRIPTIONS: Record<LeagueRoundStatus, string> = {
  scheduled: "Default — no override. Saving will clear any existing override.",
  cancelled: "Round will not be played. Use the note field for the reason.",
  rescheduled: "Round moved to another date. Set the new date below.",
  note: "Round still on, but show a note next to the listing.",
};

const inputCls =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors";

function emptyState(): RowState {
  return { status: "scheduled", note: "", rescheduled_to: "", dirty: false, saving: false };
}

export default function AdminSchedulePage() {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(SPRING_2026_LEAGUE_ROUNDS.map((r) => [r.dateKey, emptyState()]))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/schedule-overrides");
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load overrides.");
        return;
      }
      const next: Record<string, RowState> = Object.fromEntries(
        SPRING_2026_LEAGUE_ROUNDS.map((r) => [r.dateKey, emptyState()])
      );
      for (const o of (data.overrides ?? []) as LeagueRoundOverride[]) {
        next[o.date_key] = {
          status: o.status,
          note: o.note ?? "",
          rescheduled_to: o.rescheduled_to ?? "",
          dirty: false,
          saving: false,
        };
      }
      setRows(next);
    } catch {
      setError("Failed to load overrides.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateRow = (dateKey: string, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [dateKey]: { ...prev[dateKey], ...patch, dirty: true },
    }));
  };

  const saveRow = async (dateKey: string) => {
    const row = rows[dateKey];
    if (!row) return;
    setRows((prev) => ({ ...prev, [dateKey]: { ...prev[dateKey], saving: true } }));
    try {
      const res = await fetch("/api/admin/schedule-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_key: dateKey,
          status: row.status,
          note: row.note.trim() || null,
          rescheduled_to: row.rescheduled_to || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed.");
        return;
      }
      toast.success("Round override saved.");
      setRows((prev) => ({
        ...prev,
        [dateKey]: { ...prev[dateKey], dirty: false, saving: false },
      }));
    } catch {
      toast.error("Save failed.");
    } finally {
      setRows((prev) => ({ ...prev, [dateKey]: { ...prev[dateKey], saving: false } }));
    }
  };

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">League schedule</h1>
            <p className="text-zinc-400">
              Mark a Friday round as cancelled, rescheduled, or add a public note. Date list itself
              is fixed for Spring 2026.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-border-token rounded-lg px-3 py-1.5 transition-colors"
          >
            <RefreshCw size={14} />
            Reload
          </button>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-3xl mx-auto px-6 space-y-4">
          {loading ? (
            <div className="flex items-center gap-3 text-zinc-400 py-8">
              <Loader2 size={24} className="animate-spin" />
              <span>Loading schedule overrides…</span>
            </div>
          ) : error ? (
            <p className="text-red-400">{error}</p>
          ) : (
            SPRING_2026_LEAGUE_ROUNDS.map((row) => {
              const state = rows[row.dateKey];
              const description = STATUS_DESCRIPTIONS[state.status];
              return (
                <div key={row.dateKey} className="dashboard-card p-5 md:p-6 space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        {row.label}
                        {row.note ? <span className="text-zinc-500 font-normal"> ({row.note})</span> : null}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1">{formatLeagueDateLong(row.dateKey)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
                        Status
                      </span>
                      <select
                        value={state.status}
                        onChange={(e) =>
                          updateRow(row.dateKey, { status: e.target.value as LeagueRoundStatus })
                        }
                        className={inputCls}
                      >
                        {LEAGUE_ROUND_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>

                    {state.status === "rescheduled" && (
                      <label className="block">
                        <span className="block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
                          New date
                        </span>
                        <input
                          type="date"
                          value={state.rescheduled_to}
                          onChange={(e) =>
                            updateRow(row.dateKey, { rescheduled_to: e.target.value })
                          }
                          className={inputCls}
                        />
                      </label>
                    )}
                  </div>

                  <label className="block">
                    <span className="block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
                      Public note (optional)
                    </span>
                    <input
                      type="text"
                      value={state.note}
                      onChange={(e) => updateRow(row.dateKey, { note: e.target.value })}
                      placeholder="e.g. Cancelled — heavy rain in the forecast"
                      maxLength={280}
                      className={inputCls}
                    />
                  </label>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-zinc-500 flex-1 min-w-0">{description}</p>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {state.dirty && <span className="text-xs text-yellow-400">Unsaved</span>}
                      <button
                        type="button"
                        disabled={!state.dirty || state.saving}
                        onClick={() => saveRow(row.dateKey)}
                        className="inline-flex items-center gap-2 btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {state.saving ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        {state.saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Section>
    </>
  );
}
