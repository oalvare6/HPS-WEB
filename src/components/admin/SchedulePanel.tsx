"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  CalendarPlus,
  Check,
  Loader2,
  MoreHorizontal,
  Plus,
  X,
} from "lucide-react";
import { useQueryParam } from "@/lib/admin-url-state";
import { computeStandings, computeTopScorers } from "@/lib/standings";
import { getWorldCupStandingsOverride } from "@/lib/world-cup-standings";
import { WORLD_CUP_TOURNAMENT_SLUG } from "@/lib/world-cup-pricing";
import { StandingsList } from "@/components/tournament/StandingsList";
import { ScorersList } from "@/components/tournament/ScorersList";
import { MessagePreview } from "./MessagePreview";
import { toast } from "sonner";
import { ListRowsSkeleton } from "@/components/shared/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import {
  EnterResultSheet,
  type AdminMatch,
  type PreviousName,
  type SideTeam,
} from "@/components/admin/EnterResultSheet";
import { adminFetch, LOGIN_EXPIRED_MESSAGE } from "@/lib/admin-fetch";
import type { RosterPayload, RosterRow } from "@/lib/admin-roster";
import { fetchTeamsForTournament, type AdminTeamRow } from "@/lib/admin-teams";
import {
  formatShortDate,
  groupMatchesByRound,
  isMatchPlayed,
  nextMatchday,
  scheduleOverrunDay,
  scorerLabel,
  type RoundGroup,
} from "@/lib/schedule";
import { todayInHouston } from "@/lib/tournament-state";
import {
  MAX_MATCH_LABEL_LENGTH,
  MAX_MATCH_NOTE_LENGTH,
  MAX_ROUND_LABEL_LENGTH,
  MAX_ROUND_NOTE_LENGTH,
  MAX_SCORER_NAME_LENGTH,
  type MatchScorer,
  type MatchWithDetails,
  type TournamentMatch,
  type TournamentRound,
} from "@/lib/types";

/**
 * The "Schedule & scores" tab, rebuilt around rounds (plan W3).
 *
 * One card per round, in order, every match under the round it belongs to.
 * Adding a match happens inside a round, so a fixture can no longer land in a
 * flat dateless bucket. A score is entered through one sheet that saves the
 * whole result in one request; no status field exists anywhere on this screen.
 *
 * Data is loaded once. Every mutation updates the list in place from the
 * server's response; the list never unmounts into a skeleton again, so the
 * owner can enter three results in a row without losing their place.
 */

const inputCls =
  "w-full px-3 py-2 min-h-11 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors text-sm";
const labelCls =
  "block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1";
const smallBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border-token bg-surface px-3 text-sm text-white hover:border-brand/50 disabled:opacity-40 disabled:cursor-not-allowed";
const ghostBtn =
  "inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-zinc-400 hover:text-white disabled:opacity-50";
const primarySmall =
  "btn-primary min-h-11 !px-4 !py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed";
const formCard =
  "rounded-lg border border-brand/30 bg-surface-2/40 p-4 space-y-4";

const KICKOFF_SLOTS = ["7:00 PM", "8:00 PM", "9:00 PM"] as const;
const OTHER_KICKOFF = "other";
/** Select value meaning "type a placeholder name instead of picking a team". */
const PLACEHOLDER = "__placeholder__";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function timeRangeOf(
  r: Pick<TournamentRound, "time_start" | "time_end">,
): string | null {
  if (r.time_start && r.time_end) return `${r.time_start} – ${r.time_end}`;
  return r.time_start || r.time_end || null;
}

function nextKickoffAfter(current: string | null): string {
  const idx = KICKOFF_SLOTS.findIndex((s) => s === current);
  if (idx === -1) return KICKOFF_SLOTS[0];
  return KICKOFF_SLOTS[Math.min(idx + 1, KICKOFF_SLOTS.length - 1)];
}

function isSlot(v: string | null): v is (typeof KICKOFF_SLOTS)[number] {
  return KICKOFF_SLOTS.some((s) => s === v);
}

