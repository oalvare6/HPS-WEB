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
