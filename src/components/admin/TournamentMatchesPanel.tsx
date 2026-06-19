"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Goal,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { ListRowsSkeleton } from "@/components/shared/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import {
  MATCH_STATUSES,
  MAX_MATCH_LABEL_LENGTH,
  MAX_MATCH_NOTE_LENGTH,
  MAX_SCORER_NAME_LENGTH,
  type MatchScorer,
  type MatchStatus,
  type TournamentMatch,
} from "@/lib/types";
import {
  fetchTeamsForTournament,
  createTeam,
  type AdminTeamRow,
} from "@/lib/admin-teams";

type AdminMatch = TournamentMatch & { scorers: MatchScorer[] };

const STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  postponed: "Postponed",
  cancelled: "Cancelled",
};

const STATUS_PILL: Record<MatchStatus, string> = {
  scheduled: "bg-brand/15 text-brand",
  completed: "bg-green-500/20 text-green-300",
  postponed: "bg-yellow-500/20 text-yellow-300",
  cancelled: "bg-red-500/20 text-red-300",
};

const inputCls =
  "w-full px-3 py-2 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors text-sm";
const labelCls =
  "block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1";

type MatchFormState = {
  home_team_id: string;
  home_label: string;
  away_team_id: string;
  away_label: string;
  match_number: string;
  match_date: string;
  time_start: string;
  status: MatchStatus;
  home_score: string;
  away_score: string;
  note: string;
};

function emptyMatchForm(): MatchFormState {
  return {
    home_team_id: "",
    home_label: "",
    away_team_id: "",
    away_label: "",
    match_number: "",
    match_date: "",
    time_start: "",
    status: "scheduled",
    home_score: "",
    away_score: "",
    note: "",
  };
}

function fromMatch(m: AdminMatch): MatchFormState {
  return {
    home_team_id: m.home_team_id ?? "",
    home_label: m.home_team_label ?? "",
    away_team_id: m.away_team_id ?? "",
    away_label: m.away_team_label ?? "",
    match_number: m.match_number != null ? String(m.match_number) : "",
    match_date: m.match_date ?? "",
    time_start: m.kickoff_time ?? "",
    status: m.status,
    home_score: m.home_score != null ? String(m.home_score) : "",
    away_score: m.away_score != null ? String(m.away_score) : "",
    note: m.notes ?? "",
  };
}

function toMatchPayload(f: MatchFormState) {
  const homeTeam = f.home_team_id || null;
  const awayTeam = f.away_team_id || null;
  return {
    home_team_id: homeTeam,
    away_team_id: awayTeam,
    home_team_label: homeTeam ? null : f.home_label.trim() || null,
    away_team_label: awayTeam ? null : f.away_label.trim() || null,
    match_number: f.match_number.trim() === "" ? null : Number(f.match_number),
    match_date: f.match_date || null,
    kickoff_time: f.time_start.trim() || null,
    status: f.status,
    home_score: f.home_score.trim() === "" ? null : Number(f.home_score),
    away_score: f.away_score.trim() === "" ? null : Number(f.away_score),
    notes: f.note.trim() || null,
  };
}

function teamName(teams: AdminTeamRow[], id: string | null): string | null {
  if (!id) return null;
  return teams.find((t) => t.id === id)?.name ?? null;
}

function sideName(
  teams: AdminTeamRow[],
  teamId: string | null,
  label: string | null
): string {
  return teamName(teams, teamId) ?? label ?? "TBD";
}

