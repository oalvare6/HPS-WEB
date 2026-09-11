import assert from "node:assert/strict";
import {
  playerLink,
  playerMatches,
  paymentLabel,
  outstandingMatches,
} from "../src/components/admin/workspace";
import type { RosterRow } from "../src/lib/admin-roster";
import type { TournamentMatch, TournamentRound } from "../src/lib/types";

const player: RosterRow = {
  id: "sample",
  role: "player",
  contactId: null,
  firstName: "Sample",
  lastName: "Player",
  phone: null,
  email: null,
  teamId: "team-a",
  teamName: "Team A",
  teamColor: null,
  waiverOk: true,
  waiverEvidence: "signed",
  waiverExpiresAt: null,
  paid: false,
  paymentStatus: "pending",
  paymentMethod: null,
  needsReview: false,
  review: null,
  cancelledAt: null,
  missing: [],
  emergencyName: null,
  emergencyPhone: null,
  createdAt: "2026-09-10",
};
// The roster API supplies paid=true for paid AND waived. The UI uses that
// answer; it must not invent an eligibility threshold or a second settlement rule.
const rows: RosterRow[] = Array.from({ length: 12 }, (_, i) => ({
  ...player,
  id: String(i),
  paid: i < 7,
  paymentStatus: i < 5 ? "paid" : i < 7 ? "waived" : "pending",
}));
assert.equal(rows.filter((row) => playerMatches(row, "accounted")).length, 7);
assert.equal(rows.filter((row) => playerMatches(row, "unpaid")).length, 5);
for (const row of rows) {
  assert.notEqual(
    playerMatches(row, "accounted"),
    playerMatches(row, "unpaid"),
  );
  assert.equal(playerMatches(row, "waiver-missing"), false);
}
assert.equal(paymentLabel("waived"), "Waived / free");
assert.equal(paymentLabel("partial"), "Partially paid");
assert.equal(
  playerMatches({ ...player, paymentMethod: "cash" }, "paying-cash"),
  true,
);
assert.equal(
  playerMatches(
    { ...player, paid: true, paymentMethod: "cash" },
    "paying-cash",
  ),
  false,
);
assert.equal(
  playerMatches({ ...player, role: "guest", teamId: null }, "no-team"),
  false,
);
assert.equal(playerMatches({ ...player, teamId: null }, "no-team"), true);
assert.equal(playerMatches({ ...player, needsReview: true }, "review"), true);
const href = new URL(
  playerLink("event-id", {
    team: "team & one",
    filter: "unpaid",
    player: "person/id",
  }),
  "http://localhost",
);
assert.equal(href.searchParams.get("team"), "team & one");
assert.equal(href.searchParams.get("filter"), "unpaid");
assert.equal(href.searchParams.get("player"), "person/id");
assert.equal(playerLink("event-id"), "/admin/tournaments/event-id");
const scheduled = {
  id: "match",
  round_id: "round",
  status: "scheduled",
  home_score: null,
  away_score: null,
  match_date: null,
} as TournamentMatch;
const round = {
  id: "round",
  status: "scheduled",
  round_date: "2026-09-09",
} as TournamentRound;
assert.equal(
  outstandingMatches([scheduled], [round])[0].match_date,
  "2026-09-09",
);
assert.equal(
  outstandingMatches([scheduled], [{ ...round, status: "cancelled" }]).length,
  0,
);
assert.equal(
  outstandingMatches([{ ...scheduled, status: "postponed" }], [round]).length,
  0,
);
assert.equal(
  outstandingMatches([{ ...scheduled, status: "cancelled" }], [round]).length,
  0,
);
assert.equal(
  outstandingMatches(
    [{ ...scheduled, status: "completed", home_score: 2, away_score: 1 }],
    [round],
  ).length,
  0,
);
console.log(
  "PASS admin workspace: accounted/unpaid partitions, independent waiver state, guest filters and scoped links",
);
