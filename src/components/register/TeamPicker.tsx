"use client";

import { useState } from "react";
import { AlertCircle, Check, Loader2, Lock, Users } from "lucide-react";
import type { TeamOption } from "@/lib/tournaments";

/** Sentinel for "Not sure yet" — distinct from "no team picker shown". */
export const NO_TEAM = "";

const selectClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors disabled:opacity-70 disabled:cursor-not-allowed";

/**
 * The team dropdown, in one place.
 *
 * There were two hand-rolled copies of this control (the signup form and the
 * quick-join card) and they had already drifted in wording. Three ways to
 * express team membership is what REBUILD-PLAN §2 blames for 61% of players
 * having no team at all; two ways to *ask* the question is the same mistake one
 * layer up.
 */
export function TeamSelect({
  id,
  name,
  value,
  onChange,
  teams,
  disabled = false,
  hint = "You can change this later — just ask us at the field.",
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (teamId: string) => void;
  teams: TeamOption[];
  disabled?: boolean;
  hint?: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-brand" />
        <label htmlFor={id} className="block text-sm font-semibold text-zinc-200">
          Your team
        </label>
      </div>
      <select
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        <option value={NO_TEAM}>Not sure yet — assign me later</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

/** What a player is told when they want a different team than the one they have. */
const ASK_US_TO_SWITCH =
  "Need a different team? Ask us at the field or on WhatsApp and we'll move you.";

/**
 * The team question for a player who is **already on the roster** — asked once,
 * then answered for good.
 *
 * ## Two failures, one control
 *
 * The first: `/register` resolves to `owes_payment` or `already_paid` for anyone
 * already signed up, and neither card had a team control at all, so a returning
 * player was never once asked which team they were on. All four Community Cup
 * signups sat at `team_id = NULL` because of it. That is why a picker exists
 * here at all, and why it is still offered after payment — paying does not
 * decide your team.
 *
 * The second, which is what this shape fixes: once they *had* picked, the card
 * said "you're playing for Barcelona" and then put a Barcelona-shaped dropdown
 * directly underneath. The operator's report: *"it says the team I picked but
 * then it asks to pick team again."* A screen that states a fact and immediately
 * re-asks the question reads as though it didn't believe its own sentence.
 *
 * So the dropdown only exists while the answer is unknown. Once a team is set it
 * becomes a locked row, because **switching teams is the admin's call** — they
 * balance the sides, and a player quietly moving themselves the night before is
 * the thing that unbalances them.
 */
export function SavedTeamPicker({
  tournamentId,
  teams,
  initialTeamId,
  initialTeamName,
}: {
  tournamentId: string;
  teams: TeamOption[];
  initialTeamId: string | null;
  /**
   * Resolved server-side. `teams` is empty once sign-ups close, and a player who
   * already has a team still deserves to see its name on that screen rather than
   * a blank row.
   */
  initialTeamName: string | null;
}) {
  const [teamId, setTeamId] = useState(initialTeamId ?? NO_TEAM);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const save = async (next: string) => {
    const previous = teamId;
    // Optimistic: the dropdown should move the instant it's tapped. On failure
    // we snap back, so the screen never claims a team the server didn't take.
    setTeamId(next);
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const res = await fetch("/api/register/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, teamId: next || null }),
      });
      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setTeamId(previous);
        setError(data.error || "We couldn't save that. Please try again.");
        return;
      }
      setSaved(true);
    } catch {
      setTeamId(previous);
      setError("Network error. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  // On a team — theirs at signup, or the one they just picked here. Say it once
  // and stop asking. The name comes from the loaded list first so a pick made a
  // second ago resolves without a round trip.
  if (teamId !== NO_TEAM) {
    const name =
      teams.find((t) => t.id === teamId)?.name ??
      (teamId === initialTeamId ? initialTeamName : null);

    return (
      <div className="space-y-2">
        <TeamFieldLabel />
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-surface-2 border border-border-token rounded-lg">
          <span className="text-white font-medium truncate">
            {name ?? "You're on a team for this event"}
          </span>
          <Lock size={14} className="text-zinc-500 shrink-0" aria-hidden />
        </div>
        <div className="min-h-[1.25rem]" aria-live="polite">
          {saving ? (
            <SavingLine />
          ) : error ? (
            <ErrorLine message={error} />
          ) : (
            <p className="text-xs text-zinc-500">{ASK_US_TO_SWITCH}</p>
          )}
        </div>
      </div>
    );
  }

  // Empty covers two cases — the event has no teams yet, and sign-ups have
  // closed so `/api/register/join` would reject the change anyway. One line
  // that is true of both beats a specific claim that is sometimes false.
  if (teams.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        We&apos;ll sort your team out with you — ask us at the field or on
        WhatsApp.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <TeamSelect
        id="roster-team"
        value={teamId}
        onChange={(next) => void save(next)}
        teams={teams}
        disabled={saving}
        hint={null}
      />

      <div className="min-h-[1.25rem]" aria-live="polite">
        {saving && <SavingLine />}
        {!saving && saved && !error && (
          <p className="inline-flex items-center gap-1.5 text-xs text-green-400">
            <Check size={12} />
            Saved.
          </p>
        )}
        {!saving && !saved && !error && (
          <p className="text-xs text-zinc-500">
            Pick your team and we&apos;ll lock it in — ask us at the field if it
            needs changing later.
          </p>
        )}
        {error && <ErrorLine message={error} />}
      </div>
    </div>
  );
}

function TeamFieldLabel() {
  return (
    <div className="flex items-center gap-2">
      <Users size={16} className="text-brand" />
      <p className="text-sm font-semibold text-zinc-200">Your team</p>
    </div>
  );
}

function SavingLine() {
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
      <Loader2 size={12} className="animate-spin" />
      Saving…
    </p>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-red-400" role="alert">
      <AlertCircle size={12} />
      {message}
    </p>
  );
}
