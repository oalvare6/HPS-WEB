"use client";
import { rosterFullName, type RosterRow } from "@/lib/admin-roster";
import { paymentLabel, reviewSummary } from "./workspace";
export function PlayersTable({
  rows,
  showTeams,
  onOpen,
}: {
  rows: RosterRow[];
  showTeams: boolean;
  onOpen: (row: RosterRow) => void;
}) {
  return (
    <table className="admin-table admin-players">
      <thead>
        <tr>
          <th>Player</th>
          {showTeams && <th>Team</th>}
          <th>Waiver</th>
          <th>Payment status</th>
          <th>Declared method</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              <button
                type="button"
                className="text-left font-medium hover:text-brand"
                onClick={() => onOpen(row)}
              >
                {rosterFullName(row) || "Unnamed player"}
              </button>
              <p className="text-xs text-zinc-400">
                {row.phone || row.email || "Contact details missing"}
                {row.role === "guest" ? " · Guest" : ""}
              </p>
              {row.cancelledAt && (
                <span className="text-xs text-zinc-400">Cancelled spot · </span>
              )}
              {row.needsReview && (
                <span className="text-xs text-amber-200">
                  Needs review
                  <span className="block text-zinc-400">{reviewSummary(row)}</span>
                </span>
              )}
            </td>
            {showTeams && (
              <td data-label="Team">
                {row.teamName ||
                  (row.role === "guest" ? "Guest" : "Unassigned")}
              </td>
            )}
            <td data-label="Waiver">
              <span
                className={row.waiverOk ? "text-green-400" : "text-amber-200"}
              >
                {row.waiverOk ? "Complete" : "Needed"}
              </span>
              {row.waiverOk && row.waiverEvidence !== "document" && (
                <p className="text-[11px] text-zinc-400">No document link</p>
              )}
            </td>
            <td data-label="Payment">
              <span className={row.paid ? "text-green-400" : "text-zinc-300"}>
                {paymentLabel(row.paymentStatus)}
              </span>
              {row.freeEntryVia && (
                <p className="text-[11px] text-zinc-400">
                  Free via {row.freeEntryVia}
                </p>
              )}
            </td>
            <td data-label="Declared method" className="text-zinc-400">
              {row.paymentMethod || "Not specified"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
