"use client";

import { useState } from "react";
import { AlertCircle, Check, Loader2, Users } from "lucide-react";
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

/**
 * The same dropdown, for a player who is **already on the roster** — it saves
 * on change instead of feeding a form submit.
 *
 * This is the gap that made the whole screen feel broken: `/register` resolves
 * to `owes_payment` or `already_paid` for anyone already signed up, and neither
 * card had a team control at all. So a returning player was never once asked
 * which team they were on, no matter how many teams the event had. All four
 * Community Cup signups sat at `team_id = NULL` because of it.
 *
 * Deliberately still offered after payment. Paying does not decide your team,
 * and a paid player stuck with no team is the exact failure this is here to fix.
 */
export function SavedTeamPicker({
  tournamentId,
  teams,
  initialTeamId,
}: {
  tournamentId: string;
  teams: TeamOption[];
  initialTeamId: string | null;
}) {
  const [teamId, setTeamId] = useState(initialTeamId ?? NO_TEAM);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

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
        {saving && (
          <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <Loader2 size={12} className="animate-spin" />
            Saving…
          </p>
        )}
        {!saving && saved && !error && (
          <p className="inline-flex items-center gap-1.5 text-xs text-green-400">
            <Check size={12} />
            Saved.
          </p>
        )}
        {!saving && !saved && !error && (
          <p className="text-xs text-zinc-500">
            You can change this later — just ask us at the field.
          </p>
        )}
        {error && (
          <p className="inline-flex items-center gap-1.5 text-xs text-red-400" role="alert">
            <AlertCircle size={12} />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
