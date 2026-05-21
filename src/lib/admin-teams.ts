/**
 * Client-side data helpers for the tournament-scoped Teams tab on the admin
 * tournament detail page (Phase 3, Step 3b).
 *
 * These wrap the existing admin API routes so the panel and any future caller
 * share one source of truth for "fetch this tournament's teams" and the
 * mutations needed to assemble rosters.
 */

import type { FetchResult } from "@/lib/admin-tournaments";

export type AdminTeamRow = {
  id: string;
  tournament_id: string;
  name: string;
  captain_contact_id: string | null;
  color: string | null;
  notes: string | null;
  created_at: string;
};

export type AdminTeamRegistration = {
  id: string;
  contact_id: string | null;
  team_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  registration_type: string;
  payment_status: string;
  waiver_signed: boolean;
};

export type TeamUpdateInput = {
  name?: string;
  color?: string | null;
  notes?: string | null;
  captain_contact_id?: string | null;
};

function isErrorBody(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

function isTeamRow(value: unknown): value is AdminTeamRow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.tournament_id === "string" &&
    typeof v.name === "string"
  );
}

function isRegistrationRow(value: unknown): value is AdminTeamRegistration {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.first_name === "string" &&
    typeof v.last_name === "string" &&
    typeof v.email === "string"
  );
}

export async function fetchTeamsForTournament(
  tournamentId: string
): Promise<FetchResult<AdminTeamRow[]>> {
  try {
    const res = await fetch(
      `/api/admin/teams?tournament_id=${encodeURIComponent(tournamentId)}`,
      { cache: "no-store" }
    );
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message = isErrorBody(body) ? body.error : "Failed to load teams.";
      return { data: null, error: message };
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("teams" in body) ||
      !Array.isArray((body as { teams: unknown }).teams)
    ) {
      return { data: null, error: "Malformed teams response." };
    }
    const raw = (body as { teams: unknown[] }).teams;
    const teams = raw.filter(isTeamRow);
    return { data: teams, error: null };
  } catch {
    return { data: null, error: "Failed to load teams." };
  }
}

export async function fetchTournamentRegistrations(
  tournamentId: string
): Promise<FetchResult<AdminTeamRegistration[]>> {
  try {
    const res = await fetch(
      `/api/admin/registrations?tournament_id=${encodeURIComponent(tournamentId)}`,
      { cache: "no-store" }
    );
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message = isErrorBody(body)
        ? body.error
        : "Failed to load registrations.";
      return { data: null, error: message };
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("registrations" in body) ||
      !Array.isArray((body as { registrations: unknown }).registrations)
    ) {
      return { data: null, error: "Malformed registrations response." };
    }
    const raw = (body as { registrations: unknown[] }).registrations;
    const regs = raw.filter(isRegistrationRow);
    return { data: regs, error: null };
  } catch {
    return { data: null, error: "Failed to load registrations." };
  }
}

export async function createTeam(input: {
  tournament_id: string;
  name: string;
  color?: string | null;
}): Promise<FetchResult<{ id: string }>> {
  try {
    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message = isErrorBody(body) ? body.error : "Failed to create team.";
      return { data: null, error: message };
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("id" in body) ||
      typeof (body as { id: unknown }).id !== "string"
    ) {
      return { data: null, error: "Malformed create-team response." };
    }
    return { data: { id: (body as { id: string }).id }, error: null };
  } catch {
    return { data: null, error: "Failed to create team." };
  }
}

export async function updateTeam(
  teamId: string,
  patch: TeamUpdateInput
): Promise<FetchResult<{ id: string }>> {
  try {
    const res = await fetch(`/api/admin/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message = isErrorBody(body) ? body.error : "Failed to update team.";
      return { data: null, error: message };
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("id" in body) ||
      typeof (body as { id: unknown }).id !== "string"
    ) {
      return { data: null, error: "Malformed update-team response." };
    }
    return { data: { id: (body as { id: string }).id }, error: null };
  } catch {
    return { data: null, error: "Failed to update team." };
  }
}

export async function deleteTeam(
  teamId: string
): Promise<FetchResult<{ deleted: true }>> {
  try {
    const res = await fetch(`/api/admin/teams/${teamId}`, { method: "DELETE" });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message = isErrorBody(body) ? body.error : "Failed to delete team.";
      return { data: null, error: message };
    }
    return { data: { deleted: true }, error: null };
  } catch {
    return { data: null, error: "Failed to delete team." };
  }
}

export async function assignRegistrationToTeam(
  registrationId: string,
  teamId: string | null
): Promise<FetchResult<{ id: string; team_id: string | null }>> {
  try {
    const res = await fetch(`/api/admin/registrations/${registrationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId }),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message = isErrorBody(body)
        ? body.error
        : "Failed to assign registration.";
      return { data: null, error: message };
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("id" in body) ||
      typeof (body as { id: unknown }).id !== "string"
    ) {
      return { data: null, error: "Malformed assignment response." };
    }
    const obj = body as { id: string; team_id?: unknown };
    const returnedTeamId =
      typeof obj.team_id === "string"
        ? obj.team_id
        : obj.team_id === null
          ? null
          : null;
    return { data: { id: obj.id, team_id: returnedTeamId }, error: null };
  } catch {
    return { data: null, error: "Failed to assign registration." };
  }
}
