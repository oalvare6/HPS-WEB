"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";
import { ListRowsSkeleton } from "@/components/shared/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import {
  MAX_ROUND_LABEL_LENGTH,
  MAX_ROUND_NOTE_LENGTH,
  TOURNAMENT_ROUND_STATUSES,
  type TournamentRound,
  type TournamentRoundStatus,
} from "@/lib/types";

const STATUS_LABELS: Record<TournamentRoundStatus, string> = {
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  note: "Note",
};

const STATUS_PILL: Record<TournamentRoundStatus, string> = {
  scheduled: "bg-brand/15 text-brand",
  cancelled: "bg-red-500/20 text-red-300",
  rescheduled: "bg-yellow-500/20 text-yellow-300",
  note: "bg-zinc-500/20 text-zinc-300",
};

const inputCls =
  "w-full px-3 py-2 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors text-sm";

const labelCls = "block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1";

type FormState = {
  label: string;
  round_date: string;
  time_start: string;
  time_end: string;
  status: TournamentRoundStatus;
  note: string;
  rescheduled_to: string;
};

function emptyForm(): FormState {
  return {
    label: "",
    round_date: "",
    time_start: "",
    time_end: "",
    status: "scheduled",
    note: "",
    rescheduled_to: "",
  };
}

function fromRound(r: TournamentRound): FormState {
  return {
    label: r.label,
    round_date: r.round_date ?? "",
    time_start: r.time_start ?? "",
    time_end: r.time_end ?? "",
    status: r.status,
    note: r.note ?? "",
    rescheduled_to: r.rescheduled_to ?? "",
  };
}

function toPayload(f: FormState) {
  return {
    label: f.label.trim(),
    round_date: f.round_date || null,
    time_start: f.time_start.trim() || null,
    time_end: f.time_end.trim() || null,
    status: f.status,
    note: f.note.trim() || null,
    rescheduled_to: f.status === "rescheduled" ? f.rescheduled_to || null : null,
  };
}

