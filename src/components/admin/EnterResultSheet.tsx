"use client";

import { useMemo, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { AdminDialog } from "@/components/admin/AdminDialog";
import { adminFetch } from "@/lib/admin-fetch";
import type { RosterRow } from "@/lib/admin-roster";
import { isMatchPlayed } from "@/lib/schedule";
import {
  MAX_SCORER_NAME_LENGTH,
  type MatchResultInput,
  type MatchResultScorerInput,
  type MatchScorer,
  type TournamentMatch,
} from "@/lib/types";

/** A match as the admin API returns it: the row plus its scorer rows. */
export type AdminMatch = TournamentMatch & { scorers: MatchScorer[] };

/** The two real teams of a match. Placeholder sides never reach this sheet. */
export type SideTeam = { id: string; name: string };

/** A name already credited to a team earlier this season. */
export type PreviousName = { name: string; contactId: string | null };

type Candidate = { key: string; name: string; contactId: string | null };

type SideState = {
  score: number;
  candidates: Candidate[];
  /** Goals per candidate key. Missing = 0. */
  tallies: Record<string, number>;
  ownGoals: number;
  /** The "Someone else" text box. */
  other: string;
};

const MAX_SCORE = 99;

function candidateKey(name: string, contactId: string | null): string {
  return contactId ? `c:${contactId}` : `n:${name.trim().toLowerCase()}`;
}

/**
 * Who might have scored for this team: the roster (players and guests on the
 * team) plus every name already used for the team in another match this
 * season, deduped case-insensitively. A roster entry wins over a free-text
 * name because it carries the person's id.
 */
function buildCandidates(
  teamId: string,
  rosterRows: RosterRow[],
  previous: PreviousName[],
): Candidate[] {
  const out: Candidate[] = [];
  const byContact = new Map<string, Candidate>();
  const byName = new Map<string, Candidate>();

  const add = (rawName: string, contactId: string | null) => {
    const name = rawName.trim();
    if (!name) return;
    if (contactId && byContact.has(contactId)) return;
    const lower = name.toLowerCase();
    const existing = byName.get(lower);
    if (existing) {
      if (!existing.contactId && contactId) {
        existing.contactId = contactId;
        existing.key = candidateKey(name, contactId);
        byContact.set(contactId, existing);
      }
      return;
    }
    const c: Candidate = {
      key: candidateKey(name, contactId),
      name,
      contactId,
    };
    out.push(c);
    byName.set(lower, c);
    if (contactId) byContact.set(contactId, c);
  };

  for (const r of rosterRows) {
    if (r.teamId === teamId) add(`${r.firstName} ${r.lastName}`, r.contactId);
  }
  for (const p of previous) add(p.name, p.contactId);
  return out;
}

/** Pre-fill one side from the saved result (or start empty). */
function initialSide(
  team: SideTeam,
  score: number | null,
  scorers: MatchScorer[],
  rosterRows: RosterRow[],
  previous: PreviousName[],
): SideState {
  const candidates = buildCandidates(team.id, rosterRows, previous);
  const tallies: Record<string, number> = {};
  let ownGoals = 0;
  for (const s of scorers) {
    if (s.team_id !== team.id) continue;
    if (s.own_goal === true) {
      ownGoals += s.goals;
      continue;
    }
    const contactId = s.contact_id ?? null;
    const name = s.scorer_name.trim();
    let c = contactId
      ? candidates.find((x) => x.contactId === contactId)
      : undefined;
    if (!c) {
      const lower = name.toLowerCase();
      c = candidates.find((x) => x.name.toLowerCase() === lower);
    }
    if (!c) {
      c = { key: candidateKey(name, contactId), name, contactId };
      candidates.push(c);
    }
    tallies[c.key] = (tallies[c.key] ?? 0) + s.goals;
  }
  return { score: score ?? 0, candidates, tallies, ownGoals, other: "" };
}

function sideScorerTotal(s: SideState): number {
  let n = s.ownGoals;
  for (const v of Object.values(s.tallies)) n += v;
  return n;
}

function scorersFor(team: SideTeam, s: SideState): MatchResultScorerInput[] {
  const rows: MatchResultScorerInput[] = [];
  for (const c of s.candidates) {
    const goals = s.tallies[c.key] ?? 0;
    if (goals <= 0) continue;
    rows.push({
      team_id: team.id,
      scorer_name: c.name,
      goals,
      own_goal: false,
      contact_id: c.contactId,
    });
  }
  if (s.ownGoals > 0) {
    // THE ONE RULE: the row sits on the team the goal counted FOR.
    rows.push({
      team_id: team.id,
      scorer_name: "Own goal",
      goals: s.ownGoals,
      own_goal: true,
      contact_id: null,
    });
  }
  return rows;
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_SCORE, Math.trunc(n)));
}