export function TournamentMatchesPanel({ tournamentId }: { tournamentId: string }) {
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [teams, setTeams] = useState<AdminTeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [composerOpen, setComposerOpen] = useState(false);
  const [composer, setComposer] = useState<MatchFormState>(emptyMatchForm());
  const [posting, setPosting] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MatchFormState>(emptyMatchForm());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [newTeamName, setNewTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [matchRes, teamsResult] = await Promise.all([
        fetch(`/api/admin/tournaments/${tournamentId}/matches`, {
          cache: "no-store",
        }),
        fetchTeamsForTournament(tournamentId),
      ]);
      if (matchRes.status === 401) {
        window.location.reload();
        return;
      }
      const data = await matchRes.json();
      if (!matchRes.ok) {
        setError(data.error || "Failed to load matches.");
        return;
      }
      setMatches((data.matches ?? []) as AdminMatch[]);
      setTeams(teamsResult.data ?? []);
      setError("");
    } catch {
      setError("Failed to load matches.");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    setCreatingTeam(true);
    try {
      const res = await createTeam({ tournament_id: tournamentId, name });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Team "${name}" added.`);
      setNewTeamName("");
      const teamsResult = await fetchTeamsForTournament(tournamentId);
      setTeams(teamsResult.data ?? []);
    } finally {
      setCreatingTeam(false);
    }
  };

  const validate = (f: MatchFormState): string | null => {
    const homeName = f.home_team_id ? "" : f.home_label.trim();
    const awayName = f.away_team_id ? "" : f.away_label.trim();
    if (!f.home_team_id && !homeName) return "Pick a home team or enter a placeholder.";
    if (!f.away_team_id && !awayName) return "Pick an away team or enter a placeholder.";
    if (
      f.home_team_id &&
      f.away_team_id &&
      f.home_team_id === f.away_team_id
    ) {
      return "Home and away teams must be different.";
    }
    if (f.status === "completed") {
      if (f.home_score.trim() === "" || f.away_score.trim() === "") {
        return "Enter both scores to mark a match completed.";
      }
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
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toMatchPayload(composer)),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not add match.");
        return;
      }
      toast.success("Match added.");
      setComposer(emptyMatchForm());
      setComposerOpen(false);
      await load();
    } catch {
      toast.error("Could not add match.");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (m: AdminMatch) => {
    const label = `${sideName(teams, m.home_team_id, m.home_team_label)} vs ${sideName(
      teams,
      m.away_team_id,
      m.away_team_label
    )}`;
    if (!window.confirm(`Delete "${label}"? This also removes its scorers.`)) return;
    setBusyId(m.id);
    try {
      const res = await fetch(
        `/api/admin/tournaments/${tournamentId}/matches/${m.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Delete failed.");
        return;
      }
      setMatches((prev) => prev.filter((x) => x.id !== m.id));
      toast.success("Match deleted.");
    } catch {
      toast.error("Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (m: AdminMatch) => {
    setEditingId(m.id);
    setEditForm(fromMatch(m));
    setExpandedId(m.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyMatchForm());
  };

  const saveEdit = async (m: AdminMatch) => {
    const err = validate(editForm);
    if (err) {
      toast.error(err);
      return;
    }
    setBusyId(m.id);
    try {
      const res = await fetch(
        `/api/admin/tournaments/${tournamentId}/matches/${m.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toMatchPayload(editForm)),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed.");
        return;
      }
      toast.success("Match saved.");
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
    if (swapIdx < 0 || swapIdx >= matches.length) return;
    const a = matches[idx];
    const b = matches[swapIdx];
    setBusyId(a.id);
    try {
      const aRes = await fetch(
        `/api/admin/tournaments/${tournamentId}/matches/${a.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: b.sort_order }),
        }
      );
      const bRes = await fetch(
        `/api/admin/tournaments/${tournamentId}/matches/${b.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: a.sort_order }),
        }
      );
      if (!aRes.ok || !bRes.ok) {
        toast.error("Reorder failed.");
      }
      await load();
    } catch {
      toast.error("Reorder failed.");
    } finally {
      setBusyId(null);
    }
  };

  const renderMatchForm = (
    f: MatchFormState,
    onChange: (next: MatchFormState) => void
  ) => (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Home team</label>
          <select
            value={f.home_team_id}
            onChange={(e) => onChange({ ...f, home_team_id: e.target.value })}
            className={inputCls}
          >
            <option value="">Placeholder / TBD…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {!f.home_team_id && (
            <input
              type="text"
              value={f.home_label}
              onChange={(e) => onChange({ ...f, home_label: e.target.value })}
              maxLength={MAX_MATCH_LABEL_LENGTH}
              placeholder='e.g. "1st Place" or "Winner SF1"'
              className={`${inputCls} mt-2`}
            />
          )}
        </div>
        <div>
          <label className={labelCls}>Away team</label>
          <select
            value={f.away_team_id}
            onChange={(e) => onChange({ ...f, away_team_id: e.target.value })}
            className={inputCls}
          >
            <option value="">Placeholder / TBD…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {!f.away_team_id && (
            <input
              type="text"
              value={f.away_label}
              onChange={(e) => onChange({ ...f, away_label: e.target.value })}
              maxLength={MAX_MATCH_LABEL_LENGTH}
              placeholder='e.g. "4th Place" or "Winner SF2"'
              className={`${inputCls} mt-2`}
            />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Match #</label>
          <input
            type="number"
            min={0}
            value={f.match_number}
            onChange={(e) => onChange({ ...f, match_number: e.target.value })}
            placeholder="1"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input
            type="date"
            value={f.match_date}
            onChange={(e) => onChange({ ...f, match_date: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Time</label>
          <input
            type="text"
            value={f.time_start}
            onChange={(e) => onChange({ ...f, time_start: e.target.value })}
            placeholder="7:00 PM"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select
            value={f.status}
            onChange={(e) => onChange({ ...f, status: e.target.value as MatchStatus })}
            className={inputCls}
          >
            {MATCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Home score</label>
          <input
            type="number"
            min={0}
            value={f.home_score}
            onChange={(e) => onChange({ ...f, home_score: e.target.value })}
            placeholder="—"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Away score</label>
          <input
            type="number"
            min={0}
            value={f.away_score}
            onChange={(e) => onChange({ ...f, away_score: e.target.value })}
            placeholder="—"
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Note (optional)</label>
        <input
          type="text"
          value={f.note}
          onChange={(e) => onChange({ ...f, note: e.target.value })}
          maxLength={MAX_MATCH_NOTE_LENGTH}
          placeholder="e.g. Postponed — rain"
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
            Matches &amp; scores
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Fixtures, results, and goal scorers. Standings and the top-scorer
            leaderboard on the public page are calculated from completed matches.
          </p>
        </div>
        {!composerOpen && (
          <button
            type="button"
            onClick={() => {
              setComposer(emptyMatchForm());
              setComposerOpen(true);
            }}
            className="inline-flex items-center gap-2 btn-primary text-sm"
          >
            <Plus size={14} />
            Add match
          </button>
        )}
      </div>

      {/* Teams quick-add */}
      <div className="rounded-lg border border-border-token bg-surface-2/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Users size={14} className="text-brand" />
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wide">
            Teams ({teams.length})
          </span>
        </div>
        {teams.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {teams.map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-2 text-sm text-zinc-200 border border-border-token"
              >
                {t.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: t.color }}
                  />
                )}
                {t.name}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreateTeam();
              }
            }}
            placeholder="Add a team (e.g. Brazil)"
            className={inputCls}
          />
          <button
            type="button"
            onClick={handleCreateTeam}
            disabled={creatingTeam || !newTeamName.trim()}
            className="inline-flex items-center gap-1 text-xs btn-primary !px-3 !py-2 disabled:opacity-50 flex-shrink-0"
          >
            {creatingTeam ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Add
          </button>
        </div>
      </div>

      {/* Composer */}
      {composerOpen && (
        <div className="rounded-lg border border-brand/30 bg-surface-2/40 p-4 space-y-4">
          {renderMatchForm(composer, setComposer)}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setComposerOpen(false);
                setComposer(emptyMatchForm());
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
              disabled={posting}
              className="inline-flex items-center gap-1 text-xs btn-primary !px-3 !py-1.5 disabled:opacity-50"
            >
              {posting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {posting ? "Adding…" : "Add match"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <ListRowsSkeleton rows={4} />
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : matches.length === 0 && !composerOpen ? (
          <AdminEmptyState
            icon={Goal}
            title="No matches yet"
            description="Add teams above, then add matches to build the public schedule, scores, standings, and top scorers."
            actionLabel="Add match"
            onAction={() => setComposerOpen(true)}
            className="py-6"
          />
        ) : (
          matches.map((m, i) => {
            const editing = editingId === m.id;
            const expanded = expandedId === m.id;
            const busy = busyId === m.id;
            const home = sideName(teams, m.home_team_id, m.home_team_label);
            const away = sideName(teams, m.away_team_id, m.away_team_label);
            const hasScore = m.home_score != null && m.away_score != null;
            return (
              <div
                key={m.id}
                className={`rounded-lg border bg-surface-2/40 ${
                  editing ? "border-brand/50" : "border-border-token"
                }`}
              >
                <div className="flex items-start justify-between gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : m.id)}
                    className="flex items-center gap-2 min-w-0 text-left flex-1"
                  >
                    <ChevronRight
                      size={16}
                      className={`text-zinc-500 flex-shrink-0 transition-transform ${
                        expanded ? "rotate-90" : ""
                      }`}
                    />
                    <span className="text-xs font-mono text-zinc-500 flex-shrink-0">
                      {m.match_number != null ? `#${m.match_number}` : ""}
                    </span>
                    <span className="text-sm font-semibold text-white truncate">
                      {home}
                      {hasScore ? (
                        <span className="text-brand font-mono mx-1.5">
                          {m.home_score}–{m.away_score}
                        </span>
                      ) : (
                        <span className="text-zinc-500 mx-1.5">vs</span>
                      )}
                      {away}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider flex-shrink-0 ${STATUS_PILL[m.status]}`}
                    >
                      {STATUS_LABELS[m.status]}
                    </span>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
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
                      disabled={i === matches.length - 1 || busy}
                      className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                      title="Move down"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => (editing ? cancelEdit() : startEdit(m))}
                      disabled={busy}
                      className="p-1.5 text-zinc-400 hover:text-brand disabled:opacity-30 transition-colors"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(m)}
                      disabled={busy}
                      className="p-1.5 text-zinc-400 hover:text-red-400 disabled:opacity-30 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {(expanded || editing) && (
                  <div className="border-t border-border-token p-4 space-y-4">
                    {editing ? (
                      <div className="space-y-3">
                        {renderMatchForm(editForm, setEditForm)}
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
                            onClick={() => saveEdit(m)}
                            disabled={busy}
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
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="text-xs text-brand hover:underline"
                      >
                        Edit fixture, score, or status
                      </button>
                    )}

                    <MatchGoalsEditor
                      tournamentId={tournamentId}
                      match={m}
                      teams={teams}
                      onChanged={load}
                    />
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

function MatchGoalsEditor({
  tournamentId,
  match,
  teams,
  onChanged,
}: {
  tournamentId: string;
  match: AdminMatch;
  teams: AdminTeamRow[];
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [goals, setGoals] = useState("1");
  const [busy, setBusy] = useState(false);

  const sides = [
    { key: "home", teamId: match.home_team_id, label: sideName(teams, match.home_team_id, match.home_team_label) },
    { key: "away", teamId: match.away_team_id, label: sideName(teams, match.away_team_id, match.away_team_label) },
  ];

  const addGoal = async (teamId: string | null) => {
    const scorer = name.trim();
    if (!scorer) {
      toast.error("Enter a scorer name.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/tournaments/${tournamentId}/matches/${match.id}/goals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scorer_name: scorer, team_id: teamId, goals: Number(goals) || 1 }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not add scorer.");
        return;
      }
      setName("");
      setGoals("1");
      setAdding(null);
      await onChanged();
    } catch {
      toast.error("Could not add scorer.");
    } finally {
      setBusy(false);
    }
  };

  const deleteGoal = async (goal: MatchScorer) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/tournaments/${tournamentId}/matches/${match.id}/goals/${goal.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Delete failed.");
        return;
      }
      await onChanged();
    } catch {
      toast.error("Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {sides.map((side) => {
        const sideGoals = match.scorers.filter((g) => g.team_id === side.teamId && side.teamId != null);
        const isPlaceholder = side.teamId == null;
        return (
          <div key={side.key} className="rounded-lg border border-border-token bg-surface/40 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Goal size={13} className="text-brand" />
              <span className="text-xs font-semibold text-white truncate">{side.label}</span>
            </div>
            {isPlaceholder ? (
              <p className="text-xs text-zinc-500 italic">
                Assign a team to this side to log scorers.
              </p>
            ) : (
              <>
                <ul className="space-y-1 mb-2">
                  {sideGoals.length === 0 ? (
                    <li className="text-xs text-zinc-500 italic">No scorers logged.</li>
                  ) : (
                    sideGoals.map((g) => (
                      <li
                        key={g.id}
                        className="flex items-center justify-between gap-2 text-sm text-zinc-200"
                      >
                        <span className="truncate">
                          {g.scorer_name}
                          {g.goals > 1 && (
                            <span className="text-brand font-mono ml-1">×{g.goals}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteGoal(g)}
                          disabled={busy}
                          className="p-1 text-zinc-500 hover:text-red-400 disabled:opacity-30"
                          title="Remove scorer"
                        >
                          <X size={12} />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
                {adding === side.key ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={MAX_SCORER_NAME_LENGTH}
                      placeholder="Scorer"
                      autoFocus
                      className={`${inputCls} !py-1.5`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addGoal(side.teamId);
                        }
                      }}
                    />
                    <input
                      type="number"
                      min={1}
                      value={goals}
                      onChange={(e) => setGoals(e.target.value)}
                      className={`${inputCls} !py-1.5 w-16 flex-shrink-0`}
                      title="Goals"
                    />
                    <button
                      type="button"
                      onClick={() => addGoal(side.teamId)}
                      disabled={busy}
                      className="p-1.5 text-brand hover:text-white disabled:opacity-30 flex-shrink-0"
                      title="Save scorer"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(null);
                        setName("");
                        setGoals("1");
                      }}
                      className="p-1.5 text-zinc-500 hover:text-white flex-shrink-0"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(side.key);
                      setName("");
                      setGoals("1");
                    }}
                    className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                  >
                    <Plus size={12} />
                    Add scorer
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