function formatDateLong(iso: string | null): string {
  if (!iso) return "Date TBA";
  // Parse as local date so YYYY-MM-DD doesn't shift to the previous day in UTC-
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TournamentRoundsPanel({ tournamentId }: { tournamentId: string }) {
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [composerOpen, setComposerOpen] = useState(false);
  const [composer, setComposer] = useState<FormState>(emptyForm());
  const [posting, setPosting] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/rounds`);
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load schedule.");
        return;
      }
      setRounds(data.rounds as TournamentRound[]);
      setError("");
    } catch {
      setError("Failed to load schedule.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const validate = (f: FormState): string | null => {
    if (!f.label.trim()) return "Label is required (e.g. \u201cRound 1\u201d).";
    if (f.label.length > MAX_ROUND_LABEL_LENGTH) {
      return `Label is too long (max ${MAX_ROUND_LABEL_LENGTH} chars).`;
    }
    if (f.note.length > MAX_ROUND_NOTE_LENGTH) {
      return `Note is too long (max ${MAX_ROUND_NOTE_LENGTH} chars).`;
    }
    if (f.status === "rescheduled" && !f.rescheduled_to) {
      return "Pick the new date for the rescheduled round.";
    }
    return null;
  };

  const handlePost = async () => {
    const err = validate(composer);
    if (err) {
      toast.error(err);
      return;
    }
    setPosting(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(composer)),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not add round.");
        return;
      }
      toast.success("Round added.");
      setComposer(emptyForm());
      setComposerOpen(false);
      await load();
    } catch {
      toast.error("Could not add round.");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (r: TournamentRound) => {
    if (!window.confirm(`Delete \u201c${r.label}\u201d? This can't be undone.`)) return;
    setBusyId(r.id);
    try {
      const res = await fetch(
        `/api/admin/tournaments/${tournamentId}/rounds/${r.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Delete failed.");
        return;
      }
      setRounds((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Round deleted.");
    } catch {
      toast.error("Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (r: TournamentRound) => {
    setEditingId(r.id);
    setEditForm(fromRound(r));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm());
  };

  const saveEdit = async (r: TournamentRound) => {
    const err = validate(editForm);
    if (err) {
      toast.error(err);
      return;
    }
    setBusyId(r.id);
    try {
      const res = await fetch(
        `/api/admin/tournaments/${tournamentId}/rounds/${r.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(editForm)),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed.");
        return;
      }
      toast.success("Round saved.");
      cancelEdit();
      await load();
    } catch {
      toast.error("Save failed.");
    } finally {
      setBusyId(null);
    }
  };

  const move = async (idx: number, direction: "up" | "down") => {
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rounds.length) return;
    const a = rounds[idx];
    const b = rounds[swapIdx];
    setBusyId(a.id);
    try {
      // Swap their sort_orders so the public ordering follows.
      const aRes = await fetch(
        `/api/admin/tournaments/${tournamentId}/rounds/${a.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: b.sort_order }),
        }
      );
      if (!aRes.ok) {
        const data = await aRes.json().catch(() => ({}));
        toast.error(data.error || "Reorder failed.");
        return;
      }
      const bRes = await fetch(
        `/api/admin/tournaments/${tournamentId}/rounds/${b.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: a.sort_order }),
        }
      );
      if (!bRes.ok) {
        const data = await bRes.json().catch(() => ({}));
        toast.error(data.error || "Reorder failed.");
        // best-effort rollback
        await fetch(`/api/admin/tournaments/${tournamentId}/rounds/${a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: a.sort_order }),
        });
        return;
      }
      await load();
    } catch {
      toast.error("Reorder failed.");
    } finally {
      setBusyId(null);
    }
  };

  const renderForm = (
    f: FormState,
    onChange: (next: FormState) => void
  ) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="md:col-span-2">
        <label className={labelCls}>Label</label>
        <input
          type="text"
          value={f.label}
          onChange={(e) => onChange({ ...f, label: e.target.value })}
          maxLength={MAX_ROUND_LABEL_LENGTH}
          placeholder="Round 1, Quarterfinal, Day 1…"
          className={inputCls}
          autoFocus
        />
      </div>
      <div>
        <label className={labelCls}>Date</label>
        <input
          type="date"
          value={f.round_date}
          onChange={(e) => onChange({ ...f, round_date: e.target.value })}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Status</label>
        <select
          value={f.status}
          onChange={(e) =>
            onChange({ ...f, status: e.target.value as TournamentRoundStatus })
          }
          className={inputCls}
        >
          {TOURNAMENT_ROUND_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Start time (optional)</label>
        <input
          type="text"
          value={f.time_start}
          onChange={(e) => onChange({ ...f, time_start: e.target.value })}
          placeholder="7:00 PM"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>End time (optional)</label>
        <input
          type="text"
          value={f.time_end}
          onChange={(e) => onChange({ ...f, time_end: e.target.value })}
          placeholder="10:00 PM"
          className={inputCls}
        />
      </div>
      {f.status === "rescheduled" && (
        <div className="md:col-span-2">
          <label className={labelCls}>Rescheduled to</label>
          <input
            type="date"
            value={f.rescheduled_to}
            onChange={(e) => onChange({ ...f, rescheduled_to: e.target.value })}
            className={inputCls}
          />
        </div>
      )}
      <div className="md:col-span-2">
        <label className={labelCls}>Note (optional)</label>
        <input
          type="text"
          value={f.note}
          onChange={(e) => onChange({ ...f, note: e.target.value })}
          maxLength={MAX_ROUND_NOTE_LENGTH}
          placeholder="e.g. Cancelled — rain in the forecast"
          className={inputCls}
        />
      </div>
    </div>
  );

  return (
    <div className="dashboard-card p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
            Schedule
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Add rounds, matchdays, or sessions for this tournament. Public schedule
            on the detail page follows this order.
          </p>
        </div>
        {!composerOpen && (
          <button
            type="button"
            onClick={() => {
              setComposer(emptyForm());
              setComposerOpen(true);
            }}
            className="inline-flex items-center gap-2 btn-primary text-sm"
          >
            <Plus size={14} />
            Add round
          </button>
        )}
      </div>

      {/* Composer */}
      {composerOpen && (
        <div className="rounded-lg border border-brand/30 bg-surface-2/40 p-4 space-y-4">
          {renderForm(composer, setComposer)}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setComposerOpen(false);
                setComposer(emptyForm());
              }}
              disabled={posting}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-2 py-1"
            >
              <X size={12} />
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePost}
              disabled={posting || !composer.label.trim()}
              className="inline-flex items-center gap-1 text-xs btn-primary !px-3 !py-1.5 disabled:opacity-50"
            >
              {posting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {posting ? "Adding\u2026" : "Add round"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <ListRowsSkeleton rows={3} />
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : rounds.length === 0 && !composerOpen ? (
          <AdminEmptyState
            icon={CalendarPlus}
            title="No rounds yet"
            description="Add rounds to build the schedule players see on the public event page."
            actionLabel="Add round"
            onAction={() => setComposerOpen(true)}
            className="py-6"
          />
        ) : (
          rounds.map((r, i) => {
            const editing = editingId === r.id;
            const busy = busyId === r.id;
            const timeRange =
              r.time_start && r.time_end
                ? `${r.time_start} \u2013 ${r.time_end}`
                : r.time_start || r.time_end || null;
            return (
              <div
                key={r.id}
                className={`rounded-lg border p-4 bg-surface-2/40 ${
                  editing ? "border-brand/50" : "border-border-token"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-white">{r.label}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider ${STATUS_PILL[r.status]}`}
                    >
                      {STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!editing && (
                      <>
                        <button
                          type="button"
                          onClick={() => move(i, "up")}
                          disabled={i === 0 || busy}
                          className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                          title="Move up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, "down")}
                          disabled={i === rounds.length - 1 || busy}
                          className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                          title="Move down"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          disabled={busy}
                          className="p-1.5 text-zinc-400 hover:text-brand disabled:opacity-30 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          disabled={busy}
                          className="p-1.5 text-zinc-400 hover:text-red-400 disabled:opacity-30 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editing ? (
                  <div className="space-y-3 pt-2">
                    {renderForm(editForm, setEditForm)}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-2 py-1"
                      >
                        <X size={12} />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(r)}
                        disabled={busy || !editForm.label.trim()}
                        className="inline-flex items-center gap-1 text-xs btn-primary !px-3 !py-1.5 disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-zinc-300 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-300">
                      <span>{formatDateLong(r.round_date)}</span>
                      {timeRange && <span className="text-zinc-400">· {timeRange}</span>}
                      {r.status === "rescheduled" && r.rescheduled_to && (
                        <span className="text-yellow-300">
                          → {formatDateLong(r.rescheduled_to)}
                        </span>
                      )}
                    </div>
                    {r.note && (
                      <p className="text-zinc-400 text-xs mt-1">{r.note}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
