"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Swords,
  Goal,
} from "lucide-react";
import { toast } from "sonner";
import { ListRowsSkeleton } from "@/components/shared/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { fetchTeamsForTournament, type AdminTeamRow } from "@/lib/admin-teams";
import {
  MATCH_STAGES,
  MATCH_STATUSES,
  MAX_MATCH_NOTE_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  type MatchGoal,
  type MatchStage,
  type MatchStatus,
  type TournamentMatch,
} from "@/lib/types";

const STAGE_LABELS: Record<MatchStage, string> = {
  group: "Group stage",
  semifinal: "Semi-final",
  final: "Final",
};

const STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: "Scheduled",
  final: "Final",
  postponed: "Postponed",
  cancelled: "Cancelled",
};

const STATUS_PILL: Record<MatchStatus, string> = {
  scheduled: "bg-brand/15 text-brand",
  final: "bg-green-500/20 text-green-300",
  postponed: "bg-yellow-500/20 text-yellow-300",
  cancelled: "bg-red-500/20 text-red-300",
};

const inputCls =
  "w-full px-3 py-2 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors text-sm";

const labelCls = "block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1";

type ApiMatch = TournamentMatch & {
  home_team: { id: string; name: string } | null;
  away_team: { id: string; name: string } | null;
  goals: MatchGoal[];
};

type GoalLine = { team_id: string; player_name: string; goals: string };

type FormState = {
  stage: MatchStage;
  match_date: string;
  kickoff_time: string;
  home_team_id: string;
  away_team_id: string;
  status: MatchStatus;
  home_score: string;
  away_score: string;
  notes: string;
  goalLines: GoalLine[];
};

function emptyForm(teams: AdminTeamRow[]): FormState {
  return {
    stage: "group",
    match_date: "",
    kickoff_time: "",
    home_team_id: teams[0]?.id ?? "",
    away_team_id: teams[1]?.id ?? "",
    status: "scheduled",
    home_score: "",
    away_score: "",
    notes: "",
    goalLines: [],
  };
}

function fromMatch(m: ApiMatch): FormState {
  return {
    stage: m.stage,
    match_date: m.match_date ?? "",
    kickoff_time: m.kickoff_time ?? "",
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    status: m.status,
    home_score: m.home_score != null ? String(m.home_score) : "",
    away_score: m.away_score != null ? String(m.away_score) : "",
    notes: m.notes ?? "",
    goalLines: m.goals.map((g) => ({
      team_id: g.team_id,
      player_name: g.player_name,
      goals: String(g.goals),
    })),
  };
}

function toPayload(f: FormState) {
  return {
    stage: f.stage,
    match_date: f.match_date || null,
    kickoff_time: f.kickoff_time.trim() || null,
    home_team_id: f.home_team_id,
    away_team_id: f.away_team_id,
    status: f.status,
    home_score: f.home_score === "" ? null : Number(f.home_score),
    away_score: f.away_score === "" ? null : Number(f.away_score),
    notes: f.notes.trim() || null,
    goals: f.goalLines
      .filter((g) => g.player_name.trim() && Number(g.goals) > 0)
      .map((g) => ({
        team_id: g.team_id,
        player_name: g.player_name.trim(),
        goals: Number(g.goals),
      })),
  };
}

