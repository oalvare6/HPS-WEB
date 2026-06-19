"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Goal,
  Loader2,
  Pencil,
  Plus,
  Swords,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ListRowsSkeleton } from "@/components/shared/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { createTeam, fetchTeamsForTournament, type AdminTeamRow } from "@/lib/admin-teams";
import {
  addScorer,
  createMatch,
  deleteMatch,
  deleteScorer,
  fetchMatches,
  fetchRounds,
  updateMatch,
  type AdminMatch,
} from "@/lib/admin-matches";
import {
  MATCH_STATUSES,
  type MatchStatus,
  type TournamentRound,
} from "@/lib/types";

const CUSTOM = "__custom__";

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

type MatchForm = {
  round_id: string;
  home_team_id: string;
  home_team_label: string;
  away_team_id: string;
  away_team_label: string;
  home_score: string;
  away_score: string;
  status: MatchStatus;
  kickoff_time: string;
};

function emptyForm(roundId = ""): MatchForm {
  return {
    round_id: roundId,
    home_team_id: "",
    home_team_label: "",
    away_team_id: "",
    away_team_label: "",
    home_score: "",
    away_score: "",
    status: "scheduled",
    kickoff_time: "",
  };
}

function fromMatch(m: AdminMatch): MatchForm {
  return {
    round_id: m.round_id ?? "",
    home_team_id: m.home_team_id ?? (m.home_team_label ? CUSTOM : ""),
    home_team_label: m.home_team_label ?? "",
    away_team_id: m.away_team_id ?? (m.away_team_label ? CUSTOM : ""),
    away_team_label: m.away_team_label ?? "",
    home_score: m.home_score == null ? "" : String(m.home_score),
    away_score: m.away_score == null ? "" : String(m.away_score),
    status: m.status,
    kickoff_time: m.kickoff_time ?? "",
  };
}

function toPayload(f: MatchForm) {
  const homeCustom = f.home_team_id === CUSTOM || f.home_team_id === "";
  const awayCustom = f.away_team_id === CUSTOM || f.away_team_id === "";
  return {
    round_id: f.round_id || null,
    home_team_id: homeCustom ? null : f.home_team_id,
    home_team_label: homeCustom ? f.home_team_label.trim() || null : null,
    away_team_id: awayCustom ? null : f.away_team_id,
    away_team_label: awayCustom ? f.away_team_label.trim() || null : null,
    home_score: f.home_score === "" ? null : Number(f.home_score),
    away_score: f.away_score === "" ? null : Number(f.away_score),
    status: f.status,
    kickoff_time: f.kickoff_time.trim() || null,
  };
}

