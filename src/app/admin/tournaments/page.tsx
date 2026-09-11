"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Trophy,
  Star,
} from "lucide-react";
import { TableSkeleton } from "@/components/shared/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { toast } from "sonner";
import { Section } from "@/components/shared/section";
import {
  MAX_FEATURED_TOURNAMENTS,
  type EventKind,
  type Tournament,
} from "@/lib/types";
import { isOpenPlay } from "@/lib/event-kind";
import { resolveEventView } from "@/lib/tournament-state";
import { useQueryParam } from "@/lib/admin-url-state";
import { useScrollRestoration } from "@/lib/use-scroll-restoration";
import { EventStateBadge } from "@/components/admin/EventStateBadge";

function formatDateRange(start: string | null, end: string | null): string {
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

export default function AdminTournamentsPage() {
  return (
    <Suspense fallback={null}>
      <AdminTournamentsContent />
    </Suspense>
  );
}

function AdminTournamentsContent() {
  useScrollRestoration("admin-tournaments");
  const router = useRouter();
  const [search, setSearch] = useQueryParam("q", "");
  const [scope, setScope] = useQueryParam("scope", "all");
  const filtered = !!search.trim() || scope !== "all";
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tournaments");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load tournaments.");
      } else {
        setTournaments(data.tournaments);
        setError("");
      }
    } catch {
      setError("Failed to load tournaments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const featuredCount = tournaments.filter((t) => t.is_featured).length;
  const canFeatureMore = featuredCount < MAX_FEATURED_TOURNAMENTS;

  /*
    Split by kind, keeping each row's index in the GLOBAL order so the reorder
    arrows keep operating on the one `display_order` sequence that actually
    exists. Re-indexing per section would let "move up" swap two events that are
    not adjacent.
  */
  const indexed: IndexedEvent[] = tournaments
    .map((event, index) => ({
      event,
      index,
    }))
    .filter(
      ({ event }) =>
        event.title.toLowerCase().includes(search.trim().toLowerCase()) &&
        (scope === "all" ||
          (scope === "draft"
            ? !resolveEventView(event).isVisible
            : resolveEventView(event).bucket === scope)),
    );
  const tournamentRows = indexed.filter(({ event }) => !isOpenPlay(event));
  const openPlayRows = indexed.filter(({ event }) => isOpenPlay(event));

  const KIND_SECTIONS: {
    kind: EventKind;
    heading: string;
    blurb: string;
    rows: IndexedEvent[];
  }[] = [
    {
      kind: "tournament",
      heading: "Tournaments",
      blurb: "Seasons with teams, a schedule and a league table.",
      rows: tournamentRows,
    },
    {
      kind: "open_play",
      heading: "Open play nights",
      blurb: "One-off pop-up nights. One date, one door price, no teams.",
      rows: openPlayRows,
    },
  ];

  const handleToggleFeatured = async (t: Tournament) => {
    const next = !t.is_featured;
    if (next && !canFeatureMore) {
      toast.error(
        `Only ${MAX_FEATURED_TOURNAMENTS} tournaments can be featured at once. Unfeature another first.`,
      );
      return;
    }
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/admin/tournaments/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_featured: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not update featured status.");
        return;
      }
      toast.success(next ? "Featured on homepage." : "Removed from homepage.");
      await load();
    } catch {
      toast.error("Could not update featured status.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReorder = async (
    id: string,
    direction: "up" | "down",
    swapWith: string,
  ) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/tournaments/${id}/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // The neighbor within this row's own section — see the reorder route.
        body: JSON.stringify({ direction, swap_with: swapWith }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Reorder failed.");
        return;
      }
      await load();
    } catch {
      toast.error("Reorder failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/tournaments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Delete failed.");
        return;
      }
      toast.success("Event deleted.");
      setPendingDelete(null);
      await load();
      router.refresh();
    } catch {
      toast.error("Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
              Events
            </h1>
            <p className="text-zinc-400">
              {tournamentRows.length} tournament
              {tournamentRows.length === 1 ? "" : "s"}
              <span className="mx-2 text-zinc-600">·</span>
              {openPlayRows.length} open play night
              {openPlayRows.length === 1 ? "" : "s"}
              <span className="mx-2 text-zinc-600">·</span>
              <span
                className={
                  featuredCount === 0
                    ? "text-zinc-500"
                    : "text-brand font-medium"
                }
                title="Tournaments shown in the homepage hero carousel"
              >
                <Star size={12} className="inline mr-1 -mt-0.5" />
                {featuredCount}/{MAX_FEATURED_TOURNAMENTS} featured on homepage
              </span>
            </p>
          </div>
          <Link href="/admin/tournaments/new" className="btn-primary">
            <Plus size={16} />
            Add event
          </Link>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-6xl mx-auto px-6 space-y-6">
          <div className="flex flex-wrap gap-4 items-end">
            <label className="admin-field flex-1">
              Find an event
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search event title"
              />
            </label>
            <label className="admin-field">
              Show
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">All events</option>
                <option value="current">Current</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
                <option value="draft">Hidden / draft</option>
              </select>
            </label>
          </div>
          {!loading &&
            !error &&
            tournaments.length > 0 &&
            indexed.length === 0 && (
              <p className="text-sm text-zinc-400">
                No events match these filters.
              </p>
            )}
          {error && <p className="text-red-400">{error}</p>}

          {loading ? (
            <TableSkeleton rows={6} columns={8} />
          ) : tournaments.length === 0 ? (
            <div className="dashboard-card overflow-hidden">
              <AdminEmptyState
                icon={Trophy}
                title="No events yet"
                description="Create a tournament or an open play night to open sign-ups, payments, and the roster."
                actionLabel="Add event"
                actionHref="/admin/tournaments/new"
              />
            </div>
          ) : (
            /*
              Grouped by kind because they are different jobs. A Friday pop-up
              night and a ten-week season were previously interleaved in one
              undifferentiated list, so the owner had to read every title to
              work out which was which.

              The arrows swap with the neighbor IN THE SAME SECTION — the row
              names its target via swap_with. The old global-index arrows made
              "down" on the last tournament look broken: the change happened
              invisibly in the other table.
            */
            <div className="space-y-8">
              {KIND_SECTIONS.map(({ kind, heading, blurb, rows }) =>
                rows.length === 0 ? null : (
                  <div key={kind} className="space-y-3">
                    <div>
                      <h2 className="text-sm font-semibold text-white">
                        {heading}
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">{blurb}</p>
                    </div>
                    <EventTable
                      rows={rows}
                      reorderDisabled={filtered}
                      kind={kind}
                      busyId={busyId}
                      canFeatureMore={canFeatureMore}
                      pendingDelete={pendingDelete}
                      onToggleFeatured={handleToggleFeatured}
                      onReorder={handleReorder}
                      onDelete={handleDelete}
                      onPendingDelete={setPendingDelete}
                      onOpen={(id) => router.push(`/admin/tournaments/${id}`)}
                    />
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

/** One event row plus where it sits in the global display order. */
type IndexedEvent = { event: Tournament; index: number };

function EventTable({
  rows,
  reorderDisabled,
  kind,
  busyId,
  canFeatureMore,
  pendingDelete,
  onToggleFeatured,
  onReorder,
  onDelete,
  onPendingDelete,
  onOpen,
}: {
  rows: IndexedEvent[];
  reorderDisabled: boolean;
  kind: EventKind;
  busyId: string | null;
  canFeatureMore: boolean;
  pendingDelete: string | null;
  onToggleFeatured: (t: Tournament) => void;
  onReorder: (id: string, direction: "up" | "down", swapWith: string) => void;
  onDelete: (id: string) => void;
  onPendingDelete: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const isOpenPlaySection = kind === "open_play";
  return (
    <div className="dashboard-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr className="border-b border-border-token text-left">
              <th className="px-4 py-3 text-zinc-400 font-medium">Title</th>
              <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">
                Format
              </th>
              <th className="px-4 py-3 text-zinc-400 font-medium hidden lg:table-cell">
                {isOpenPlaySection ? "Date" : "Dates"}
              </th>
              <th className="px-4 py-3 text-zinc-400 font-medium">Status</th>
              <th className="px-4 py-3 text-zinc-400 font-medium text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ event: t }, pos) => {
              const openView = () => onOpen(t.id);
              const sectionPrev = pos > 0 ? rows[pos - 1].event.id : null;
              const sectionNext =
                pos < rows.length - 1 ? rows[pos + 1].event.id : null;
              return (
                <tr
                  key={t.id}
                  onClick={openView}
                  className="border-b border-border-token last:border-b-0 hover:bg-surface-2/40 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                >
                  <td className="px-4 py-3 text-white font-medium">
                    <Link
                      href={`/admin/tournaments/${t.id}`}
                      className="admin-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-300 hidden md:table-cell">
                    {t.format ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 hidden lg:table-cell">
                    {formatDateRange(t.start_date, t.end_date)}
                  </td>
                  <td className="px-4 py-3">
                    <EventStateBadge tournament={t} />
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onToggleFeatured(t)}
                        disabled={
                          busyId === t.id || (!t.is_featured && !canFeatureMore)
                        }
                        className={`p-1.5 transition-colors disabled:opacity-30 ${
                          t.is_featured
                            ? "text-brand hover:text-brand-hover"
                            : "text-zinc-400 hover:text-brand"
                        }`}
                        title={
                          t.is_featured
                            ? "Unfeature on homepage"
                            : canFeatureMore
                              ? "Feature on homepage"
                              : `Max ${MAX_FEATURED_TOURNAMENTS} featured \u2014 unfeature one first`
                        }
                        aria-pressed={t.is_featured}
                      >
                        <Star
                          size={16}
                          className={t.is_featured ? "fill-current" : ""}
                        />
                      </button>
                      <button
                        onClick={() =>
                          sectionPrev && onReorder(t.id, "up", sectionPrev)
                        }
                        disabled={
                          reorderDisabled || !sectionPrev || busyId === t.id
                        }
                        className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                        title={
                          reorderDisabled
                            ? "Clear filters to change public order"
                            : "Move up"
                        }
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() =>
                          sectionNext && onReorder(t.id, "down", sectionNext)
                        }
                        disabled={
                          reorderDisabled || !sectionNext || busyId === t.id
                        }
                        className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                        title={
                          reorderDisabled
                            ? "Clear filters to change public order"
                            : "Move down"
                        }
                      >
                        <ChevronDown size={16} />
                      </button>
                      <Link
                        href={`/admin/tournaments/${t.id}?tab=settings`}
                        className="p-1.5 text-zinc-400 hover:text-brand transition-colors"
                        title="Event settings"
                      >
                        <Pencil size={16} />
                      </Link>
                      {pendingDelete === t.id ? (
                        <span className="inline-flex items-center gap-1 ml-1">
                          <button
                            onClick={() => onDelete(t.id)}
                            disabled={busyId === t.id}
                            title="Permanently removes this event and takes it off the public site. Signups and payment records keep existing but lose their event."
                            className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                          >
                            {busyId === t.id ? "…" : "Yes, delete this event"}
                          </button>
                          <button
                            onClick={() => onPendingDelete(null)}
                            className="text-xs px-2 py-1 rounded text-zinc-400 hover:text-white"
                          >
                            Keep it
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => onPendingDelete(t.id)}
                          className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors"
                          title="Delete this event permanently"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
