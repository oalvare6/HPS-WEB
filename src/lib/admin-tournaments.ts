/**
 * Client-side data helpers for the /admin/tournaments view and edit pages.
 *
 * These are deliberately thin wrappers around the existing admin API routes
 * so the read-only view page (Phase 1) and the edit page share one source of
 * truth for "fetch this tournament" and "fetch this tournament's stats".
 *
 * Server-side queries continue to live in the API routes under
 * src/app/api/admin/tournaments/.
 */

import type { Tournament } from "@/lib/types";

export type TournamentStats = {
  registrantCount: number;
  paidRegistrantCount: number;
  paymentCount: number;
  paymentTotalCents: number;
  currency: string;
};

export type FetchResult<T> = {
  data: T | null;
  error: string | null;
};

function isErrorBody(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

export async function fetchTournamentById(
  id: string
): Promise<FetchResult<Tournament>> {
  try {
    const res = await fetch(`/api/admin/tournaments/${id}`, {
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 404) {
        return { data: null, error: "Tournament not found." };
      }
      const message = isErrorBody(body) ? body.error : "Failed to load tournament.";
      return { data: null, error: message };
    }
    if (
      typeof body !== "object" ||
      body === null ||
      !("tournament" in body)
    ) {
      return { data: null, error: "Malformed tournament response." };
    }
    const tournament = (body as { tournament: Tournament | null }).tournament;
    if (!tournament) {
      return { data: null, error: "Tournament not found." };
    }
    return { data: tournament, error: null };
  } catch {
    return { data: null, error: "Failed to load tournament." };
  }
}

function isStatsBody(value: unknown): value is TournamentStats {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.registrantCount === "number" &&
    typeof v.paidRegistrantCount === "number" &&
    typeof v.paymentCount === "number" &&
    typeof v.paymentTotalCents === "number" &&
    typeof v.currency === "string"
  );
}

export async function fetchTournamentStats(
  id: string
): Promise<FetchResult<TournamentStats>> {
  try {
    const res = await fetch(`/api/admin/tournaments/${id}/stats`, {
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message = isErrorBody(body) ? body.error : "Failed to load tournament stats.";
      return { data: null, error: message };
    }
    if (!isStatsBody(body)) {
      return { data: null, error: "Malformed stats response." };
    }
    return { data: body, error: null };
  } catch {
    return { data: null, error: "Failed to load tournament stats." };
  }
}

export function formatTournamentDateRange(
  start: string | null,
  end: string | null
): string {
  if (!start) return "—";
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const s = new Date(start).toLocaleDateString("en-US", opts);
  if (!end) return s;
  const e = new Date(end).toLocaleDateString("en-US", opts);
  return `${s} – ${e}`;
}

export function formatPaymentTotal(
  stats: Pick<TournamentStats, "paymentTotalCents" | "currency">
): string {
  const amount = (stats.paymentTotalCents ?? 0) / 100;
  const currency = (stats.currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
