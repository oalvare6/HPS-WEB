/**
 * Client-side data helpers for the admin "Schedule & Scores" (matches) panel.
 * Wraps the admin match + scorer API routes so the panel has one source of
 * truth for fetching and mutating fixtures.
 */

import type { FetchResult } from "@/lib/admin-tournaments";
import type { Match, MatchScorer, MatchStatus, TournamentRound } from "@/lib/types";

export type AdminMatch = Match & { scorers: MatchScorer[] };

export type MatchCreateInput = {
  round_id?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_team_label?: string | null;
  away_team_label?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  status?: MatchStatus;
  kickoff_time?: string | null;
  match_date?: string | null;
  notes?: string | null;
};

export type MatchPatchInput = MatchCreateInput & { sort_order?: number };

export type ScorerInput = {
  scorer_name: string;
  goals: number;
  team_id?: string | null;
};

function errorOf(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return fallback;
}

function base(tournamentId: string): string {
  return `/api/admin/tournaments/${tournamentId}/matches`;
}

export async function fetchMatches(
  tournamentId: string
): Promise<FetchResult<AdminMatch[]>> {
  try {
    const res = await fetch(base(tournamentId), { cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);
    if (res.status === 401) {
      if (typeof window !== "undefined") window.location.reload();
      return { data: null, error: "Session expired." };
    }
    if (!res.ok) return { data: null, error: errorOf(body, "Failed to load matches.") };
    const matches = (body as { matches?: unknown })?.matches;
    if (!Array.isArray(matches)) {
      return { data: null, error: "Malformed matches response." };
    }
    return { data: matches as AdminMatch[], error: null };
  } catch {
    return { data: null, error: "Failed to load matches." };
  }
}

export async function fetchRounds(
  tournamentId: string
): Promise<FetchResult<TournamentRound[]>> {
  try {
    const res = await fetch(
      `/api/admin/tournaments/${tournamentId}/rounds`,
      { cache: "no-store" }
    );
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: errorOf(body, "Failed to load rounds.") };
    const rounds = (body as { rounds?: unknown })?.rounds;
    if (!Array.isArray(rounds)) {
      return { data: null, error: "Malformed rounds response." };
    }
    return { data: rounds as TournamentRound[], error: null };
  } catch {
    return { data: null, error: "Failed to load rounds." };
  }
}

export async function createMatch(
  tournamentId: string,
  input: MatchCreateInput
): Promise<FetchResult<AdminMatch>> {
  try {
    const res = await fetch(base(tournamentId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: errorOf(body, "Failed to add match.") };
    return { data: (body as { match: AdminMatch }).match, error: null };
  } catch {
    return { data: null, error: "Failed to add match." };
  }
}

export async function updateMatch(
  tournamentId: string,
  matchId: string,
  patch: MatchPatchInput
): Promise<FetchResult<AdminMatch>> {
  try {
    const res = await fetch(`${base(tournamentId)}/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: errorOf(body, "Failed to save match.") };
    return { data: (body as { match: AdminMatch }).match, error: null };
  } catch {
    return { data: null, error: "Failed to save match." };
  }
}

export async function deleteMatch(
  tournamentId: string,
  matchId: string
): Promise<FetchResult<{ ok: true }>> {
  try {
    const res = await fetch(`${base(tournamentId)}/${matchId}`, {
      method: "DELETE",
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: errorOf(body, "Failed to delete match.") };
    return { data: { ok: true }, error: null };
  } catch {
    return { data: null, error: "Failed to delete match." };
  }
}

export async function addScorer(
  tournamentId: string,
  matchId: string,
  input: ScorerInput
): Promise<FetchResult<MatchScorer>> {
  try {
    const res = await fetch(`${base(tournamentId)}/${matchId}/scorers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: errorOf(body, "Failed to add scorer.") };
    return { data: (body as { scorer: MatchScorer }).scorer, error: null };
  } catch {
    return { data: null, error: "Failed to add scorer." };
  }
}

export async function deleteScorer(
  tournamentId: string,
  matchId: string,
  scorerId: string
): Promise<FetchResult<{ ok: true }>> {
  try {
    const res = await fetch(
      `${base(tournamentId)}/${matchId}/scorers/${scorerId}`,
      { method: "DELETE" }
    );
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: errorOf(body, "Failed to delete scorer.") };
    return { data: { ok: true }, error: null };
  } catch {
    return { data: null, error: "Failed to delete scorer." };
  }
}