type Props = {
  tournamentId: string;
  tournamentSlug: string;
  match: AdminMatch;
  homeTeam: SideTeam;
  awayTeam: SideTeam;
  rosterRows: RosterRow[];
  previousNamesByTeam: Map<string, PreviousName[]>;
  onSaved: (match: AdminMatch) => void;
  onClose: () => void;
};

/**
 * The Friday-night screen. Two scores with big steppers, the team's names
 * underneath, tap a name for each goal, one Save. Everything goes to the
 * server in one request so a result is either all there or not there.
 */
export function EnterResultSheet({
  tournamentId,
  tournamentSlug,
  match,
  homeTeam,
  awayTeam,
  rosterRows,
  previousNamesByTeam,
  onSaved,
  onClose,
}: Props) {
  const played = isMatchPlayed(match);
  const [home, setHome] = useState<SideState>(() =>
    initialSide(
      homeTeam,
      match.home_score,
      match.scorers,
      rosterRows,
      previousNamesByTeam.get(homeTeam.id) ?? [],
    ),
  );
  const [away, setAway] = useState<SideState>(() =>
    initialSide(
      awayTeam,
      match.away_score,
      match.scorers,
      rosterRows,
      previousNamesByTeam.get(awayTeam.id) ?? [],
    ),
  );
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const totalGoals = home.score + away.score;
  const totalScorers = useMemo(
    () => sideScorerTotal(home) + sideScorerTotal(away),
    [home, away],
  );
  const balanced = totalGoals === totalScorers;

  const base = `/api/admin/tournaments/${tournamentId}/matches/${match.id}/result`;

  const save = async () => {
    if (saving || clearing) return;
    setSaving(true);
    const body: MatchResultInput = {
      home_score: home.score,
      away_score: away.score,
      scorers: [...scorersFor(homeTeam, home), ...scorersFor(awayTeam, away)],
    };
    const res = await adminFetch<{ match: AdminMatch | null }>(base, {
      method: "PUT",
      json: body,
    });
    setSaving(false);
    if (!res.ok) {
      // On an expired login the typed result stays on screen, by design.
      toast.error(res.error);
      return;
    }
    const saved = res.data.match;
    if (!saved) {
      toast.error(
        "Saved, but the match could not be read back. Refresh the page.",
      );
      return;
    }
    toast.success("Saved. Table and scorers updated.", {
      action: {
        label: "View public page",
        onClick: () => {
          window.open(`/events/${tournamentSlug}`, "_blank", "noopener");
        },
      },
    });
    onSaved(saved);
    onClose();
  };

  const clear = async () => {
    if (saving || clearing) return;
    if (
      !window.confirm(
        "Clear this result? The score and every scorer are removed and the match goes back to not played.",
      )
    ) {
      return;
    }
    setClearing(true);
    const res = await adminFetch<{ match: AdminMatch | null }>(base, {
      method: "DELETE",
    });
    setClearing(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (!res.data.match) {
      toast.error(
        "Cleared, but the match could not be read back. Refresh the page.",
      );
      return;
    }
    toast.success("Result cleared.");
    onSaved(res.data.match);
    onClose();
  };

  const matchNo = match.match_number != null ? `#${match.match_number} · ` : "";

  return (
    <AdminDialog
      title={played ? "Edit result" : "Enter result"}
      description={`${matchNo}${homeTeam.name} vs ${awayTeam.name}`}
      onClose={onClose}
      dismissDisabled={saving || clearing}
      widthClass="md:max-w-3xl"
      footer={
        <>
          {played && (
            <button
              type="button"
              onClick={clear}
              disabled={saving || clearing}
              className="mr-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-red-300 hover:text-red-200 disabled:opacity-50"
            >
              {clearing && <Loader2 size={14} className="animate-spin" />}
              Clear result
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving || clearing}
            className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm text-zinc-400 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || clearing}
            className="btn-primary min-h-11 !px-6 !py-2 text-sm disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Saving" : "Save"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 mb-5">
        <ScoreControl team={homeTeam} state={home} onChange={setHome} />
        <ScoreControl team={awayTeam} state={away} onChange={setAway} />
      </div>
      <p
        className={`text-sm font-medium ${balanced ? "text-green-400" : "text-amber-300"}`}
        aria-live="polite"
      >
        Scorers: {totalScorers} of {totalGoals}{" "}
        {totalGoals === 1 ? "goal" : "goals"}
        {!balanced && (
          <span className="block text-xs font-normal text-zinc-400">
            You can still save. Names are for the top-scorer list; the score is
            what counts in the table.
          </span>
        )}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SideColumn team={homeTeam} state={home} onChange={setHome} />
        <SideColumn team={awayTeam} state={away} onChange={setAway} />
      </div>
    </AdminDialog>
  );
}

function SideColumn({
  team,
  state,
  onChange,
}: {
  team: SideTeam;
  state: SideState;
  onChange: (next: SideState) => void;
}) {
  const bump = (key: string, delta: number) => {
    const current = state.tallies[key] ?? 0;
    const next = Math.max(0, Math.min(MAX_SCORE, current + delta));
    const tallies = { ...state.tallies };
    if (next === 0) delete tallies[key];
    else tallies[key] = next;
    onChange({ ...state, tallies });
  };

  const bumpOwn = (delta: number) =>
    onChange({
      ...state,
      ownGoals: Math.max(0, Math.min(MAX_SCORE, state.ownGoals + delta)),
    });

  const addOther = () => {
    const name = state.other.trim();
    if (!name) return;
    const lower = name.toLowerCase();
    const existing = state.candidates.find(
      (c) => c.name.toLowerCase() === lower,
    );
    if (existing) {
      const tallies = {
        ...state.tallies,
        [existing.key]: Math.min(
          MAX_SCORE,
          (state.tallies[existing.key] ?? 0) + 1,
        ),
      };
      onChange({ ...state, tallies, other: "" });
      return;
    }
    const c: Candidate = {
      key: candidateKey(name, null),
      name,
      contactId: null,
    };
    onChange({
      ...state,
      candidates: [...state.candidates, c],
      tallies: { ...state.tallies, [c.key]: 1 },
      other: "",
    });
  };

  return (
    <section
      aria-label={team.name}
      className="rounded-lg border border-border-token bg-surface-2/40 p-3 space-y-3"
    >
      <h4 className="truncate text-sm font-semibold text-white">{team.name}</h4>

      <ul className="divide-y divide-border-token/60">
        {state.candidates.length === 0 && (
          <li className="py-2 text-xs italic text-zinc-500">
            Nobody on this team&apos;s roster yet. Use Someone else below.
          </li>
        )}
        {state.candidates.map((c) => (
          <TallyRow
            key={c.key}
            label={c.name}
            count={state.tallies[c.key] ?? 0}
            onAdd={() => bump(c.key, 1)}
            onRemove={() => bump(c.key, -1)}
          />
        ))}
        <TallyRow
          label="Own goal"
          help="the other team scored on themselves"
          count={state.ownGoals}
          onAdd={() => bumpOwn(1)}
          onRemove={() => bumpOwn(-1)}
        />
      </ul>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={state.other}
          onChange={(e) => onChange({ ...state, other: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOther();
            }
          }}
          maxLength={MAX_SCORER_NAME_LENGTH}
          placeholder="Someone else"
          aria-label={`Someone else who scored for ${team.name}`}
          className="min-h-11 w-full rounded-lg border border-border-token bg-surface-2 px-3 py-2 text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="button"
          onClick={addOther}
          disabled={!state.other.trim()}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-border-token bg-surface px-3 text-sm text-white hover:border-brand/50 disabled:opacity-40"
        >
          <Plus size={14} />
          Add
        </button>
      </div>
    </section>
  );
}

function TallyRow({
  label,
  help,
  count,
  onAdd,
  onRemove,
}: {
  label: string;
  help?: string;
  count: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const active = count > 0;
  return (
    <li
      className={`flex min-h-11 items-center gap-2 py-1 ${active ? "-mx-2 rounded-md bg-brand/10 px-2" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${active ? "font-semibold text-white" : "text-zinc-200"}`}
        >
          {label}
        </p>
        {help && (
          <p className="text-[11px] leading-tight text-zinc-500">{help}</p>
        )}
      </div>
      {active && (
        <>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove one goal from ${label}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 hover:bg-surface hover:text-white"
          >
            <Minus size={16} />
          </button>
          <span className="w-6 text-center font-mono text-base font-bold text-white">
            {count}
          </span>
        </>
      )}
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add one goal for ${label}`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-token bg-surface text-white hover:border-brand/50"
      >
        <Plus size={16} />
      </button>
    </li>
  );
}

function ScoreControl({
  team,
  state,
  onChange,
}: {
  team: SideTeam;
  state: SideState;
  onChange: (next: SideState) => void;
}) {
  const setScore = (n: number) => onChange({ ...state, score: clampScore(n) });
  return (
    <section className="text-center space-y-2">
      <h4 className="text-sm font-semibold">{team.name}</h4>{" "}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setScore(state.score - 1)}
          disabled={state.score <= 0}
          aria-label={`One less goal for ${team.name}`}
          className="inline-flex h-11 w-9 items-center justify-center rounded-lg border border-border-token bg-surface text-white hover:border-brand/50 disabled:opacity-30"
        >
          <Minus size={20} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={String(state.score)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            setScore(digits === "" ? 0 : Number(digits));
          }}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`${team.name} score`}
          className="h-12 w-14 rounded-lg border border-border-token bg-surface-2 text-center font-mono text-3xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="button"
          onClick={() => setScore(state.score + 1)}
          disabled={state.score >= MAX_SCORE}
          aria-label={`One more goal for ${team.name}`}
          className="inline-flex h-11 w-9 items-center justify-center rounded-lg border border-border-token bg-surface text-white hover:border-brand/50 disabled:opacity-30"
        >
          <Plus size={20} />
        </button>
      </div>
    </section>
  );
}
