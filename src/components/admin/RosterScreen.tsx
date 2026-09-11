"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  X,
  Search,
  UserPlus,
  Loader2,
  RefreshCw,
  PenLine,
  ExternalLink,
  FileCheck,
  Download,
} from "lucide-react";
import {
  rosterFullName,
  type RosterPayload,
  type RosterRow,
  type RosterTeam,
} from "@/lib/admin-roster";
import { useQueryParam, useQueryParamsSetter } from "@/lib/admin-url-state";
import { PlayersTable } from "./PlayersTable";
import { PlayerDetail } from "./PlayerDetail";
import { MessagePreview } from "./MessagePreview";
import { PLAYER_FILTERS, playerMatches, type PlayerFilter } from "./workspace";

/**
 * The owner's daily driver (A3). One row per person playing this event:
 * name · team · waiver · paid. Everything the owner does at the field — change
 * someone's team, mark them paid, add a walk-in — happens in this one screen
 * without opening a second page.
 */
export default function RosterScreen({
  tournamentId,
  showTeams = true,
}: {
  tournamentId: string;
  /**
   * False for an open-play night (D15): one evening, no squads. The by-team
   * panel, the Team column and the "No team" filter all disappear, because a
   * screen that asks which team somebody is on for a Friday pop-up is asking a
   * question with no answer.
   */
  showTeams?: boolean;
}) {
  const [data, setData] = useState<RosterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useQueryParam("q", "");
  const [filterValue, setFilter] = useQueryParam("filter", "all");
  const filter = PLAYER_FILTERS.some(([key]) => key === filterValue)
    ? filterValue
    : "all";
  const [selectedId, setSelectedId] = useQueryParam("player", "");
  const setParams = useQueryParamsSetter();
  const [messaging, setMessaging] = useState<RosterRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [signing, setSigning] = useState<RosterRow | null>(null);
  const [fixing, setFixing] = useState<RosterRow | null>(null);
  const [checkingWaivers, setCheckingWaivers] = useState(false);
  /** `undefined` = no team filter; `null` = the unassigned bucket. */
  const [teamValue, setTeamValue] = useQueryParam("team", "");
  const teamFilter = teamValue === "unassigned" ? null : teamValue || undefined;
  const setTeamFilter = (value: string | null | undefined) =>
    setTeamValue(value === null ? "unassigned" : (value ?? null));

  const load = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      if (!opts.quiet) setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/tournaments/${tournamentId}/roster`,
        );
        const body = (await res.json()) as RosterPayload & { error?: string };
        if (!res.ok) {
          setError(body.error ?? "Failed to load the roster.");
          return;
        }
        setData(body);
        setError("");
      } catch {
        setError("Failed to load the roster.");
      } finally {
        setLoading(false);
      }
    },
    [tournamentId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Memoized so the `??[]` fallbacks don't hand `visible` a new array identity
  // on every render.
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const teams = useMemo(() => data?.teams ?? [], [data]);

  const visibleFilters = PLAYER_FILTERS.filter(
    ([key]) => showTeams || key !== "no-team",
  );
  const selected = rows.find((row) => row.id === selectedId);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (teamFilter !== undefined) {
        // Guests belong to no team, so they never survive a team filter —
        // matching how progressByTeam counts them.
        if (r.role === "guest") return false;
        if ((r.teamId ?? null) !== teamFilter) return false;
      }
      if (!playerMatches(r, filter)) return false;
      if (!q) return true;
      return (
        rosterFullName(r).toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.teamName ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter, teamFilter]);

  /**
   * Row edits are optimistic: at the field the owner is tapping through a queue
   * of people, and a full refetch between taps makes the screen feel broken.
   * On failure we reload to snap back to the truth.
   */
  const patchRow = async (
    row: RosterRow,
    patch: Record<string, unknown>,
    optimistic: (r: RosterRow) => RosterRow,
  ) => {
    setBusyId(row.id);
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) => (r.id === row.id ? optimistic(r) : r)),
          }
        : prev,
    );
    const url =
      row.role === "guest"
        ? `/api/admin/drop-ins/${row.id}`
        : `/api/admin/registrations/${row.id}`;
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        toast.error(body.error ?? "That change didn't save.");
        await load({ quiet: true });
        return;
      }
      // Totals live server-side; refresh them without flashing the table.
      await load({ quiet: true });
    } catch {
      toast.error("That change didn't save.");
      await load({ quiet: true });
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = (row: RosterRow, status: string) =>
    patchRow(row, { payment_status: status }, (r) => ({
      ...r,
      paid: status === "paid" || status === "waived",
      paymentStatus: status,
    }));
  const removePlayer = async (row: RosterRow) => {
    setBusyId(row.id);
    try {
      const response = await fetch(`/api/admin/registrations/${row.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Could not remove this player.");
      }
      setSelectedId(null);
      await load({ quiet: true });
      toast.success("Player removed from the event. History retained.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not remove this player.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const changeTeam = (row: RosterRow, teamId: string) => {
    const team = teams.find((t) => t.id === teamId) ?? null;
    return patchRow(row, { team_id: teamId || null }, (r) => ({
      ...r,
      teamId: teamId || null,
      teamName: team?.name ?? null,
      teamColor: team?.color ?? null,
    }));
  };

  /**
   * Ask DocuSeal for anything we're missing: signatures the webhook never
   * delivered, and documents for waivers recorded signed without a stored
   * link (the B4 backfill). Site-wide, not just this event — one honest
   * button beats making the owner learn which screen fixes which gap.
   */
  const checkWaivers = async () => {
    setCheckingWaivers(true);
    try {
      const res = await fetch("/api/admin/sync-waivers", { method: "POST" });
      const body = (await res.json()) as {
        synced?: number;
        withDocument?: number;
        total?: number;
        error?: string;
      };
      if (!res.ok) {
        toast.error(body.error ?? "Could not reach DocuSeal.");
        return;
      }
      if ((body.total ?? 0) === 0) {
        toast.success(
          "Nothing to fetch — every waiver we know about is already recorded.",
        );
      } else {
        toast.success(
          `Checked ${body.total} waiver(s): recovered ${body.synced ?? 0}, ${body.withDocument ?? 0} with the signed document.`,
        );
      }
      await load({ quiet: true });
    } catch {
      toast.error("Could not reach DocuSeal.");
    } finally {
      setCheckingWaivers(false);
    }
  };

  /** The roster as a spreadsheet — name, phone, team, waiver, payment. */
  const downloadCsv = () => {
    const headers = [
      "First name",
      "Last name",
      "Phone",
      "Email",
      "Team",
      "Role",
      "Waiver",
      "Paid",
      "Payment note",
    ];
    const csvRows = visible.map((r) => [
      r.firstName,
      r.lastName,
      r.phone ?? "",
      r.email ?? "",
      r.teamName ?? "",
      r.role === "guest" ? "Guest" : "Player",
      r.waiverOk ? "On file" : "Needed",
      r.paid ? "Yes" : "No",
      r.freeEntryVia
        ? `Free via ${r.freeEntryVia}`
        : r.paymentMethod === "cash" && !r.paid
          ? "Bringing cash"
          : "",
    ]);
    const csv = [headers, ...csvRows]
      .map((row) =>
        row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="admin-summary" aria-label="Player totals">
        {(
          [
            ["all", "Registered", data?.totals.signedUp],
            ["accounted", "Paid or waived", data?.totals.paid],
            ["unpaid", "Still unpaid", data?.totals.unpaid],
            ["waiver-missing", "Missing waiver", data?.totals.waiverMissing],
          ] as [PlayerFilter, string, number | undefined][]
        ).map(([key, label, value]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() =>
              setParams({
                filter: key === "all" ? null : key,
                team: null,
                q: null,
              })
            }
          >
            <strong>{loading || error ? "—" : (value ?? "—")}</strong>
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-400">
        Paid and waived/free registrations are financially accounted for.
        Progress is informational.
      </p>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone or team"
              aria-label="Search players"
              className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border-token text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>
          {showTeams && (
            <label className="admin-field">
              <span className="sr-only">Filter by team</span>
              <select
                aria-label="Filter by team"
                value={teamValue}
                onChange={(e) => setTeamValue(e.target.value || null)}
              >
                <option value="">All teams</option>
                <option value="unassigned">Unassigned</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => void load({ quiet: true })}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            onClick={() => void checkWaivers()}
            disabled={checkingWaivers}
            className="p-2 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
            title="Check DocuSeal for signed waivers and documents we haven't recorded yet"
          >
            {checkingWaivers ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FileCheck size={15} />
            )}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
            title="Download this roster as a spreadsheet"
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="btn-primary"
          >
            <UserPlus size={15} />
            Add walk-in
          </button>
        </div>

        <div className="admin-filters" aria-label="Player filters">
          {visibleFilters.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key === "all" ? null : key)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setParams({ q: null, filter: null, team: null })}
          >
            Clear filters
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
          <span>
            {loading
              ? "Loading players…"
              : error
                ? "Player list unavailable"
                : `Showing ${visible.length} of ${rows.length} players`}
          </span>
          <button
            type="button"
            className="admin-link"
            disabled={!visible.length || !!error}
            onClick={() => setMessaging(visible)}
          >
            Preview message to this list
          </button>
        </div>
        {adding && (
          <WalkInForm
            teams={teams}
            tournamentId={tournamentId}
            onDone={async () => {
              setAdding(false);
              await load({ quiet: true });
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {error ? (
          <div className="py-6">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void load()}
            >
              Retry loading players
            </button>
          </div>
        ) : loading ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Loading roster…
          </p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            {rows.length === 0
              ? "Nobody has signed up for this event yet."
              : "Nobody matches that filter."}
          </p>
        ) : (
          <PlayersTable
            rows={visible}
            showTeams={showTeams}
            onOpen={(row) => setSelectedId(row.id)}
          />
        )}

        {selected && !signing && !fixing && !messaging && (
          <PlayerDetail
            key={selected.id}
            row={selected}
            teams={teams}
            eventId={tournamentId}
            showTeams={showTeams}
            busy={busyId === selected.id}
            onClose={() => setSelectedId(null)}
            onTeam={(id) => void changeTeam(selected, id)}
            onStatus={(status) => changeStatus(selected, status)}
            onWaiver={() => setSigning(selected)}
            onDetails={() => setFixing(selected)}
            onMessage={() => setMessaging([selected])}
            onRemove={() => removePlayer(selected)}
            onRecorded={() => void load({ quiet: true })}
          />
        )}
        {selectedId && !selected && !loading && !error && (
          <p role="status" className="text-sm text-zinc-400">
            This player is no longer on this event roster.{" "}
            <button
              type="button"
              className="admin-link"
              onClick={() => setSelectedId(null)}
            >
              Close record
            </button>
          </p>
        )}
        {messaging && (
          <MessagePreview
            rows={messaging}
            eventId={tournamentId}
            initial={filter === "waiver-missing" ? "waiver" : "payment"}
            onClose={() => setMessaging(null)}
          />
        )}
        {signing && (
          <SignWaiverModal
            row={signing}
            onClose={async (changed) => {
              setSigning(null);
              if (changed) await load({ quiet: true });
            }}
          />
        )}

        {fixing && (
          <EmergencyContactModal
            row={fixing}
            onClose={async (changed) => {
              setFixing(null);
              if (changed) await load({ quiet: true });
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * In-person waiver signing (A4 / D8). The player is standing at the field, so
 * the signature happens on this laptop rather than in an email they'll open
 * next week.
 *
 * Two deliberate choices:
 *  - the DocuSeal page is embedded, with an "open in a new tab" escape hatch,
 *    because embedding can be refused and the owner must never be stuck;
 *  - "Done — check" asks DocuSeal directly instead of waiting for the webhook,
 *    so the ✓ appears while the player is still standing there.
 */
function SignWaiverModal({
  row,
  onClose,
}: {
  row: RosterRow;
  onClose: (changed: boolean) => void | Promise<void>;
}) {
  const [waiverType, setWaiverType] = useState<"adult" | "youth">("adult");
  const [session, setSession] = useState<{
    signUrl: string;
    embedSrc: string | null;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [signed, setSigned] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");

  /**
   * The paper escape hatch: a physically-signed waiver is real coverage the
   * system cannot see. This records it as covered WITHOUT a document — the
   * roster will show the quiet "no doc" tag, not a green lie.
   */
  const markSignedOnPaper = async () => {
    if (
      !window.confirm(
        `Mark ${rosterFullName(row) || "this player"} as covered without a signed document in the system? Only do this if you're holding their real signed paper waiver.`,
      )
    ) {
      return;
    }
    setMarking(true);
    setError("");
    try {
      const res = await fetch("/api/admin/override-waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: row.id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not record that.");
        return;
      }
      setSigned(true);
      toast.success(`${rosterFullName(row)} marked as covered.`);
    } catch {
      setError("Could not record that.");
    } finally {
      setMarking(false);
    }
  };

  const start = async () => {
    setStarting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/registrations/${row.id}/sign-waiver`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waiverType }),
        },
      );
      const body = (await res.json()) as {
        signUrl?: string;
        embedSrc?: string | null;
        error?: string;
      };
      if (!res.ok || !body.signUrl) {
        setError(body.error ?? "Could not start the waiver.");
        return;
      }
      setSession({
        signUrl: body.signUrl,
        embedSrc: body.embedSrc ?? body.signUrl,
      });
    } catch {
      setError("Could not start the waiver.");
    } finally {
      setStarting(false);
    }
  };

  const check = async () => {
    setChecking(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/registrations/${row.id}/sign-waiver`);
      const body = (await res.json()) as {
        signed?: boolean;
        reason?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Could not check with DocuSeal.");
        return;
      }
      if (body.signed) {
        setSigned(true);
        toast.success(`${rosterFullName(row)}'s waiver is on file.`);
        return;
      }
      setError(
        body.reason === "not-finished"
          ? "Not signed yet — finish the form, then check again."
          : "No waiver has been started for this player yet.",
      );
    } catch {
      setError("Could not check with DocuSeal.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Sign waiver for ${rosterFullName(row)}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-auto dashboard-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Waiver for {rosterFullName(row) || "this player"}
            </h3>
            <p className="text-xs text-zinc-400">
              {row.waiverOk
                ? "This player is marked as covered, but there is no signed document on file. Signing here replaces the tick with a real one."
                : "Hand them the laptop. They sign here and it counts immediately."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onClose(signed)}
            className="text-zinc-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {signed ? (
          <div className="rounded-lg border border-green-500/40 bg-green-500/10 p-4 space-y-3">
            <p className="inline-flex items-center gap-2 text-sm text-green-400">
              <Check size={16} />
              Signed. The document is on file and good for a year.
            </p>
            <button
              type="button"
              onClick={() => void onClose(true)}
              className="btn-primary"
            >
              Back to the roster
            </button>
          </div>
        ) : !session ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-zinc-300 mb-1">
                Which waiver?
              </label>
              <select
                value={waiverType}
                onChange={(e) =>
                  setWaiverType(e.target.value as "adult" | "youth")
                }
                className="px-3 py-2 bg-surface-2 border border-border-token text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                <option value="adult">Adult (18+)</option>
                <option value="youth">Youth (parent or guardian signs)</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void start()}
              disabled={starting}
              className="btn-primary disabled:opacity-60"
            >
              {starting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <PenLine size={15} />
              )}
              {starting ? "Opening…" : "Start signing"}
            </button>
            <p className="text-xs text-zinc-500 pt-1">
              Signed a paper waiver instead?{" "}
              <button
                type="button"
                onClick={() => void markSignedOnPaper()}
                disabled={marking}
                className="underline underline-offset-2 hover:text-zinc-300 disabled:opacity-50"
              >
                {marking ? "Recording…" : "Mark as covered without a document"}
              </button>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void check()}
                disabled={checking}
                className="btn-primary disabled:opacity-60"
              >
                {checking ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Check size={15} />
                )}
                {checking ? "Checking…" : "Done — check"}
              </button>
              <a
                href={session.signUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                <ExternalLink size={14} />
                Open in a new tab
              </a>
            </div>
            <iframe
              src={session.embedSrc ?? session.signUrl}
              title="Waiver"
              className="w-full h-[60vh] rounded-lg border border-border-token bg-white"
            />
            <p className="text-xs text-zinc-500">
              If the form doesn&apos;t load above, use &ldquo;Open in a new
              tab&rdquo; — then come back here and press &ldquo;Done —
              check&rdquo;.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}

/**
 * Fill in an emergency contact from the Roster.
 *
 * This exists because "who do we call" goes missing silently: a walk-in is
 * added with a name and a phone (D8), and the one-tap returning-player join
 * copies the field from the person's record, writing nothing when that is
 * blank. Both are reasonable at the moment they happen and both leave a
 * player on a pitch with nobody to call.
 *
 * Saves to the person as well as this signup, so it is asked once ever
 * rather than once per event.
 */
function EmergencyContactModal({
  row,
  onClose,
}: {
  row: RosterRow;
  onClose: (changed: boolean) => void | Promise<void>;
}) {
  const [name, setName] = useState(row.emergencyName ?? "");
  const [phone, setPhone] = useState(row.emergencyPhone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/registrations/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emergency_name: name.trim(),
          emergency_phone: phone.trim(),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "That didn't save.");
        return;
      }
      toast.success(`Emergency contact saved for ${rosterFullName(row)}.`);
      await onClose(true);
    } catch {
      setError("That didn't save.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 bg-surface-2 border border-border-token text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Emergency contact for ${rosterFullName(row)}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <form
        onSubmit={save}
        className="w-full max-w-md dashboard-card p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Emergency contact
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              For {rosterFullName(row) || "this player"} — who we call if
              something happens at the field. Saved to them permanently, so
              you&apos;ll never be asked for it again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onClose(false)}
            className="text-zinc-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-zinc-300 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maria Alvarez"
              autoFocus
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-300 mb-1">
              Phone number
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(832) 555-0123"
              type="tel"
              required
              className={inputCls}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !name.trim() || !phone.trim()}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => void onClose(false)}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/** Name + phone, and nothing else — the walk-in is standing right there (D8). */
function WalkInForm({
  tournamentId,
  teams,
  onDone,
  onCancel,
}: {
  tournamentId: string;
  teams: RosterTeam[];
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          teamId: teamId || null,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Could not add this player.");
        return;
      }
      toast.success(`${firstName} added to the roster.`);
      setFirstName("");
      setLastName("");
      setPhone("");
      setTeamId("");
      await onDone();
    } catch {
      toast.error("Could not add this player.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "px-3 py-2 bg-surface-2 border border-border-token text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50";

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-brand/30 bg-brand/5 p-4 space-y-3"
    >
      <p className="text-xs text-zinc-400">
        Name and phone is all we need. Everything else can be filled in later —
        they can sign the waiver from this list once they&apos;re on it.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          autoFocus
          required
          className={inputCls}
        />
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          className={inputCls}
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          type="tel"
          required
          className={inputCls}
        />
        {teams.length > 0 && (
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className={inputCls}
          >
            <option value="">— No team —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary disabled:opacity-60"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <UserPlus size={15} />
          )}
          {saving ? "Adding…" : "Add to roster"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
