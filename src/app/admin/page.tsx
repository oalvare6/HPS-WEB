"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import type { Tournament, TournamentMatch, TournamentRound } from "@/lib/types";
import {
  rosterFullName,
  type RosterPayload,
  type RosterRow,
} from "@/lib/admin-roster";
import { resolveEventView, todayInHouston } from "@/lib/tournament-state";
import { formatTournamentDateRange } from "@/lib/admin-tournaments";
import { useQueryParam } from "@/lib/admin-url-state";
import {
  playerLink,
  playerMatches,
  paymentLabel,
  outstandingMatches,
  reviewSummary,
} from "@/components/admin/workspace";
import { EventStateBadge } from "@/components/admin/EventStateBadge";
import { MessagePreview } from "@/components/admin/MessagePreview";

type EventWork = {
  event: Tournament;
  roster: RosterPayload;
  matches: TournamentMatch[];
  rounds: TournamentRound[];
};
type AttentionRow = RosterRow & { eventId: string; eventTitle: string };
const ATTENTION = [
  ["all", "All attention"],
  ["unpaid", "Still unpaid"],
  ["waiver-missing", "Missing waiver"],
  ["review", "Needs review"],
  ["no-emergency", "Missing details"],
] as const;
export default function AdminOverview() {
  return (
    <Suspense fallback={<div className="admin-page">Loading workspace…</div>}>
      <Overview />
    </Suspense>
  );
}
async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Your session has expired. Reload to sign in."
        : "Some event records could not be loaded. Retry to see complete counts.",
    );
  return response.json();
}
function Overview() {
  const [work, setWork] = useState<EventWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [scope, setScope] = useQueryParam("scope", "current");
  const [attentionParam, setAttention] = useQueryParam("attention", "all");
  const attention = ATTENTION.some(([key]) => key === attentionParam)
    ? attentionParam
    : "all";
  const [search, setSearch] = useState("");
  const [messaging, setMessaging] = useState<AttentionRow[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    (async () => {
      const { tournaments } = await read<{ tournaments: Tournament[] }>(
        "/api/admin/tournaments",
        controller.signal,
      );
      const events = tournaments
        .filter((event) => {
          const view = resolveEventView(event);
          return (
            scope === "all" ||
            view.bucket === "current" ||
            view.bucket === "upcoming"
          );
        })
        .sort(
          (a, b) =>
            Number(resolveEventView(b).bucket === "current") -
              Number(resolveEventView(a).bucket === "current") ||
            (a.start_date ?? "").localeCompare(b.start_date ?? ""),
        );
      const results = await Promise.all(
        events.map(async (event) => {
          const [roster, schedule, rounds] = await Promise.all([
            read<RosterPayload>(
              `/api/admin/tournaments/${event.id}/roster`,
              controller.signal,
            ),
            event.kind === "open_play"
              ? Promise.resolve({ matches: [] })
              : read<{ matches: TournamentMatch[] }>(
                  `/api/admin/tournaments/${event.id}/matches`,
                  controller.signal,
                ),
            event.kind === "open_play"
              ? Promise.resolve({ rounds: [] })
              : read<{ rounds: TournamentRound[] }>(
                  `/api/admin/tournaments/${event.id}/rounds`,
                  controller.signal,
                ),
          ]);
          return {
            event,
            roster,
            matches: schedule.matches,
            rounds: rounds.rounds,
          };
        }),
      );
      if (!controller.signal.aborted) setWork(results);
    })()
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, scope]);
  // Stage 2.3 D: a cancelled spot with an open review is attention too — the
  // "paid after cancelling" flags live only on such rows.
  const rows: AttentionRow[] = work.flatMap(({ event, roster }) =>
    [...roster.rows, ...(roster.cancelledReviews ?? [])].map((row) => ({
      ...row,
      eventId: event.id,
      eventTitle: event.title,
    })),
  );
  const needsAttention = (r: RosterRow) =>
    !r.paid || !r.waiverOk || r.needsReview || r.missing.length > 0;
  const visible = rows.filter(
    (r) =>
      (attention === "all" ? needsAttention(r) : playerMatches(r, attention)) &&
      `${rosterFullName(r)} ${r.teamName ?? ""} ${r.eventTitle} ${r.phone ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const today = todayInHouston();
  const outstanding = work
    .flatMap(({ event, matches, roster, rounds }) =>
      (resolveEventView(event).isCancelled
        ? []
        : outstandingMatches(matches, rounds)
      ).map((match) => ({ event, match, teams: roster.teams })),
    )
    .sort((a, b) =>
      (a.match.match_date ?? "9999").localeCompare(
        b.match.match_date ?? "9999",
      ),
    );
  const missingResults = outstanding.filter(
    ({ match }) => match.match_date && match.match_date < today,
  );
  const upcoming = outstanding
    .filter(({ match }) => !match.match_date || match.match_date >= today)
    .slice(0, 5);
  return (
    <div className="admin-page space-y-7">
      <header className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <p className="admin-kicker mb-2">Houston Premier Soccer</p>
          <h1>Tournament workspace</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Players, teams and the next round. Start with what needs your
            attention.
          </p>
        </div>
        <Link href="/admin/tournaments/new" className="btn-primary">
          Create event
        </Link>
      </header>
      <div className="flex flex-wrap justify-between gap-3 text-xs">
        <label className="flex items-center gap-2 text-zinc-400">
          Showing
          <select
            className="bg-surface-2 border border-border-token px-3 py-2 text-white"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="current">Current & upcoming events</option>
            <option value="all">All events, including history</option>
          </select>
        </label>
        <Link href="/admin/payments" className="admin-link self-center">
          Card payment records ↗
        </Link>
      </div>
      {loading ? (
        <p role="status" className="py-16 text-zinc-400">
          Loading events and player records…
        </p>
      ) : error ? (
        <div role="alert" className="border-l-2 border-amber-300 pl-4 py-4">
          <p>{error}</p>
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <section>
            <div className="admin-section-heading">
              <h2>Events in focus</h2>
              <Link className="admin-link text-xs" href="/admin/tournaments">
                Manage all events
              </Link>
            </div>
            {work.length === 0 ? (
              <p className="text-sm text-zinc-400 py-6">
                No events in this view. Create an event or switch to all events.
              </p>
            ) : (
              <div className="divide-y divide-border-token border-y border-border-token">
                {work.map(({ event, roster }) => (
                  <div
                    key={event.id}
                    className="flex flex-wrap justify-between gap-4 py-4"
                  >
                    <div>
                      <Link
                        href={playerLink(event.id)}
                        className="font-medium hover:text-brand"
                      >
                        {event.title}
                      </Link>
                      <p className="text-xs text-zinc-400 mt-1">
                        {formatTournamentDateRange(
                          event.start_date,
                          event.end_date,
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                      <EventStateBadge tournament={event} />
                      <Link className="admin-link" href={playerLink(event.id)}>
                        {roster.totals.signedUp} registered
                      </Link>
                      <Link
                        className="admin-link"
                        href={playerLink(event.id, { filter: "unpaid" })}
                      >
                        {roster.totals.unpaid} unpaid
                      </Link>
                      <Link
                        className="admin-link"
                        href={playerLink(event.id, {
                          filter: "waiver-missing",
                        })}
                      >
                        {roster.totals.waiverMissing} missing waiver
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="grid lg:grid-cols-2 gap-8">
            <section>
              <div className="admin-section-heading">
                <h2>Next games</h2>
              </div>
              {upcoming.length ? (
                upcoming.map(({ event, match, teams }) => (
                  <Link
                    key={match.id}
                    href={`/admin/tournaments/${event.id}?tab=schedule&round=${match.round_id ?? ""}`}
                    className="block border-b border-border-token py-3 hover:bg-surface"
                  >
                    <p className="text-sm">
                      {teams.find((t) => t.id === match.home_team_id)?.name ||
                        match.home_team_label ||
                        "TBD"}{" "}
                      vs{" "}
                      {teams.find((t) => t.id === match.away_team_id)?.name ||
                        match.away_team_label ||
                        "TBD"}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {event.title} · Match {match.match_number ?? "—"}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {match.match_date || "Date to be set"} ·{" "}
                      {match.kickoff_time || "Kickoff to be set"}
                    </p>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-zinc-400">
                  No upcoming fixtures in this view. Open an event to manage its
                  schedule.
                </p>
              )}
            </section>
            <section>
              <div className="admin-section-heading">
                <h2>Results to enter</h2>
                <span className="text-xs text-zinc-400">
                  {missingResults.length} past fixtures
                </span>
              </div>
              {missingResults.length ? (
                missingResults.map(({ event, match }) => (
                  <Link
                    key={match.id}
                    href={`/admin/tournaments/${event.id}?tab=schedule&result=${match.id}`}
                    className="block border-b border-border-token py-3 admin-link text-sm"
                  >
                    {event.title} · Match {match.match_number ?? "—"}
                    <span className="block text-xs text-zinc-400">
                      {match.match_date} · Enter or review result
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-zinc-400">
                  No past fixtures awaiting results.
                </p>
              )}
            </section>
          </div>
          <section className="space-y-4">
            <div className="admin-section-heading">
              <h2>Players needing attention</h2>
              <span className="text-xs text-zinc-400">
                Across the events shown above
              </span>
            </div>
            <div className="admin-filters">
              {ATTENTION.map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={attention === key}
                  onClick={() => {
                    setAttention(key);
                    setSearch("");
                  }}
                >
                  {label}{" "}
                  <span className="ml-1 text-white">
                    {
                      rows.filter((r) =>
                        key === "all"
                          ? needsAttention(r)
                          : playerMatches(r, key),
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-between gap-3">
              <input
                aria-label="Search attention list"
                placeholder="Find player, team or event"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-surface-2 border border-border-token px-3 py-2 text-sm w-full sm:w-80"
              />
              <button
                type="button"
                className="admin-link text-xs"
                disabled={!visible.length}
                onClick={() => setMessaging(visible)}
              >
                Preview message to these players
              </button>
            </div>
            {visible.length === 0 ? (
              <p className="text-sm text-zinc-400 py-8">
                No players match this view.
              </p>
            ) : (
              <table className="admin-table admin-players">
                <thead>
                  <tr>
                    <th>Player / team</th>
                    <th>Event</th>
                    <th>Waiver</th>
                    <th>Payment</th>
                    <th>Other attention</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={`${row.eventId}:${row.id}`}>
                      <td>
                        <Link
                          className="admin-link font-medium"
                          href={playerLink(row.eventId, {
                            filter: attention === "all" ? undefined : attention,
                            player: row.id,
                          })}
                        >
                          {rosterFullName(row)}
                        </Link>
                        <p className="text-xs text-zinc-400">
                          {row.teamName || "No team"}
                        </p>
                      </td>
                      <td data-label="Event">{row.eventTitle}</td>
                      <td data-label="Waiver">
                        {row.waiverOk ? "Complete" : "Needed"}
                      </td>
                      <td data-label="Payment">
                        {paymentLabel(row.paymentStatus)}
                      </td>
                      <td
                        data-label="Details"
                        className="text-zinc-400 text-xs"
                      >
                        {[
                          row.cancelledAt ? "Cancelled spot" : "",
                          row.needsReview
                            ? `Needs review: ${reviewSummary(row)}`
                            : "",
                          ...row.missing.map((m) => `Missing ${m}`),
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
      {messaging && (
        <MessagePreview
          rows={messaging}
          initial={attention === "waiver-missing" ? "waiver" : "payment"}
          onClose={() => setMessaging(null)}
        />
      )}
    </div>
  );
}