function Pill({
  tone,
  children,
}: {
  tone: "brand" | "yellow" | "red";
  children: React.ReactNode;
}) {
  const cls =
    tone === "brand"
      ? "bg-brand/15 text-brand"
      : tone === "yellow"
        ? "bg-yellow-500/20 text-yellow-300"
        : "bg-red-500/20 text-red-300";
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider ${cls}`}
    >
      {children}
    </span>
  );
}

/** The team on one side of a match, as a name and whether it is a placeholder. */
function sideOf(
  m: MatchWithDetails,
  side: "home" | "away",
): { name: string; placeholder: boolean } {
  const team = side === "home" ? m.home_team : m.away_team;
  const label = side === "home" ? m.home_team_label : m.away_team_label;
  if (team) return { name: team.name, placeholder: false };
  return { name: label?.trim() || "TBD", placeholder: true };
}

// ---------------------------------------------------------------------------
// Overflow menu
// ---------------------------------------------------------------------------

type MenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
};

function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (
        ref.current &&
        e.target instanceof Node &&
        !ref.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-token bg-surface text-zinc-300 hover:border-brand/50 hover:text-white"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-lg border border-border-token bg-surface shadow-lg shadow-black/40"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              title={it.title}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={`block min-h-11 w-full px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                it.danger
                  ? "text-red-300 hover:bg-red-500/10"
                  : "text-zinc-200 hover:bg-base"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round form (add and edit)
// ---------------------------------------------------------------------------

type RoundPayload = {
  label: string;
  round_date: string | null;
  time_start: string | null;
  time_end: string | null;
  counts_toward_table: boolean;
  note: string | null;
};

type RoundFormState = {
  label: string;
  round_date: string;
  time_start: string;
  time_end: string;
  counts: boolean;
  note: string;
};

function roundFormFrom(r: TournamentRound): RoundFormState {
  return {
    label: r.label,
    round_date: r.round_date ?? "",
    time_start: r.time_start ?? "",
    time_end: r.time_end ?? "",
    counts: r.counts_toward_table !== false,
    note: r.note ?? "",
  };
}

/** "Round N", a week after the last round, same times as the last round. */
function defaultRoundForm(rounds: TournamentRound[]): RoundFormState {
  const last = rounds[rounds.length - 1];
  const lastDated = [...rounds].reverse().find((r) => r.round_date);
  return {
    label: `Round ${rounds.length + 1}`,
    round_date: lastDated?.round_date
      ? addDays(lastDated.round_date, 7)
      : todayInHouston(),
    time_start: last?.time_start ?? "",
    time_end: last?.time_end ?? "",
    counts: true,
    note: "",
  };
}

function roundFormToPayload(f: RoundFormState): RoundPayload {
  return {
    label: f.label.trim(),
    round_date: f.round_date || null,
    time_start: f.time_start.trim() || null,
    time_end: f.time_end.trim() || null,
    counts_toward_table: f.counts,
    note: f.note.trim() || null,
  };
}

function RoundForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  busy,
}: {
  value: RoundFormState;
  onChange: (next: RoundFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.label.trim()) {
      toast.error("Give the round a name, like Round 4 or Semi-Final.");
      return;
    }
    onSubmit();
  };
  return (
    <form onSubmit={submit} className={formCard}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className={labelCls} htmlFor={`${id}-label`}>
            Name
          </label>
          <input
            id={`${id}-label`}
            type="text"
            value={value.label}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
            maxLength={MAX_ROUND_LABEL_LENGTH}
            placeholder="Round 4, Semi-Final, Final"
            className={inputCls}
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${id}-date`}>
            Date
          </label>
          <input
            id={`${id}-date`}
            type="date"
            value={value.round_date}
            onChange={(e) => onChange({ ...value, round_date: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor={`${id}-start`}>
              Start time
            </label>
            <input
              id={`${id}-start`}
              type="text"
              value={value.time_start}
              onChange={(e) =>
                onChange({ ...value, time_start: e.target.value })
              }
              placeholder="7:00 PM"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor={`${id}-end`}>
              End time
            </label>
            <input
              id={`${id}-end`}
              type="text"
              value={value.time_end}
              onChange={(e) => onChange({ ...value, time_end: e.target.value })}
              placeholder="10:05 PM"
              className={inputCls}
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <p className={labelCls} id={`${id}-counts`}>
            Does this round count toward the table?
          </p>
          <div
            role="radiogroup"
            aria-labelledby={`${id}-counts`}
            className="inline-flex overflow-hidden rounded-lg border border-border-token"
          >
            {[true, false].map((v) => {
              const on = value.counts === v;
              return (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange({ ...value, counts: v })}
                  className={`min-h-11 px-6 text-sm transition-colors ${
                    on
                      ? "bg-brand/20 font-semibold text-brand"
                      : "text-zinc-300 hover:text-white"
                  }`}
                >
                  {v ? "Yes" : "No"}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            League rounds count. Semi-finals, the final and exhibitions do not.
          </p>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls} htmlFor={`${id}-note`}>
            Note (optional)
          </label>
          <input
            id={`${id}-note`}
            type="text"
            value={value.note}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
            maxLength={MAX_ROUND_NOTE_LENGTH}
            placeholder="Shows on the public page, e.g. Field 2 tonight"
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={ghostBtn}
        >
          <X size={14} />
          Cancel
        </button>
        <button type="submit" disabled={busy} className={primarySmall}>
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Match form (add and edit). No score, no status, no match number.
// ---------------------------------------------------------------------------

type MatchPayload = {
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_label: string | null;
  away_team_label: string | null;
  kickoff_time: string | null;
  match_date: string | null;
  notes: string | null;
};

type MatchFormState = {
  /** A team id, "" (nothing picked yet) or PLACEHOLDER. */
  home: string;
  home_label: string;
  away: string;
  away_label: string;
  /** A kickoff slot or OTHER_KICKOFF. */
  kickoff: string;
  kickoff_other: string;
  different_date: boolean;
  match_date: string;
  note: string;
};

function emptyMatchForm(kickoff: string): MatchFormState {
  return {
    home: "",
    home_label: "",
    away: "",
    away_label: "",
    kickoff,
    kickoff_other: "",
    different_date: false,
    match_date: "",
    note: "",
  };
}

function matchFormFrom(
  m: TournamentMatch,
  roundDate: string | null,
): MatchFormState {
  const different = m.match_date != null && m.match_date !== roundDate;
  return {
    home: m.home_team_id ?? (m.home_team_label ? PLACEHOLDER : ""),
    home_label: m.home_team_label ?? "",
    away: m.away_team_id ?? (m.away_team_label ? PLACEHOLDER : ""),
    away_label: m.away_team_label ?? "",
    kickoff: isSlot(m.kickoff_time) ? m.kickoff_time : OTHER_KICKOFF,
    kickoff_other: isSlot(m.kickoff_time) ? "" : (m.kickoff_time ?? ""),
    different_date: different,
    match_date: different ? (m.match_date ?? "") : "",
    note: m.notes ?? "",
  };
}

function validateMatchForm(f: MatchFormState): string | null {
  if (!f.home || (f.home === PLACEHOLDER && !f.home_label.trim())) {
    return "Pick the home team, or type a placeholder like 1st place.";
  }
  if (!f.away || (f.away === PLACEHOLDER && !f.away_label.trim())) {
    return "Pick the away team, or type a placeholder like 4th place.";
  }
  if (f.home !== PLACEHOLDER && f.home === f.away) {
    return "A team cannot play itself. Pick two different teams.";
  }
  if (f.different_date && !f.match_date) {
    return "Pick the date, or untick Different date than the round.";
  }
  return null;
}

function matchFormToPayload(
  f: MatchFormState,
  roundDate: string | null,
): MatchPayload {
  const homeId = f.home && f.home !== PLACEHOLDER ? f.home : null;
  const awayId = f.away && f.away !== PLACEHOLDER ? f.away : null;
  return {
    home_team_id: homeId,
    away_team_id: awayId,
    home_team_label: homeId ? null : f.home_label.trim() || null,
    away_team_label: awayId ? null : f.away_label.trim() || null,
    kickoff_time:
      f.kickoff === OTHER_KICKOFF ? f.kickoff_other.trim() || null : f.kickoff,
    match_date: f.different_date ? f.match_date || null : roundDate,
    notes: f.note.trim() || null,
  };
}

function TeamSelect({
  id,
  label,
  teams,
  value,
  placeholderLabel,
  onChange,
  autoFocus,
}: {
  id: string;
  label: string;
  teams: AdminTeamRow[];
  value: string;
  placeholderLabel: string;
  onChange: (team: string, placeholderLabel: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value, placeholderLabel)}
        className={inputCls}
        autoFocus={autoFocus}
      >
        <option value="">Pick a team</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
        <option value={PLACEHOLDER}>Placeholder name...</option>
      </select>
      {value === PLACEHOLDER && (
        <input
          type="text"
          value={placeholderLabel}
          onChange={(e) => onChange(value, e.target.value)}
          maxLength={MAX_MATCH_LABEL_LENGTH}
          placeholder="e.g. 1st place, Winner SF1"
          aria-label={`${label} placeholder name`}
          className={`${inputCls} mt-2`}
          autoFocus
        />
      )}
    </div>
  );
}

function MatchForm({
  mode,
  teams,
  roundDate,
  initial,
  matchNumber,
  focusTeams,
  busy,
  onSubmit,
  onDone,
  onCancel,
}: {
  mode: "add" | "edit";
  teams: AdminTeamRow[];
  roundDate: string | null;
  initial: MatchFormState;
  /** Edit mode: shown read-only. */
  matchNumber?: number | null;
  focusTeams?: boolean;
  busy: boolean;
  onSubmit: (payload: MatchPayload) => Promise<boolean>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [f, setF] = useState<MatchFormState>(initial);

  const submit = async (another: boolean) => {
    const err = validateMatchForm(f);
    if (err) {
      toast.error(err);
      return;
    }
    const ok = await onSubmit(matchFormToPayload(f, roundDate));
    if (!ok) return;
    if (another) {
      const current = f.kickoff === OTHER_KICKOFF ? null : f.kickoff;
      setF({
        ...f,
        home: "",
        home_label: "",
        away: "",
        away_label: "",
        kickoff: nextKickoffAfter(current),
        kickoff_other: "",
        note: "",
      });
      return;
    }
    onDone();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
      className={formCard}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TeamSelect
          id={`${id}-home`}
          label="Home team"
          teams={teams}
          value={f.home}
          placeholderLabel={f.home_label}
          onChange={(home, home_label) => setF({ ...f, home, home_label })}
          autoFocus={focusTeams}
        />
        <TeamSelect
          id={`${id}-away`}
          label="Away team"
          teams={teams}
          value={f.away}
          placeholderLabel={f.away_label}
          onChange={(away, away_label) => setF({ ...f, away, away_label })}
        />
        <div>
          <label className={labelCls} htmlFor={`${id}-kickoff`}>
            Kickoff
          </label>
          <select
            id={`${id}-kickoff`}
            value={f.kickoff}
            onChange={(e) => setF({ ...f, kickoff: e.target.value })}
            className={inputCls}
          >
            {KICKOFF_SLOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={OTHER_KICKOFF}>Other</option>
          </select>
          {f.kickoff === OTHER_KICKOFF && (
            <input
              type="text"
              value={f.kickoff_other}
              onChange={(e) => setF({ ...f, kickoff_other: e.target.value })}
              placeholder="e.g. 6:30 PM"
              aria-label="Kickoff time"
              className={`${inputCls} mt-2`}
              autoFocus
            />
          )}
        </div>
        <div>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={f.different_date}
              onChange={(e) => setF({ ...f, different_date: e.target.checked })}
              className="h-4 w-4 rounded border-border-token bg-surface-2 text-brand focus:ring-brand"
            />
            Different date than the round
          </label>
          {f.different_date && (
            <input
              type="date"
              value={f.match_date}
              onChange={(e) => setF({ ...f, match_date: e.target.value })}
              aria-label="Match date"
              className={inputCls}
            />
          )}
        </div>
        <div className="md:col-span-2">
          <label className={labelCls} htmlFor={`${id}-note`}>
            Note (optional)
          </label>
          <input
            id={`${id}-note`}
            type="text"
            value={f.note}
            onChange={(e) => setF({ ...f, note: e.target.value })}
            maxLength={MAX_MATCH_NOTE_LENGTH}
            placeholder="Shows on the public page, e.g. Will be made up in September"
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {mode === "add"
            ? "Match number is assigned automatically."
            : matchNumber != null
              ? `Match #${matchNumber}`
              : ""}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={ghostBtn}
          >
            <X size={14} />
            Cancel
          </button>
          {mode === "add" && (
            <button
              type="button"
              onClick={() => void submit(true)}
              disabled={busy}
              className={smallBtn}
            >
              Add another
            </button>
          )}
          <button type="submit" disabled={busy} className={primarySmall}>
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {mode === "add" ? "Add match" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// One match row
// ---------------------------------------------------------------------------

type StatusBody = {
  status: "postponed" | "cancelled" | "scheduled";
  match_date?: string;
  notes?: string;
};

type MatchHandlers = {
  patchMatch: (
    match: AdminMatch,
    patch: Partial<MatchPayload> & { round_id?: string | null },
    successMessage: string,
  ) => Promise<boolean>;
  deleteMatch: (match: AdminMatch) => Promise<void>;
  setMatchStatus: (
    match: AdminMatch,
    body: StatusBody,
    successMessage: string,
  ) => Promise<boolean>;
  clearResult: (match: AdminMatch) => Promise<void>;
  renameScorer: (
    match: AdminMatch,
    goal: MatchScorer,
    name: string,
  ) => Promise<boolean>;
  openResult: (match: AdminMatch) => void;
};

type RowPanel = null | "edit" | "postpone" | "move";

function MatchRow({
  match,
  round,
  rounds,
  teams,
  busy,
  handlers,
}: {
  match: MatchWithDetails;
  round: TournamentRound | null;
  rounds: TournamentRound[];
  teams: AdminTeamRow[];
  busy: boolean;
  handlers: MatchHandlers;
}) {
  const [panel, setPanel] = useState<RowPanel>(null);
  const [focusTeams, setFocusTeams] = useState(false);
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeNote, setPostponeNote] = useState(match.notes ?? "");
  const [moveTo, setMoveTo] = useState("");
  const [renaming, setRenaming] = useState<{
    goalId: string;
    value: string;
  } | null>(null);

  const played = isMatchPlayed(match);
  const home = sideOf(match, "home");
  const away = sideOf(match, "away");
  const hasBothTeams = Boolean(match.home_team_id && match.away_team_id);
  const roundDate = round?.round_date ?? null;
  const offDate =
    match.match_date != null && match.match_date !== roundDate
      ? formatShortDate(match.match_date)
      : null;
  const numberLabel =
    match.match_number != null ? `#${match.match_number}` : "";
  const describe = `${numberLabel ? `${numberLabel} ` : ""}${home.name} vs ${away.name}`;

  const openEdit = (focus: boolean) => {
    setFocusTeams(focus);
    setPanel("edit");
  };

  const menu: MenuItem[] = played
    ? [
        { label: "Edit match", onSelect: () => openEdit(false) },
        {
          label: "Clear result",
          danger: true,
          onSelect: () => void handlers.clearResult(match),
        },
      ]
    : [
        ...(match.status !== "postponed"
          ? [{ label: "Postpone", onSelect: () => setPanel("postpone") }]
          : []),
        ...(rounds.length > 1 || !round
          ? [
              {
                label: "Move to another round",
                onSelect: () => setPanel("move"),
              },
            ]
          : []),
        { label: "Edit match", onSelect: () => openEdit(false) },
        ...(match.status !== "cancelled"
          ? [
              {
                label: "Cancel match",
                onSelect: () => {
                  if (
                    window.confirm(
                      `Cancel ${describe}? It stays on the schedule marked Cancelled.`,
                    )
                  ) {
                    void handlers.setMatchStatus(
                      match,
                      { status: "cancelled" },
                      "Match cancelled.",
                    );
                  }
                },
              },
            ]
          : []),
        ...(match.status !== "scheduled"
          ? [
              {
                label: "Put back on the schedule",
                onSelect: () =>
                  void handlers.setMatchStatus(
                    match,
                    { status: "scheduled" },
                    "Back on the schedule.",
                  ),
              },
            ]
          : []),
        {
          label: "Delete match",
          danger: true,
          onSelect: () => void handlers.deleteMatch(match),
        },
      ];

  const submitPostpone = async () => {
    const body: StatusBody = { status: "postponed" };
    if (postponeDate) body.match_date = postponeDate;
    const note = postponeNote.trim();
    if (note) body.notes = note;
    const ok = await handlers.setMatchStatus(
      match,
      body,
      postponeDate
        ? `Postponed to ${formatShortDate(postponeDate) ?? postponeDate}.`
        : "Postponed.",
    );
    if (ok) {
      setPanel(null);
      setPostponeDate("");
    }
  };

  const submitMove = async () => {
    const target = rounds.find((r) => r.id === moveTo);
    if (!target) {
      toast.error("Pick the round to move it to.");
      return;
    }
    const keepsOwnDate =
      match.match_date != null && match.match_date !== roundDate;
    const ok = await handlers.patchMatch(
      match,
      {
        round_id: target.id,
        match_date: keepsOwnDate ? match.match_date : target.round_date,
      },
      `Moved to ${target.label}.`,
    );
    if (ok) {
      setPanel(null);
      setMoveTo("");
    }
  };

  const scorerSide = (teamId: string | null) =>
    teamId ? match.scorers.filter((s) => s.team_id === teamId) : [];

  return (
    <li className="p-3 md:px-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        {/* Line 1: number, kickoff, status */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-zinc-500 md:w-36 md:shrink-0">
          {numberLabel && <span>{numberLabel}</span>}
          {numberLabel && <span aria-hidden>·</span>}
          <span>{match.kickoff_time ?? "Time TBA"}</span>
          {match.status === "postponed" && <Pill tone="yellow">Postponed</Pill>}
          {match.status === "cancelled" && <Pill tone="red">Cancelled</Pill>}
          {offDate && !played && (
            <span className="text-yellow-300">
              {match.status === "postponed" ? `now ${offDate}` : offDate}
            </span>
          )}
        </div>

        {/* Lines 2-3: the two teams (one line from md up) */}
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-col md:flex-row md:items-center md:gap-2">
            <span
              className={`truncate ${home.placeholder ? "italic text-zinc-400" : "font-semibold text-white"}`}
            >
              {home.name}
            </span>
            <span className="hidden text-zinc-500 md:inline">vs</span>
            <span
              className={`truncate ${away.placeholder ? "italic text-zinc-400" : "font-semibold text-white"}`}
            >
              {away.name}
            </span>
          </div>
        </div>

        {played && (
          <div className="font-mono text-lg font-bold text-white md:shrink-0">
            {match.home_score} – {match.away_score}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 md:shrink-0">
          {played ? (
            <button
              type="button"
              onClick={() => handlers.openResult(match)}
              disabled={busy}
              className={smallBtn}
            >
              Edit result
            </button>
          ) : hasBothTeams ? (
            <button
              type="button"
              onClick={() => handlers.openResult(match)}
              disabled={busy || match.status === "cancelled"}
              title={
                match.status === "cancelled"
                  ? "Put the match back on the schedule first."
                  : undefined
              }
              className={primarySmall}
            >
              Enter result
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openEdit(true)}
              disabled={busy}
              className={smallBtn}
            >
              Set teams
            </button>
          )}
          {busy ? (
            <span className="inline-flex h-11 w-11 items-center justify-center text-zinc-400">
              <Loader2 size={16} className="animate-spin" />
            </span>
          ) : (
            <ActionMenu label={`More actions for ${describe}`} items={menu} />
          )}
        </div>
      </div>

      {match.notes && panel !== "edit" && (
        <p className="mt-1 text-xs italic text-zinc-400">{match.notes}</p>
      )}

      {played && (
        <div className="mt-2 space-y-0.5 text-xs text-zinc-400">
          <ScorerLine
            teamName={home.name}
            scorers={scorerSide(match.home_team_id)}
            renaming={renaming}
            setRenaming={setRenaming}
            onRename={(goal, name) => handlers.renameScorer(match, goal, name)}
          />
          <ScorerLine
            teamName={away.name}
            scorers={scorerSide(match.away_team_id)}
            renaming={renaming}
            setRenaming={setRenaming}
            onRename={(goal, name) => handlers.renameScorer(match, goal, name)}
          />
        </div>
      )}

      {panel === "edit" && (
        <div className="mt-3">
          <MatchForm
            mode="edit"
            teams={teams}
            roundDate={roundDate}
            initial={matchFormFrom(match, roundDate)}
            matchNumber={match.match_number}
            focusTeams={focusTeams}
            busy={busy}
            onSubmit={(payload) =>
              handlers.patchMatch(match, payload, "Match saved.")
            }
            onDone={() => setPanel(null)}
            onCancel={() => setPanel(null)}
          />
        </div>
      )}

      {panel === "postpone" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitPostpone();
          }}
          className={`mt-3 ${formCard}`}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={labelCls}>New date (optional)</label>
              <input
                type="date"
                value={postponeDate}
                onChange={(e) => setPostponeDate(e.target.value)}
                className={inputCls}
                autoFocus
              />
              <p className="mt-1 text-xs text-zinc-500">
                Leave it empty if the new date is not known yet.
              </p>
            </div>
            <div>
              <label className={labelCls}>Note (optional)</label>
              <input
                type="text"
                value={postponeNote}
                onChange={(e) => setPostponeNote(e.target.value)}
                maxLength={MAX_MATCH_NOTE_LENGTH}
                placeholder="e.g. Rain. Will be made up in September"
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPanel(null)}
              disabled={busy}
              className={ghostBtn}
            >
              <X size={14} />
              Cancel
            </button>
            <button type="submit" disabled={busy} className={primarySmall}>
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Postpone
            </button>
          </div>
        </form>
      )}

      {panel === "move" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitMove();
          }}
          className={`mt-3 ${formCard}`}
        >
          <div>
            <label className={labelCls}>Move to</label>
            <select
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className={inputCls}
              autoFocus
            >
              <option value="">Pick a round</option>
              {rounds
                .filter((r) => r.id !== round?.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                    {r.round_date ? ` · ${formatShortDate(r.round_date)}` : ""}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              The match takes the new round&apos;s date unless it already has
              its own.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPanel(null)}
              disabled={busy}
              className={ghostBtn}
            >
              <X size={14} />
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !moveTo}
              className={primarySmall}
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Move
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

