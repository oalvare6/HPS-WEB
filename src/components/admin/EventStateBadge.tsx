import { resolveEventView, type EventState } from "@/lib/tournament-state";
import type { Tournament } from "@/lib/types";

/**
 * The single badge that replaces the Status / Registration / Payments trio in
 * the admin. It reads the same `resolveEventView` the public site and every
 * money path use, so what the owner sees here is what actually happens — the
 * three separate dots could previously disagree with each other and with the
 * calendar all at once.
 */
const STATE_STYLES: Record<EventState, string> = {
  draft: "bg-zinc-500/20 text-zinc-300 border border-dashed border-zinc-500",
  open: "bg-green-500/20 text-green-400",
  closed: "bg-brand/20 text-brand",
  finished: "bg-zinc-500/20 text-zinc-400",
  cancelled: "bg-red-500/20 text-red-400",
};

export function EventStateBadge({
  tournament,
  className = "",
}: {
  tournament: Tournament;
  className?: string;
}) {
  const view = resolveEventView(tournament);
  // "Open · in progress" tells the owner at a glance which event is the one
  // running tonight. The stored status used to say "Upcoming" about a season
  // two rounds in, because nothing rewrites it between saves.
  const underWay =
    view.phase === "in_progress" &&
    (view.state === "open" || view.state === "closed");
  const label = underWay ? `${view.stateLabel} · in progress` : view.stateLabel;
  const title = view.isFinished
    ? "Set automatically from the end date."
    : underWay
      ? "Under way, by its dates."
      : undefined;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${STATE_STYLES[view.state]} ${className}`}
      title={title}
    >
      {label}
    </span>
  );
}
