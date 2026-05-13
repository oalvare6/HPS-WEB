"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Trophy,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Section } from "@/components/shared/section";
import {
  MAX_FEATURED_TOURNAMENTS,
  type Tournament,
  type TournamentStatus,
} from "@/lib/types";
import { getPresetUrl } from "@/lib/tournament-image-presets";

const STATUS_STYLES: Record<TournamentStatus, string> = {
  upcoming: "bg-brand/20 text-brand",
  ongoing: "bg-green-500/20 text-green-400",
  completed: "bg-zinc-500/20 text-zinc-400",
  cancelled: "bg-red-500/20 text-red-400",
};

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const s = new Date(start).toLocaleDateString("en-US", opts);
  if (!end) return s;
  const e = new Date(end).toLocaleDateString("en-US", opts);
  return `${s} – ${e}`;
}

export default function AdminTournamentsPage() {
  return <AdminTournamentsContent />;
}

function AdminTournamentsContent() {
  const router = useRouter();
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

  const handleToggleFeatured = async (t: Tournament) => {
    const next = !t.is_featured;
    if (next && !canFeatureMore) {
      toast.error(
        `Only ${MAX_FEATURED_TOURNAMENTS} tournaments can be featured at once. Unfeature another first.`
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

  const handleReorder = async (id: string, direction: "up" | "down") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/tournaments/${id}/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
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
      const res = await fetch(`/api/admin/tournaments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Delete failed.");
        return;
      }
      toast.success("Tournament deleted.");
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
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Tournament Management</h1>
            <p className="text-zinc-400">
              {tournaments.length} tournament{tournaments.length === 1 ? "" : "s"} configured
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
          <div className="flex items-center gap-2">
            <Link href="/admin" className="text-sm text-zinc-400 hover:text-white transition-colors">
              ← Admin Dashboard
            </Link>
            <Link href="/admin/tournaments/new" className="btn-primary">
              <Plus size={16} />
              Add Tournament
            </Link>
          </div>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-6xl mx-auto px-6 space-y-6">
          {error && <p className="text-red-400">{error}</p>}

          {loading ? (
            <div className="flex items-center gap-3 text-zinc-400 py-8">
              <Loader2 size={24} className="animate-spin" />
              <span>Loading tournaments…</span>
            </div>
          ) : (
            <div className="dashboard-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-token text-left">
                      <th className="px-4 py-3 text-zinc-400 font-medium w-16">Image</th>
                      <th className="px-4 py-3 text-zinc-400 font-medium">Title</th>
                      <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">Format</th>
                      <th className="px-4 py-3 text-zinc-400 font-medium hidden lg:table-cell">Dates</th>
                      <th className="px-4 py-3 text-zinc-400 font-medium">Status</th>
                      <th className="px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">Reg</th>
                      <th className="px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">Pay</th>
                      <th className="px-4 py-3 text-zinc-400 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournaments.map((t, i) => {
                      const thumb = t.image_url || getPresetUrl(t.image_preset);
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-border-token last:border-b-0 hover:bg-surface-2/40 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="w-20 shrink-0 rounded overflow-hidden bg-surface-2 border border-border-token aspect-[16/7] relative">
                              {thumb ? (
                                <Image
                                  src={thumb}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="80px"
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Trophy size={16} className="text-zinc-500" />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-white font-medium">
                            <div>{t.title}</div>
                            <div className="text-xs text-zinc-500 font-mono">{t.slug}</div>
                          </td>
                          <td className="px-4 py-3 text-zinc-300 hidden md:table-cell">{t.format ?? "—"}</td>
                          <td className="px-4 py-3 text-zinc-400 hidden lg:table-cell">
                            {formatDateRange(t.start_date, t.end_date)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[t.status]}`}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <Dot on={t.registration_open} />
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <Dot on={t.payments_open} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleToggleFeatured(t)}
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
                                onClick={() => handleReorder(t.id, "up")}
                                disabled={i === 0 || busyId === t.id}
                                className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                                title="Move up"
                              >
                                <ChevronUp size={16} />
                              </button>
                              <button
                                onClick={() => handleReorder(t.id, "down")}
                                disabled={i === tournaments.length - 1 || busyId === t.id}
                                className="p-1.5 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors"
                                title="Move down"
                              >
                                <ChevronDown size={16} />
                              </button>
                              <Link
                                href={`/admin/tournaments/${t.id}/edit`}
                                className="p-1.5 text-zinc-400 hover:text-brand transition-colors"
                                title="Edit"
                              >
                                <Pencil size={16} />
                              </Link>
                              {pendingDelete === t.id ? (
                                <span className="inline-flex items-center gap-1 ml-1">
                                  <button
                                    onClick={() => handleDelete(t.id)}
                                    disabled={busyId === t.id}
                                    className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                  >
                                    {busyId === t.id ? "…" : "Confirm"}
                                  </button>
                                  <button
                                    onClick={() => setPendingDelete(null)}
                                    className="text-xs px-2 py-1 rounded text-zinc-400 hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setPendingDelete(t.id)}
                                  className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {tournaments.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-zinc-500">
                          No tournaments yet.{" "}
                          <Link href="/admin/tournaments/new" className="text-brand hover:underline">
                            Create the first one
                          </Link>
                          .
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${on ? "text-brand" : "text-zinc-500"}`}
    >
      <span className={`w-2 h-2 rounded-full ${on ? "bg-brand" : "bg-zinc-600"}`} />
      {on ? "On" : "Off"}
    </span>
  );
}