/** "Hiram Clarke FC: William Franco 3, Jan Carlos Galo 2, Own goal" with tap-to-rename. */
function ScorerLine({
  teamName,
  scorers,
  renaming,
  setRenaming,
  onRename,
}: {
  teamName: string;
  scorers: MatchScorer[];
  renaming: { goalId: string; value: string } | null;
  setRenaming: (next: { goalId: string; value: string } | null) => void;
  onRename: (goal: MatchScorer, name: string) => Promise<boolean>;
}) {
  const [saving, setSaving] = useState(false);

  const commit = async (goal: MatchScorer) => {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (!name) {
      toast.error("The name cannot be empty.");
      return;
    }
    if (name === goal.scorer_name) {
      setRenaming(null);
      return;
    }
    setSaving(true);
    const ok = await onRename(goal, name);
    setSaving(false);
    if (ok) setRenaming(null);
  };

  return (
    <p className="leading-relaxed">
      <span className="text-zinc-500">{teamName}: </span>
      {scorers.length === 0 && (
        <span className="italic">no scorers listed</span>
      )}
      {scorers.map((s, i) => {
        const isOwn = s.own_goal === true;
        const editing = renaming?.goalId === s.id;
        return (
          <span key={s.id}>
            {i > 0 && ", "}
            {isOwn ? (
              <span>{scorerLabel(s)}</span>
            ) : editing ? (
              <span className="inline-flex items-center gap-1 align-middle">
                <input
                  type="text"
                  value={renaming.value}
                  onChange={(e) =>
                    setRenaming({ goalId: s.id, value: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commit(s);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setRenaming(null);
                    }
                  }}
                  maxLength={MAX_SCORER_NAME_LENGTH}
                  aria-label="Scorer name"
                  autoFocus
                  className="min-h-9 w-40 rounded-md border border-border-token bg-surface-2 px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <button
                  type="button"
                  onClick={() => void commit(s)}
                  disabled={saving}
                  aria-label="Save name"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-brand hover:bg-surface disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(null)}
                  aria-label="Cancel"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-400 hover:bg-surface hover:text-white"
                >
                  <X size={14} />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setRenaming({ goalId: s.id, value: s.scorer_name })
                }
                title="Tap to fix the name"
                className="-my-2.5 inline-block py-2.5 text-zinc-200 underline decoration-dotted underline-offset-2 hover:text-white"
              >
                {scorerLabel(s)}
              </button>
            )}
          </span>
        );
      })}
    </p>
  );
}