export function TournamentMatchesPanel({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [teams, setTeams] = useState<AdminTeamRow[]>([]);
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [composerOpen, setComposerOpen] = useState(false);
  const [composer, setComposer] = useState<MatchForm>(emptyForm());
  const [posting, setPosting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MatchForm>(emptyForm());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [teamsRes, roundsRes, matchesRes] = await Promise.all([
      fetchTeamsForTournament(tournamentId),
      fetchRounds(tournamentId),
      fetchMatches(tournamentId),
    ]);
    if (teamsRes.data) setTeams(teamsRes.data);
    if (roundsRes.data) setRounds(roundsRes.data);
    if (matchesRes.error) {
      setError(matchesRes.error);
    } else {
      setError("");
      setMatches(matchesRes.data ?? []);
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const roundsById = useMemo(
    () => new Map(rounds.map((r) => [r.id, r])),
    [rounds]
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, AdminMatch[]>();
    for (const m of matches) {
      const key = m.round_id ?? "__none__";
      const arr = groups.get(key) ?? [];
      arr.push(m);
      groups.set(key, arr);
    }
    // Order groups by the rounds' sort order, unscheduled last.
    const orderedKeys = [
      ...rounds.map((r) => r.id).filter((id) => groups.has(id)),
      ...(groups.has("__none__") ? ["__none__"] : []),
    ];
    return orderedKeys.map((key) => ({
      key,
      round: key === "__none__" ? null : roundsById.get(key) ?? null,
      matches: groups.get(key) ?? [],
    }));
  }, [matches, rounds, roundsById]);

  const validate = (f: MatchForm): string | null => {
    const homeOk = f.home_team_id && f.home_team_id !== CUSTOM
      ? true
      : f.home_team_label.trim().length > 0;
    const awayOk = f.away_team_id && f.away_team_id !== CUSTOM
      ? true
      : f.away_team_label.trim().length > 0;
    if (!homeOk) return "Pick a home team or enter a home label.";
    if (!awayOk) return "Pick an away team or enter an away label.";
    if (
      f.home_team_id &&
      f.home_team_id !== CUSTOM &&
      f.home_team_id === f.away_team_id
    ) {
      return "Home and away teams must be different.";
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
    const res = await createMatch(tournamentId, toPayload(composer));
    setPosting(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? "Could not add match.");
      return;
    }
    toast.success("Match added.");
    setMatches((prev) => [...prev, res.data as AdminMatch]);
    setComposer(emptyForm(composer.round_id));
    setComposerOpen(false);
  };

  const startEdit = (m: AdminMatch) => {
    setEditingId(m.id);
    setEditForm(fromMatch(m));
  };

  const saveEdit = async (m: AdminMatch) => {
    const err = validate(editForm);
    if (err) {
      toast.error(err);
      return;
    }
    setBusyId(m.id);
    const res = await updateMatch(tournamentId, m.id, toPayload(editForm));
    setBusyId(null);
    if (res.error || !res.data) {
      toast.error(res.error ?? "Save failed.");
      return;
    }
    toast.success("Match saved.");
    setMatches((prev) => prev.map((x) => (x.id === m.id ? (res.data as AdminMatch) : x)));
    setEditingId(null);
  };

  const handleDelete = async (m: AdminMatch) => {
    const home = labelFor(m, teams, "home");
    const away = labelFor(m, teams, "away");
    if (!window.confirm(`Delete ${home} vs ${away}? This can't be undone.`)) return;
    setBusyId(m.id);
    const res = await deleteMatch(tournamentId, m.id);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setMatches((prev) => prev.filter((x) => x.id !== m.id));
    toast.success("Match deleted.");
  };

  const onScorersChanged = (matchId: string, scorers: AdminMatch["scorers"]) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, scorers } : m))
    );
  };

  const onTeamCreated = (team: AdminTeamRow) => {
    setTeams((prev) =>
      [...prev, team].sort((a, b) => a.name.localeCompare(b.name))
    );
  };

  return (
    <div className="dashboard-card p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
            Schedule &amp; scores
          </h2>
          <p className="text-sm text-zinc-400 mt-1 max-w-prose">
            Build the fixtures, enter scores, and log goal scorers. The public
            event page renders the standings table and Golden Boot from this.
            Add teams under the Teams tab, or quick-add one below.
          </p>
        </div>
        {!composerOpen && (
          <button
            type="button"
            onClick={() => {
              setComposer(emptyForm(rounds[0]?.id ?? ""));
              setComposerOpen(true);
            }}
            className="inline-flex items-center gap-2 btn-primary text-sm"
          >
            <Plus size={14} />
            Add match
          </button>
        )}
      </div>

      <QuickAddTeam
        tournamentId={tournamentId}
        teamCount={teams.length}
        onCreated={onTeamCreated}
      />

      {composerOpen && (
        <div className="rounded-lg border border-brand/30 bg-surface-2/40 p-4 space-y-4">
          <MatchFormFields
            f={composer}
            onChange={setComposer}
            teams={teams}
            rounds={rounds}
          />
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
              disabled={posting}
              className="inline-flex items-center gap-1 text-xs btn-primary !px-3 !py-1.5 disabled:opacity-50"
            >
              {posting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {posting ? "Adding\u2026" : "Add match"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <ListRowsSkeleton rows={3} />
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : matches.length === 0 && !composerOpen ? (
        <AdminEmptyState
          icon={Swords}
          title="No matches yet"
          description="Add fixtures to build the schedule, scores, standings, and top scorers shown on the public event page."
          actionLabel="Add match"
          onAction={() => {
            setComposer(emptyForm(rounds[0]?.id ?? ""));
            setComposerOpen(true);
          }}
          className="py-6"
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.key} className="space-y-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                {group.round ? group.round.label : "Unscheduled"}
                <span className="text-xs text-zinc-500 font-normal">
                  {group.matches.length}{" "}
                  {group.matches.length === 1 ? "match" : "matches"}
                </span>
              </h3>
              <div className="space-y-2">
                {group.matches.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    teams={teams}
                    rounds={rounds}
                    tournamentId={tournamentId}
                    editing={editingId === m.id}
                    busy={busyId === m.id}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    onStartEdit={() => startEdit(m)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => saveEdit(m)}
                    onDelete={() => handleDelete(m)}
                    onScorersChanged={(s) => onScorersChanged(m.id, s)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAddTeam({
  tournamentId,
  teamCount,
  onCreated,
}: {
  tournamentId: string;
  teamCount: number;
  onCreated: (team: AdminTeamRow) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#22d3ee");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Team name is required.");
      return;
    }
    setSaving(true);
    const res = await createTeam({ tournament_id: tournamentId, name: trimmed, color });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? "Failed to create team.");
      return;
    }
    toast.success(`Added ${trimmed}.`);
    onCreated({
      id: res.data.id,
      tournament_id: tournamentId,
      name: trimmed,
      captain_contact_id: null,
      color,
      notes: null,
      created_at: new Date().toISOString(),
    });
    setName("");
  };

  return (
    <div className="rounded-lg border border-border-token bg-surface-2/30 p-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-400 mr-1">
        {teamCount} {teamCount === 1 ? "team" : "teams"} ·
      </span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Quick-add team (e.g. Brazil)"
        className="px-3 py-1.5 bg-surface-2 border border-border-token rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/50 w-48"
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label="Team color"
        className="h-8 w-10 bg-surface-2 border border-border-token rounded-md cursor-pointer"
      />
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="inline-flex items-center gap-1 text-xs btn-secondary !px-3 !py-1.5 disabled:opacity-50"
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
        Add team
      </button>
    </div>
  );
}

function TeamPicker({
  label,
  teamId,
  customLabel,
  teams,
  onChange,
}: {
  label: string;
  teamId: string;
  customLabel: string;
  teams: AdminTeamRow[];
  onChange: (teamId: string, customLabel: string) => void;
}) {
  const isCustom = teamId === CUSTOM;
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select
        value={teamId}
        onChange={(e) => onChange(e.target.value, customLabel)}
        className={inputCls}
      >
        <option value="">Select team…</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
        <option value={CUSTOM}>Custom label…</option>
      </select>
      {isCustom && (
        <input
          type="text"
          value={customLabel}
          onChange={(e) => onChange(CUSTOM, e.target.value)}
          placeholder="e.g. Winner SF1"
          className={`${inputCls} mt-2`}
        />
      )}
    </div>
  );
}

function MatchFormFields({
  f,
  onChange,
  teams,
  rounds,
}: {
  f: MatchForm;
  onChange: (next: MatchForm) => void;
  teams: AdminTeamRow[];
  rounds: TournamentRound[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>Round</label>
        <select
          value={f.round_id}
          onChange={(e) => onChange({ ...f, round_id: e.target.value })}
          className={inputCls}
        >
          <option value="">Unscheduled</option>
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
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
      <TeamPicker
        label="Home team"
        teamId={f.home_team_id}
        customLabel={f.home_team_label}
        teams={teams}
        onChange={(id, lbl) =>
          onChange({ ...f, home_team_id: id, home_team_label: lbl })
        }
      />
      <TeamPicker
        label="Away team"
        teamId={f.away_team_id}
        customLabel={f.away_team_label}
        teams={teams}
        onChange={(id, lbl) =>
          onChange({ ...f, away_team_id: id, away_team_label: lbl })
        }
      />
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
      <div className="md:col-span-2">
        <label className={labelCls}>Kickoff time (optional)</label>
        <input
          type="text"
          value={f.kickoff_time}
          onChange={(e) => onChange({ ...f, kickoff_time: e.target.value })}
          placeholder="7:00 PM"
          className={inputCls}
        />
      </div>
    </div>
  );
}

function labelFor(
  m: AdminMatch,
  teams: AdminTeamRow[],
  side: "home" | "away"
): string {
  const id = side === "home" ? m.home_team_id : m.away_team_id;
  const label = side === "home" ? m.home_team_label : m.away_team_label;
  if (id) return teams.find((t) => t.id === id)?.name ?? "Team";
  return label ?? "TBD";
}

function MatchRow({
  match,
  teams,
  rounds,
  tournamentId,
  editing,
  busy,
  editForm,
  setEditForm,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onScorersChanged,
}: {
  match: AdminMatch;
  teams: AdminTeamRow[];
  rounds: TournamentRound[];
  tournamentId: string;
  editing: boolean;
  busy: boolean;
  editForm: MatchForm;
  setEditForm: (f: MatchForm) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onScorersChanged: (scorers: AdminMatch["scorers"]) => void;
}) {
  const [scorersOpen, setScorersOpen] = useState(false);
  const home = labelFor(match, teams, "home");
  const away = labelFor(match, teams, "away");
  const hasScore = match.home_score != null && match.away_score != null;

  return (
    <div
      className={`rounded-lg border p-3 bg-surface-2/40 ${
        editing ? "border-brand/50" : "border-border-token"
      }`}
    >
      {editing ? (
        <div className="space-y-3">
          <MatchFormFields
            f={editForm}
            onChange={setEditForm}
            teams={teams}
            rounds={rounds}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-2 py-1"
            >
              <X size={12} />
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs btn-primary !px-3 !py-1.5 disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-sm font-medium text-white truncate">
                {home} <span className="text-zinc-500">vs</span> {away}
              </span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${STATUS_PILL[match.status]}`}
              >
                {STATUS_LABELS[match.status]}
              </span>
              {match.kickoff_time && (
                <span className="text-xs text-zinc-500">{match.kickoff_time}</span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasScore && (
                <span className="font-mono text-base font-bold text-white tabular-nums">
                  {match.home_score}&nbsp;&ndash;&nbsp;{match.away_score}
                </span>
              )}
              <button
                type="button"
                onClick={() => setScorersOpen((v) => !v)}
                className="p-1.5 text-zinc-400 hover:text-brand transition-colors inline-flex items-center gap-1"
                title="Goal scorers"
              >
                <Goal size={14} />
                {match.scorers.length > 0 && (
                  <span className="text-xs">{match.scorers.length}</span>
                )}
                {scorersOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              <button
                type="button"
                onClick={onStartEdit}
                disabled={busy}
                className="p-1.5 text-zinc-400 hover:text-brand disabled:opacity-30 transition-colors"
                title="Edit match"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="p-1.5 text-zinc-400 hover:text-red-400 disabled:opacity-30 transition-colors"
                title="Delete match"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </div>
          </div>

          {scorersOpen && (
            <ScorersEditor
              match={match}
              teams={teams}
              tournamentId={tournamentId}
              onChanged={onScorersChanged}
            />
          )}
        </>
      )}
    </div>
  );
}

function ScorersEditor({
  match,
  teams,
  tournamentId,
  onChanged,
}: {
  match: AdminMatch;
  teams: AdminTeamRow[];
  tournamentId: string;
  onChanged: (scorers: AdminMatch["scorers"]) => void;
}) {
  const [name, setName] = useState("");
  const [goals, setGoals] = useState("1");
  const [teamId, setTeamId] = useState<string>(match.home_team_id ?? "");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sides = [match.home_team_id, match.away_team_id]
    .filter((id): id is string => Boolean(id))
    .map((id) => teams.find((t) => t.id === id))
    .filter((t): t is AdminTeamRow => Boolean(t));

  const teamName = (id: string | null) =>
    id ? teams.find((t) => t.id === id)?.name ?? "—" : "—";

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Scorer name is required.");
      return;
    }
    const g = Number(goals);
    if (!Number.isInteger(g) || g < 1) {
      toast.error("Goals must be 1 or more.");
      return;
    }
    setSaving(true);
    const res = await addScorer(tournamentId, match.id, {
      scorer_name: trimmed,
      goals: g,
      team_id: teamId || null,
    });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? "Could not add scorer.");
      return;
    }
    onChanged([...match.scorers, res.data]);
    setName("");
    setGoals("1");
  };

  const remove = async (scorerId: string) => {
    setBusyId(scorerId);
    const res = await deleteScorer(tournamentId, match.id, scorerId);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    onChanged(match.scorers.filter((s) => s.id !== scorerId));
  };

  return (
    <div className="mt-3 pt-3 border-t border-border-token/60 space-y-2">
      {match.scorers.length > 0 ? (
        <ul className="space-y-1">
          {match.scorers.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 text-sm bg-base/40 rounded-md px-2.5 py-1.5"
            >
              <Goal size={12} className="text-brand shrink-0" />
              <span className="text-white">{s.scorer_name}</span>
              <span className="text-zinc-400">×{s.goals}</span>
              <span className="text-xs text-zinc-500 truncate">
                {teamName(s.team_id)}
              </span>
              <button
                type="button"
                onClick={() => remove(s.id)}
                disabled={busyId === s.id}
                className="ml-auto text-zinc-400 hover:text-red-400 disabled:opacity-50"
                aria-label="Remove scorer"
              >
                {busyId === s.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500 italic">No scorers logged yet.</p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="Scorer name"
          className="px-2.5 py-1.5 bg-surface-2 border border-border-token rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/50 w-40"
        />
        <input
          type="number"
          min={1}
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          aria-label="Goals"
          className="px-2.5 py-1.5 bg-surface-2 border border-border-token rounded-md text-sm text-white w-16"
        />
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          aria-label="Scorer team"
          className="px-2.5 py-1.5 bg-surface-2 border border-border-token rounded-md text-sm text-white"
        >
          <option value="">No team</option>
          {sides.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={saving}
          className="inline-flex items-center gap-1 text-xs btn-secondary !px-3 !py-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Add goal
        </button>
      </div>
    </div>
  );
}