function formatDateLong(iso: string | null): string {
  if (!iso) return "Date TBA";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function TournamentMatchesPanel({ tournamentId }: { tournamentId: string }) {
  const [teams, setTeams] = useState<AdminTeamRow[]>([]);
  const [matches, setMatches] = useState<ApiMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [composerOpen, setComposerOpen] = useState(false);
  const [composer, setComposer] = useState<FormState>(emptyForm([]));
  const [posting, setPosting] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm([]));

  const load = async () => {
    setLoading(true);
    try {
      const [teamsRes, matchesRes] = await Promise.all([
        fetchTeamsForTournament(tournamentId),
        fetch(`/api/admin/tournaments/${tournamentId}/matches`),
      ]);
      if (matchesRes.status === 401) {
        window.location.reload();
        return;
      }
      const matchesData = await matchesRes.json();
      if (!matchesRes.ok) {
        setError(matchesData.error || "Failed to load matches.");
        return;
      }
      setTeams(teamsRes.data ?? []);
      setMatches(matchesData.matches as ApiMatch[]);
      setError("");
    } catch {
      setError("Failed to load matches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const validate = (f: FormState): string | null => {
    if (!f.home_team_id || !f.away_team_id) return "Pick both teams.";
    if (f.home_team_id === f.away_team_id) return "Home and away team must be different.";
    if (f.notes.length > MAX_MATCH_NOTE_LENGTH) {
      return `Notes too long (max ${MAX_MATCH_NOTE_LENGTH} chars).`;
    }
    if (f.status === "final" && (f.home_score === "" || f.away_score === "")) {
      return "Final matches need both scores.";
    }
    for (const g of f.goalLines) {
      if (g.player_name.length > MAX_PLAYER_NAME_LENGTH) {
        return `Player name too long (max ${MAX_PLAYER_NAME_LENGTH} chars).`;
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
        body: JSON.stringify(toPayload(composer)),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not add match.");
        return;
      }
      toast.success("Match added.");
      setComposer(emptyForm(teams));
      setComposerOpen(false);
      await load();
    } catch {
      toast.error("Could not add match.");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (m: ApiMatch) => {
    const label = `${m.home_team?.name ?? "TBD"} vs ${m.away_team?.name ?? "TBD"}`;
    if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
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

  const startEdit = (m: ApiMatch) => {
    setEditingId(m.id);
    setEditForm(fromMatch(m));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm(teams));
  };

  const saveEdit = async (m: ApiMatch) => {
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
          body: JSON.stringify(toPayload(editForm)),
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

  const renderForm = (f: FormState, onChange: (next: FormState) => void) => {
    const addGoalLine = () =>
      onChange({
        ...f,
        goalLines: [...f.goalLines, { team_id: f.home_team_id, player_name: "", goals: "1" }],
      });
    const removeGoalLine = (idx: number) =>
      onChange({ ...f, goalLines: f.goalLines.filter((_, i) => i !== idx) });
    const updateGoalLine = (idx: number, patch: Partial<GoalLine>) =>
      onChange({
        ...f,
        goalLines: f.goalLines.map((g, i) => (i === idx ? { ...g, ...patch } : g)),
      });

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Home team</label>
            <select
              value={f.home_team_id}
              onChange={(e) => onChange({ ...f, home_team_id: e.target.value })}
              className={inputCls}
            >
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Away team</label>
            <select
              value={f.away_team_id}
              onChange={(e) => onChange({ ...f, away_team_id: e.target.value })}
              className={inputCls}
            >
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
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
            <label className={labelCls}>Kickoff time (optional)</label>
            <input
              type="text"
              value={f.kickoff_time}
              onChange={(e) => onChange({ ...f, kickoff_time: e.target.value })}
              placeholder="7:00 PM"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Stage</label>
            <select
              value={f.stage}
              onChange={(e) => onChange({ ...f, stage: e.target.value as MatchStage })}
              className={inputCls}
            >
              {MATCH_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
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
          <div>
            <label className={labelCls}>Home score</label>
            <input
              type="number"
              min={0}
              value={f.home_score}
              onChange={(e) => onChange({ ...f, home_score: e.target.value })}
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
              className={inputCls}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Note (optional)</label>
            <input
              type="text"
              value={f.notes}
              onChange={(e) => onChange({ ...f, notes: e.target.value })}
              maxLength={MAX_MATCH_NOTE_LENGTH}
              placeholder="e.g. Forfeit, rescheduled from rain…"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelCls.replace("mb-1", "mb-0")}>Goal scorers</label>
            <button
              type="button"
              onClick={addGoalLine}
              disabled={!f.home_team_id || !f.away_team_id}
              className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand/80 disabled:opacity-40"
            >
              <Plus size={12} />
              Add scorer
            </button>
          </div>
          {f.goalLines.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">No scorers logged yet.</p>
          ) : (
            <div className="space-y-2">
              {f.goalLines.map((g, idx) => {
                const homeTeam = teams.find((t) => t.id === f.home_team_id);
                const awayTeam = teams.find((t) => t.id === f.away_team_id);
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={g.team_id}
                      onChange={(e) => updateGoalLine(idx, { team_id: e.target.value })}
                      className={`${inputCls} max-w-[140px]`}
                    >
                      {homeTeam && <option value={homeTeam.id}>{homeTeam.name}</option>}
                      {awayTeam && <option value={awayTeam.id}>{awayTeam.name}</option>}
                    </select>
                    <input
                      type="text"
                      value={g.player_name}
                      onChange={(e) => updateGoalLine(idx, { player_name: e.target.value })}
                      placeholder="Player name"
                      maxLength={MAX_PLAYER_NAME_LENGTH}
                      className={inputCls}
                    />
                    <input
                      type="number"
                      min={1}
                      value={g.goals}
                      onChange={(e) => updateGoalLine(idx, { goals: e.target.value })}
                      className={`${inputCls} max-w-[70px]`}
                    />
                    <button
                      type="button"
                      onClick={() => removeGoalLine(idx)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-card p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
            Matches &amp; results
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Log scorelines and goal scorers. Public page shows scores, a standings
            table, and a top-scorers list built from this.
          </p>
        </div>
        {!composerOpen && (
          <button
            type="button"
            onClick={() => {
              setComposer(emptyForm(teams));
              setComposerOpen(true);
            }}
            disabled={teams.length < 2}
            className="inline-flex items-center gap-2 btn-primary text-sm disabled:opacity-50"
            title={teams.length < 2 ? "Add at least 2 teams first" : undefined}
          >
            <Plus size={14} />
            Add match
          </button>
        )}
      </div>

      {teams.length < 2 && !loading && (
        <p className="text-xs text-amber-300">
          Add at least two teams in the Teams tab above before logging matches.
        </p>
      )}

      {composerOpen && (
        <div className="rounded-lg border border-brand/30 bg-surface-2/40 p-4 space-y-4">
          {renderForm(composer, setComposer)}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setComposerOpen(false);
                setComposer(emptyForm(teams));
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

      <div className="space-y-3">
        {loading ? (
          <ListRowsSkeleton rows={3} />
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : matches.length === 0 && !composerOpen ? (
          <AdminEmptyState
            icon={Swords}
            title="No matches yet"
            description="Add matches to publish scorelines, standings, and a top-scorers list."
            actionLabel="Add match"
            onAction={() => setComposerOpen(true)}
            className="py-6"
          />
        ) : (
          matches.map((m) => {
            const editing = editingId === m.id;
            const busy = busyId === m.id;
            const hasScore = m.home_score != null && m.away_score != null;
            return (
              <div
                key={m.id}
                className={`rounded-lg border p-4 bg-surface-2/40 ${
                  editing ? "border-brand/50" : "border-border-token"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-semibold text-white">
                      {m.home_team?.name ?? "TBD"}
                      {hasScore ? ` ${m.home_score}` : ""} vs{" "}
                      {hasScore ? `${m.away_score} ` : ""}
                      {m.away_team?.name ?? "TBD"}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider ${STATUS_PILL[m.status]}`}
                    >
                      {STATUS_LABELS[m.status]}
                    </span>
                    {m.stage !== "group" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider bg-zinc-500/20 text-zinc-300">
                        {STAGE_LABELS[m.stage]}
                      </span>
                    )}
                  </div>
                  {!editing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
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
                  )}
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
                        onClick={() => saveEdit(m)}
                        disabled={busy}
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
                      <span>{formatDateLong(m.match_date)}</span>
                      {m.kickoff_time && <span className="text-zinc-400">· {m.kickoff_time}</span>}
                    </div>
                    {m.goals.length > 0 && (
                      <p className="text-zinc-400 text-xs mt-1 flex items-center gap-1.5 flex-wrap">
                        <Goal size={12} className="text-brand flex-shrink-0" />
                        {m.goals.map((g) => `${g.player_name} ${g.goals}`).join(" · ")}
                      </p>
                    )}
                    {m.notes && <p className="text-zinc-400 text-xs mt-1">{m.notes}</p>}
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