// ---------------------------------------------------------------------------
// One round card
// ---------------------------------------------------------------------------

type RoundHandlers = {
  patchRound: (
    round: TournamentRound,
    patch: Partial<RoundPayload> & { status?: "scheduled" | "cancelled" },
    successMessage: string,
  ) => Promise<boolean>;
  deleteRound: (round: TournamentRound) => Promise<void>;
  moveRound: (round: TournamentRound, newDate: string) => Promise<boolean>;
  createMatch: (roundId: string, payload: MatchPayload) => Promise<boolean>;
};

type CardPanel = null | "edit" | "move" | "add";

function RoundCard({
  group,
  isNext,
  rounds,
  teams,
  busyId,
  roundHandlers,
  matchHandlers,
  cardRef,
}: {
  group: RoundGroup;
  isNext: boolean;
  rounds: TournamentRound[];
  teams: AdminTeamRow[];
  busyId: string | null;
  roundHandlers: RoundHandlers;
  matchHandlers: MatchHandlers;
  cardRef: (el: HTMLElement | null) => void;
}) {
  const round = group.round;
  const [panel, setPanel] = useState<CardPanel>(null);
  const [editForm, setEditForm] = useState<RoundFormState | null>(null);
  const [moveDate, setMoveDate] = useState("");
  const busy = round != null && busyId === round.id;
  const cancelled = round?.status === "cancelled";
  const dateLabel = formatShortDate(group.date) ?? "Date to be set";
  const timeRange = round ? timeRangeOf(round) : null;

  const lastKickoff =
    group.matches.length > 0
      ? group.matches[group.matches.length - 1].kickoff_time
      : null;
  const defaultKickoff =
    group.matches.length === 0
      ? KICKOFF_SLOTS[0]
      : nextKickoffAfter(lastKickoff);

  const openEdit = () => {
    if (!round) return;
    setEditForm(roundFormFrom(round));
    setPanel("edit");
  };

  const menu: MenuItem[] = round
    ? [
        { label: "Edit round", onSelect: openEdit },
        {
          label: "Move this round",
          onSelect: () => {
            setMoveDate(round.round_date ?? "");
            setPanel("move");
          },
        },
        cancelled
          ? {
              label: "Un-cancel round",
              onSelect: () =>
                void roundHandlers.patchRound(
                  round,
                  { status: "scheduled" },
                  `${round.label} is back on.`,
                ),
            }
          : {
              label: "Cancel round",
              onSelect: () => {
                if (
                  window.confirm(
                    `Cancel ${round.label}? Players see it marked Cancelled on the public page. You can undo this.`,
                  )
                ) {
                  void roundHandlers.patchRound(
                    round,
                    { status: "cancelled" },
                    `${round.label} cancelled.`,
                  );
                }
              },
            },
        {
          label: "Delete round",
          danger: true,
          disabled: group.matches.length > 0,
          title:
            group.matches.length > 0
              ? "Move or delete its matches first."
              : undefined,
          onSelect: () => void roundHandlers.deleteRound(round),
        },
      ]
    : [];

  return (
    <section
      ref={cardRef}
      aria-label={group.label}
      className={`dashboard-card scroll-mt-24 p-4 md:p-6 space-y-4 ${
        isNext ? "ring-1 ring-brand/60" : ""
      } ${cancelled ? "opacity-80" : ""}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white">
              {group.label}
              <span className="font-normal text-zinc-300">
                {" "}
                · {dateLabel}
                {timeRange ? ` · ${timeRange}` : ""}
              </span>
            </h3>
            {isNext && <Pill tone="brand">Next</Pill>}
            {cancelled && <Pill tone="red">Cancelled</Pill>}
          </div>
          <p className="text-xs text-zinc-500">
            {round
              ? group.countsTowardTable
                ? "Counts toward the table"
                : "Does not count toward the table"
              : "These matches have no round. Use Move to another round on each one."}
          </p>
          {round?.note && (
            <p className="mt-1 text-xs italic text-zinc-400">{round.note}</p>
          )}
        </div>
        {round && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setPanel(panel === "add" ? null : "add")}
              disabled={busy}
              className={smallBtn}
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add match</span>
              <span className="sm:hidden">Match</span>
            </button>
            {busy ? (
              <span className="inline-flex h-11 w-11 items-center justify-center text-zinc-400">
                <Loader2 size={16} className="animate-spin" />
              </span>
            ) : (
              <ActionMenu
                label={`More actions for ${group.label}`}
                items={menu}
              />
            )}
          </div>
        )}
      </header>

      {panel === "edit" && round && editForm && (
        <RoundForm
          value={editForm}
          onChange={setEditForm}
          submitLabel="Save"
          busy={busy}
          onCancel={() => setPanel(null)}
          onSubmit={() => {
            void roundHandlers
              .patchRound(round, roundFormToPayload(editForm), "Round saved.")
              .then((ok) => {
                if (ok) setPanel(null);
              });
          }}
        />
      )}

      {panel === "move" && round && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!moveDate) {
              toast.error("Pick the new date.");
              return;
            }
            void roundHandlers.moveRound(round, moveDate).then((ok) => {
              if (ok) setPanel(null);
            });
          }}
          className={formCard}
        >
          <div>
            <label className={labelCls}>New date for {round.label}</label>
            <input
              type="date"
              value={moveDate}
              onChange={(e) => setMoveDate(e.target.value)}
              className={inputCls}
              autoFocus
            />
            <p className="mt-1 text-xs text-zinc-500">
              Every match still on the old date moves with it. A match you
              already moved on its own keeps its date.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPanel(null)}
              disabled={busy}
              className={ghostBtn}
            >
              <X size={14} />
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !moveDate}
              className={primarySmall}
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Move round
            </button>
          </div>
        </form>
      )}

      <ul className="divide-y divide-border-token rounded-lg border border-border-token bg-surface-2/40">
        {group.matches.length === 0 && (
          <li className="p-4 text-sm italic text-zinc-500">
            No matches yet. Use Add match.
          </li>
        )}
        {group.matches.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            round={round}
            rounds={rounds}
            teams={teams}
            busy={busyId === m.id}
            handlers={matchHandlers}
          />
        ))}
      </ul>

      {panel === "add" && round && (
        <MatchForm
          key={`add-${round.id}`}
          mode="add"
          teams={teams}
          roundDate={round.round_date}
          initial={emptyMatchForm(defaultKickoff)}
          busy={busy}
          onSubmit={(payload) => roundHandlers.createMatch(round.id, payload)}
          onDone={() => setPanel(null)}
          onCancel={() => setPanel(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export function SchedulePanel({
  tournamentId,
  tournamentSlug,
  eventLastDay = null,
}: {
  tournamentId: string;
  tournamentSlug: string;
  /**
   * The event's last calendar day from its Settings (YYYY-MM-DD), so the panel
   * can say when the schedule runs past it. Null when the event is undated.
   */
  eventLastDay?: string | null;
}) {
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [teams, setTeams] = useState<AdminTeamRow[]>([]);
  const [rosterRows, setRosterRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addRoundOpen, setAddRoundOpen] = useState(false);
  const [addRoundForm, setAddRoundForm] = useState<RoundFormState | null>(null);
  const [resultMatchId, setResultMatchId] = useQueryParam("result", "");
  const [roundParam, setRoundParam] = useQueryParam("round", "");
  const [messaging, setMessaging] = useState(false);
  const [rosterError, setRosterError] = useState("");

  const api = `/api/admin/tournaments/${tournamentId}`;

  /** Loads everything. Returns an error sentence, or null. Never touches `loading`. */
  const load = useCallback(async (): Promise<string | null> => {
    const [roundsRes, matchesRes, teamsRes, rosterRes] = await Promise.all([
      adminFetch<{ rounds: TournamentRound[] }>(`${api}/rounds`),
      adminFetch<{ matches: AdminMatch[] }>(`${api}/matches`),
      fetchTeamsForTournament(tournamentId),
      adminFetch<RosterPayload>(`${api}/roster`),
    ]);
    if (!roundsRes.ok) return roundsRes.error;
    if (!matchesRes.ok) return matchesRes.error;
    if (teamsRes.error || !teamsRes.data) {
      return teamsRes.error === "Unauthorized"
        ? LOGIN_EXPIRED_MESSAGE
        : (teamsRes.error ?? "Could not load the teams.");
    }
    setRounds(roundsRes.data.rounds ?? []);
    setMatches(
      (matchesRes.data.matches ?? []).map((m) => ({
        ...m,
        scorers: m.scorers ?? [],
      })),
    );
    setTeams(teamsRes.data);
    // The roster only feeds the name list in the result sheet; if it fails the
    // schedule still works and names can be typed.
    setRosterRows(rosterRes.ok ? (rosterRes.data.rows ?? []) : []);
    setRosterError(
      rosterRes.ok
        ? ""
        : "Player names could not be loaded. Retry before entering scorers or previewing a message.",
    );
    return null;
  }, [api, tournamentId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load().then((err) => {
      if (cancelled) return;
      setError(err ?? "");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const detailed = useMemo<MatchWithDetails[]>(() => {
    const pick = (id: string | null) => {
      const t = id ? teamById.get(id) : undefined;
      return t ? { id: t.id, name: t.name, color: t.color } : null;
    };
    return matches.map((m) => ({
      ...m,
      home_team: pick(m.home_team_id),
      away_team: pick(m.away_team_id),
    }));
  }, [matches, teamById]);

  const groups = useMemo(
    () => groupMatchesByRound(rounds, detailed),
    [rounds, detailed],
  );
  const nextKey = useMemo(() => nextMatchday(groups)?.key ?? null, [groups]);

  const visibleGroups = roundParam
    ? groups.filter((g) => g.key === roundParam)
    : groups;
  const publishedTable = tournamentSlug === WORLD_CUP_TOURNAMENT_SLUG;
  const standings = useMemo(
    () =>
      publishedTable
        ? getWorldCupStandingsOverride(teams)
        : computeStandings(teams, detailed, rounds),
    [publishedTable, teams, detailed, rounds],
  );
  const topScorers = useMemo(() => computeTopScorers(detailed), [detailed]);

  // ---- state helpers -------------------------------------------------------

  const replaceRound = (round: TournamentRound) =>
    setRounds((prev) => prev.map((r) => (r.id === round.id ? round : r)));

  const mergeMatch = (id: string, patch: Partial<TournamentMatch>) =>
    setMatches((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );

  const replaceMatch = (match: AdminMatch) =>
    setMatches((prev) =>
      prev.some((m) => m.id === match.id)
        ? prev.map((m) => (m.id === match.id ? match : m))
        : [...prev, match],
    );

  const withBusy = async <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
    setBusyId(id);
    try {
      return await fn();
    } finally {
      setBusyId((cur) => (cur === id ? null : cur));
    }
  };

  // ---- rounds --------------------------------------------------------------

  const createRound = async (payload: RoundPayload): Promise<boolean> => {
    const res = await withBusy("new-round", () =>
      adminFetch<{ round: TournamentRound }>(`${api}/rounds`, {
        method: "POST",
        json: payload,
      }),
    );
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setRounds((prev) => [...prev, res.data.round]);
    toast.success(`${res.data.round.label} added.`);
    return true;
  };

  const roundHandlers: RoundHandlers = {
    patchRound: async (round, patch, successMessage) => {
      const res = await withBusy(round.id, () =>
        adminFetch<{ round: TournamentRound }>(`${api}/rounds/${round.id}`, {
          method: "PATCH",
          json: patch,
        }),
      );
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      replaceRound(res.data.round);
      toast.success(successMessage);
      return true;
    },

    deleteRound: async (round) => {
      if (
        !window.confirm(
          `Delete ${round.label}? It has no matches, so nothing else is removed.`,
        )
      ) {
        return;
      }
      const res = await withBusy(round.id, () =>
        adminFetch<{ ok: true }>(`${api}/rounds/${round.id}`, {
          method: "DELETE",
        }),
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setRounds((prev) => prev.filter((r) => r.id !== round.id));
      toast.success(`${round.label} deleted.`);
    },

    moveRound: async (round, newDate) => {
      const res = await withBusy(round.id, () =>
        adminFetch<{ ok: true; round_date: string }>(
          `${api}/rounds/${round.id}/move`,
          { method: "POST", json: { round_date: newDate } },
        ),
      );
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      // Mirror what the server did: the round moves, and so does every match
      // still on the old date (or with no date of its own).
      const oldDate = round.round_date;
      setRounds((prev) =>
        prev.map((r) =>
          r.id === round.id
            ? {
                ...r,
                round_date: newDate,
                status: "scheduled",
                rescheduled_to: null,
              }
            : r,
        ),
      );
      setMatches((prev) =>
        prev.map((m) =>
          m.round_id === round.id &&
          (m.match_date == null || m.match_date === oldDate)
            ? { ...m, match_date: newDate }
            : m,
        ),
      );
      toast.success(
        `${round.label} moved to ${formatShortDate(newDate) ?? newDate}. Its matches moved with it.`,
      );
      return true;
    },

    createMatch: async (roundId, payload) => {
      const res = await withBusy(roundId, () =>
        adminFetch<{ match: AdminMatch }>(`${api}/matches`, {
          method: "POST",
          json: { round_id: roundId, ...payload },
        }),
      );
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      const created = {
        ...res.data.match,
        scorers: res.data.match.scorers ?? [],
      };
      replaceMatch(created);
      toast.success(
        created.match_number != null
          ? `Match #${created.match_number} added.`
          : "Match added.",
      );
      return true;
    },
  };

  // ---- matches -------------------------------------------------------------

  const matchHandlers: MatchHandlers = {
    patchMatch: async (match, patch, successMessage) => {
      const res = await withBusy(match.id, () =>
        adminFetch<{ match: TournamentMatch }>(`${api}/matches/${match.id}`, {
          method: "PATCH",
          json: patch,
        }),
      );
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      // The PATCH response has no scorer rows; keep the ones we have.
      mergeMatch(match.id, res.data.match);
      toast.success(successMessage);
      return true;
    },

    deleteMatch: async (match) => {
      const n = match.match_number != null ? ` #${match.match_number}` : "";
      if (
        !window.confirm(
          `Delete match${n}? This removes the match and any scorers.`,
        )
      ) {
        return;
      }
      const res = await withBusy(match.id, () =>
        adminFetch<{ ok: true }>(`${api}/matches/${match.id}`, {
          method: "DELETE",
        }),
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setMatches((prev) => prev.filter((m) => m.id !== match.id));
      toast.success("Match deleted.");
    },

    setMatchStatus: async (match, body, successMessage) => {
      const res = await withBusy(match.id, () =>
        adminFetch<{ match: TournamentMatch }>(
          `${api}/matches/${match.id}/status`,
          {
            method: "POST",
            json: body,
          },
        ),
      );
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      mergeMatch(match.id, res.data.match);
      toast.success(successMessage);
      return true;
    },

    clearResult: async (match) => {
      const n = match.match_number != null ? ` #${match.match_number}` : "";
      if (
        !window.confirm(
          `Clear the result of match${n}? The score and every scorer are removed and the table updates.`,
        )
      ) {
        return;
      }
      const res = await withBusy(match.id, () =>
        adminFetch<{ match: AdminMatch | null }>(
          `${api}/matches/${match.id}/result`,
          {
            method: "DELETE",
          },
        ),
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data.match) {
        replaceMatch({
          ...res.data.match,
          scorers: res.data.match.scorers ?? [],
        });
      } else {
        mergeMatch(match.id, {
          home_score: null,
          away_score: null,
          status: "scheduled",
        });
      }
      toast.success("Result cleared. Table and scorers updated.");
    },

    renameScorer: async (match, goal, name) => {
      const res = await adminFetch<{ scorer: MatchScorer }>(
        `${api}/matches/${match.id}/goals/${goal.id}`,
        { method: "PATCH", json: { scorer_name: name } },
      );
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      const updated = res.data.scorer;
      setMatches((prev) =>
        prev.map((m) =>
          m.id === match.id
            ? {
                ...m,
                scorers: m.scorers.map((s) =>
                  s.id === goal.id ? { ...s, ...updated } : s,
                ),
              }
            : m,
        ),
      );
      toast.success("Name updated.");
      return true;
    },

    openResult: (match) => setResultMatchId(match.id),
  };

  // ---- result sheet --------------------------------------------------------

  const resultMatch = resultMatchId
    ? (matches.find((m) => m.id === resultMatchId) ?? null)
    : null;
  const resultHome: SideTeam | null = resultMatch?.home_team_id
    ? (teamById.get(resultMatch.home_team_id) ?? null)
    : null;
  const resultAway: SideTeam | null = resultMatch?.away_team_id
    ? (teamById.get(resultMatch.away_team_id) ?? null)
    : null;

  const previousNamesByTeam = useMemo(() => {
    const map = new Map<string, PreviousName[]>();
    if (!resultMatchId) return map;
    for (const m of matches) {
      if (m.id === resultMatchId) continue;
      for (const s of m.scorers) {
        if (!s.team_id || s.own_goal === true) continue;
        const list = map.get(s.team_id) ?? [];
        list.push({ name: s.scorer_name, contactId: s.contact_id ?? null });
        map.set(s.team_id, list);
      }
    }
    return map;
  }, [matches, resultMatchId]);

  // ---- render --------------------------------------------------------------

  const openAddRound = () => {
    setAddRoundForm(defaultRoundForm(rounds));
    setAddRoundOpen(true);
  };

  /*
    The headline end date decides when the public site calls an event finished
    (lib/tournament-state.ts); the schedule does not extend it. The World Cup
    row ended 2026-07-17 while its final was dated 07-31, so for two weeks the
    site said "Past event" over fixtures still to play. Say so here, where the
    owner is looking at those dates, rather than quietly widening the sale
    window from a second source.
  */
  const overrunDay = loading
    ? null
    : scheduleOverrunDay(eventLastDay, rounds, matches);

  return (
    <div className="space-y-6">
      <div className="dashboard-card p-6 md:p-8">
        <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">
          Schedule &amp; results
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          One card per round. After a match, tap Enter result: the table and the
          top scorers on the public page update right away.
        </p>
        {!loading && !error && teams.length === 0 && (
          <p className="mt-2 text-xs text-zinc-500">
            No teams yet. Make them on the Teams tab first; a match needs two
            teams (or placeholder names like 1st place).
          </p>
        )}
        {overrunDay && (
          <p className="mt-2 text-xs text-amber-300">
            The schedule runs to {formatShortDate(overrunDay)}, after this
            event&apos;s end date ({formatShortDate(eventLastDay)}). The public
            site shows an event as finished the day after its end date, so move
            the end date on the Settings tab to keep sign-ups and scores live
            until the last match.
          </p>
        )}
      </div>

      {!loading && !error && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="admin-field flex-1 min-w-48">
            Round
            <select
              value={roundParam}
              onChange={(e) => setRoundParam(e.target.value)}
            >
              <option value="">All rounds</option>
              {groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label} · {g.date || "Undated"} · {g.playedCount}/
                  {g.matches.length} results
                </option>
              ))}
            </select>
          </label>
          {nextKey && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setRoundParam(nextKey)}
            >
              Next round
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            disabled={!!rosterError || !rosterRows.length}
            onClick={() => setMessaging(true)}
          >
            Preview schedule message
          </button>
        </div>
      )}
      {rosterError && (
        <p role="alert" className="text-sm text-amber-200">
          {rosterError}{" "}
          <button
            type="button"
            className="admin-link"
            onClick={() => void load()}
          >
            Retry
          </button>
        </p>
      )}
      {!loading && !error && roundParam && !visibleGroups.length && (
        <p className="text-sm">
          This round is no longer available.{" "}
          <button
            type="button"
            className="admin-link"
            onClick={() => setRoundParam(null)}
          >
            Show all rounds
          </button>
        </p>
      )}
      {loading ? (
        <div className="dashboard-card overflow-hidden">
          <ListRowsSkeleton rows={6} />
        </div>
      ) : error ? (
        <div className="dashboard-card p-6">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : groups.length === 0 && !addRoundOpen ? (
        <div className="dashboard-card">
          <AdminEmptyState
            icon={CalendarPlus}
            title="No rounds yet"
            description="Add the first round. A round is one matchday: a date, a time window and its matches."
            actionLabel="Add round"
            onAction={openAddRound}
            className="py-10"
          />
        </div>
      ) : (
        visibleGroups.map((g) => (
          <RoundCard
            key={g.key}
            group={g}
            isNext={g.key === nextKey}
            rounds={rounds}
            teams={teams}
            busyId={busyId}
            roundHandlers={roundHandlers}
            matchHandlers={matchHandlers}
            cardRef={() => {}}
          />
        ))
      )}

      {!loading &&
        !error &&
        (addRoundOpen && addRoundForm ? (
          <div className="dashboard-card p-4 md:p-6">
            <h3 className="mb-3 text-sm font-semibold text-white">Add round</h3>
            <RoundForm
              value={addRoundForm}
              onChange={setAddRoundForm}
              submitLabel="Add round"
              busy={busyId === "new-round"}
              onCancel={() => setAddRoundOpen(false)}
              onSubmit={() => {
                void createRound(roundFormToPayload(addRoundForm)).then(
                  (ok) => {
                    if (ok) setAddRoundOpen(false);
                  },
                );
              }}
            />
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={openAddRound}
              className={primarySmall}
            >
              <Plus size={14} />
              Add round
            </button>
          </div>
        ))}

      {!loading && !error && (
        <details className="border-t border-border-token pt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Standings & top scorers
          </summary>
          <p className="text-xs text-zinc-400 my-3">
            {publishedTable
              ? "This event uses its published final table. Scorers reflect recorded results."
              : "Uses the same results and table rules as the public event page."}
          </p>
          <div className="space-y-6">
            <StandingsList
              standings={standings}
              standingsSource={publishedTable ? "published" : "computed"}
              showCutLine={false}
            />
            <ScorersList topScorers={topScorers} />
          </div>
        </details>
      )}
      {messaging && (
        <MessagePreview
          rows={rosterRows}
          eventId={tournamentId}
          initial="schedule"
          onClose={() => setMessaging(false)}
        />
      )}
      {!loading &&
        resultMatchId &&
        (!resultMatch || !resultHome || !resultAway) && (
          <p role="alert" className="text-sm text-amber-200">
            This result cannot be opened. Check that the match exists and both
            teams are assigned.{" "}
            <button
              type="button"
              className="admin-link"
              onClick={() => setResultMatchId(null)}
            >
              Dismiss
            </button>
          </p>
        )}
      {resultMatch && resultHome && resultAway && (
        <EnterResultSheet
          key={resultMatch.id}
          tournamentId={tournamentId}
          tournamentSlug={tournamentSlug}
          match={resultMatch}
          homeTeam={resultHome}
          awayTeam={resultAway}
          rosterRows={rosterRows}
          previousNamesByTeam={previousNamesByTeam}
          onSaved={(saved) =>
            replaceMatch({ ...saved, scorers: saved.scorers ?? [] })
          }
          onClose={() => setResultMatchId(null)}
        />
      )}
    </div>
  );
}
