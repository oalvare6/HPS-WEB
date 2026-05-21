"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  MessageSquarePlus,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Send,
  X,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { MAX_UPDATE_BODY_LENGTH, type TournamentUpdate } from "@/lib/types";
import { ListRowsSkeleton } from "@/components/shared/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

const inputCls =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors";

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TournamentUpdatesPanel({ tournamentId }: { tournamentId: string }) {
  const [updates, setUpdates] = useState<TournamentUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [posting, setPosting] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/updates`);
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load updates.");
        return;
      }
      setUpdates(data.updates as TournamentUpdate[]);
      setError("");
    } catch {
      setError("Failed to load updates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const handlePost = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Write something first.");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed, pinned }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not post update.");
        return;
      }
      setUpdates((prev) => [data.update as TournamentUpdate, ...prev]);
      setBody("");
      setPinned(false);
      toast.success("Update posted.");
    } catch {
      toast.error("Could not post update.");
    } finally {
      setPosting(false);
    }
  };

  const handleTogglePin = async (u: TournamentUpdate) => {
    setBusyId(u.id);
    try {
      const res = await fetch(
        `/api/admin/tournaments/${tournamentId}/updates/${u.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: !u.pinned }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not update pin.");
        return;
      }
      toast.success(!u.pinned ? "Pinned." : "Unpinned.");
      await load();
    } catch {
      toast.error("Could not update pin.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (u: TournamentUpdate) => {
    if (!window.confirm("Delete this update? This cannot be undone.")) return;
    setBusyId(u.id);
    try {
      const res = await fetch(
        `/api/admin/tournaments/${tournamentId}/updates/${u.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Delete failed.");
        return;
      }
      setUpdates((prev) => prev.filter((x) => x.id !== u.id));
      toast.success("Update deleted.");
    } catch {
      toast.error("Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (u: TournamentUpdate) => {
    setEditingId(u.id);
    setEditBody(u.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody("");
  };

  const saveEdit = async (u: TournamentUpdate) => {
    const trimmed = editBody.trim();
    if (!trimmed) {
      toast.error("Update cannot be empty.");
      return;
    }
    if (trimmed === u.body) {
      cancelEdit();
      return;
    }
    setBusyId(u.id);
    try {
      const res = await fetch(
        `/api/admin/tournaments/${tournamentId}/updates/${u.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed.");
        return;
      }
      toast.success("Update saved.");
      cancelEdit();
      await load();
    } catch {
      toast.error("Save failed.");
    } finally {
      setBusyId(null);
    }
  };

  const remaining = MAX_UPDATE_BODY_LENGTH - body.length;
  const overLimit = remaining < 0;

  return (
    <div className="dashboard-card p-6 md:p-8 space-y-6">
      <div>
        <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
          Public updates
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Post short updates that show on the public tournament page (e.g. &ldquo;Bracket
          released&rdquo;, &ldquo;Round 3 moved to Field 2&rdquo;). Pin one to the top.
        </p>
      </div>

      {/* Composer */}
      <div className="space-y-3">
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write an update for players…"
          maxLength={MAX_UPDATE_BODY_LENGTH + 50}
          className={`${inputCls} ${overLimit ? "border-red-500" : ""}`}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="h-4 w-4 rounded border-border-token bg-surface-2 text-brand focus:ring-brand"
            />
            <Pin size={14} className="text-zinc-400" />
            Pin to top
          </label>
          <div className="flex items-center gap-3 ml-auto">
            <span
              className={`text-xs ${
                overLimit ? "text-red-400" : remaining < 50 ? "text-yellow-400" : "text-zinc-500"
              }`}
            >
              {remaining} chars left
            </span>
            <button
              type="button"
              onClick={handlePost}
              disabled={posting || !body.trim() || overLimit}
              className="inline-flex items-center gap-2 btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {posting ? "Posting…" : "Post update"}
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="border-t border-border-token pt-5 space-y-3">
        {loading ? (
          <ListRowsSkeleton rows={3} />
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : updates.length === 0 ? (
          <AdminEmptyState
            icon={MessageSquarePlus}
            title="No updates posted yet"
            description="Post schedule changes or announcements — pinned updates show on the public tournament page."
            className="py-6"
          />
        ) : (
          updates.map((u) => {
            const editing = editingId === u.id;
            const busy = busyId === u.id;
            return (
              <div
                key={u.id}
                className={`rounded-lg border p-4 bg-surface-2/40 ${
                  u.pinned ? "border-brand/50" : "border-border-token"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 text-xs">
                    {u.pinned && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand/15 text-brand font-semibold uppercase tracking-wide">
                        <Pin size={10} />
                        Pinned
                      </span>
                    )}
                    <span className="text-zinc-500">{timeAgo(u.created_at)}</span>
                    {u.updated_at !== u.created_at && (
                      <span className="text-zinc-600">· edited</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!editing && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleTogglePin(u)}
                          disabled={busy}
                          className="p-1.5 text-zinc-400 hover:text-brand disabled:opacity-30 transition-colors"
                          title={u.pinned ? "Unpin" : "Pin to top"}
                        >
                          {u.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(u)}
                          disabled={busy}
                          className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(u)}
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
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      maxLength={MAX_UPDATE_BODY_LENGTH + 50}
                      className={inputCls}
                      autoFocus
                    />
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
                        onClick={() => saveEdit(u)}
                        disabled={busy || !editBody.trim()}
                        className="inline-flex items-center gap-1 text-xs btn-primary !px-3 !py-1.5 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap">{u.body}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
