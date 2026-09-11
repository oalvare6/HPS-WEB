import type { RosterRow } from "@/lib/admin-roster";
import type { TournamentMatch, TournamentRound } from "@/lib/types";
import { isMatchPlayed } from "@/lib/schedule";

/** Display queue only: respect round cancellations and use its date when needed. */
export function outstandingMatches(
  matches: TournamentMatch[],
  rounds: TournamentRound[],
) {
  const byId = new Map(rounds.map((round) => [round.id, round]));
  return matches
    .filter((match) => {
      const round = match.round_id ? byId.get(match.round_id) : undefined;
      return (
        !isMatchPlayed(match) &&
        !["cancelled", "postponed"].includes(match.status) &&
        round?.status !== "cancelled"
      );
    })
    .map((match) => ({
      ...match,
      match_date:
        match.match_date ??
        (match.round_id ? byId.get(match.round_id)?.round_date : null) ??
        null,
    }));
}

export const PLAYER_FILTERS = [
  ["all", "All players"],
  ["unpaid", "Still unpaid"],
  ["waiver-missing", "Missing waiver"],
  ["accounted", "Paid or waived"],
  ["review", "Needs review"],
  ["paying-cash", "Bringing cash"],
  ["no-emergency", "Missing details"],
  ["no-team", "No team"],
] as const;
export type PlayerFilter = (typeof PLAYER_FILTERS)[number][0];
export function playerMatches(row: RosterRow, filter: string) {
  switch (filter) {
    case "unpaid":
      return !row.paid;
    case "accounted":
      return row.paid;
    case "waiver-missing":
      return !row.waiverOk;
    case "review":
      return row.needsReview;
    case "paying-cash":
      return !row.paid && row.paymentMethod === "cash";
    case "no-emergency":
      return row.missing.length > 0;
    case "no-team":
      return row.role === "player" && !row.teamId;
    default:
      return true;
  }
}
/**
 * The one line under "Needs review" on a list row (Stage 2.3 D). What is
 * unsafe right now outranks what was written when the flag went up; a flag
 * with neither says so rather than inventing one. Null when not flagged.
 */
export function reviewSummary(row: RosterRow): string | null {
  if (!row.needsReview) return null;
  const view = row.review;
  if (!view) return "Flagged before reasons were recorded.";
  const first = view.live[0] ?? view.reasons[0];
  if (first) return first.text;
  return view.flaggedAgain
    ? "Flagged again after it was resolved."
    : "Flagged before reasons were recorded.";
}
export function playerLink(
  eventId: string,
  options: { filter?: string; team?: string; player?: string } = {},
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options))
    if (value) query.set(key, value);
  return `/admin/tournaments/${eventId}${query.size ? `?${query}` : ""}`;
}
export function paymentLabel(status: string) {
  return (
    (
      {
        paid: "Paid",
        waived: "Waived / free",
        partial: "Partially paid",
        refunded: "Refunded",
        pending: "Unpaid",
        unpaid: "Unpaid",
      } as Record<string, string>
    )[status] ?? "Status unknown"
  );
}
