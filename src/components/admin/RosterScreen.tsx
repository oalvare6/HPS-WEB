"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Banknote,
  Check,
  X,
  Search,
  UserPlus,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  PenLine,
  ExternalLink,
} from "lucide-react";
import {
  progressByTeam,
  rosterFullName,
  type RosterPayload,
  type RosterRow,
  type RosterTeam,
  type RosterTotals,
  type TeamProgress,
} from "@/lib/admin-roster";
import { showsCashPending } from "@/lib/payment-method";

type Filter = "all" | "unpaid" | "paying-cash" | "waiver-missing" | "no-team";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "unpaid", label: "Still owes money" },
  // The collection list for match night: everyone who told us they'd bring it.
  { id: "paying-cash", label: "Paying cash" },
  { id: "waiver-missing", label: "No waiver" },
  { id: "no-team", label: "No team" },
];

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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [signing, setSigning] = useState<RosterRow | null>(null);
  /** `undefined` = no team filter; `null` = the unassigned bucket. */
  const [teamFilter, setTeamFilter] = useState<string | null | undefined>(undefined);

  const load = useCallback(
    async (opts: { quiet?: boolean } = {}) => {
      if (!opts.quiet) setLoading(true);
      try {
        const res = await fetch(`/api/admin/tournaments/${tournamentId}/roster`);
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
    [tournamentId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Memoized so the `??[]` fallbacks don't hand `visible` a new array identity
  // on every render.
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const teams = useMemo(() => data?.teams ?? [], [data]);

  const teamProgress = useMemo(
    () => progressByTeam(rows, teams),
    [rows, teams]
  );

  const visibleFilters = useMemo(
    () => (showTeams ? FILTERS : FILTERS.filter((f) => f.id !== "no-team")),
    [showTeams]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (teamFilter !== undefined) {
        // Guests belong to no team, so they never survive a team filter —
        // matching how progressByTeam counts them.
        if (r.role === "guest") return false;
        if ((r.teamId ?? null) !== teamFilter) return false;
      }
      if (filter === "unpaid" && r.paid) return false;
      if (
        filter === "paying-cash" &&
        !showsCashPending(r.paymentMethod, r.paymentStatus)
      ) {
        return false;
      }
      if (filter === "waiver-missing" && r.waiverOk) return false;
      if (filter === "no-team" && (r.teamId || r.role === "guest")) return false;
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
    optimistic: (r: RosterRow) => RosterRow
  ) => {
    setBusyId(row.id);
    setData((prev) =>
      prev
        ? { ...prev, rows: prev.rows.map((r) => (r.id === row.id ? optimistic(r) : r)) }
        : prev
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

  const togglePaid = (row: RosterRow) =>
    patchRow(
      row,
      { payment_status: row.paid ? "pending" : "paid" },
      (r) => ({ ...r, paid: !row.paid, paymentStatus: row.paid ? "pending" : "paid" })
    );

  const changeTeam = (row: RosterRow, teamId: string) => {
    const team = teams.find((t) => t.id === teamId) ?? null;
    return patchRow(row, { team_id: teamId || null }, (r) => ({
      ...r,
      teamId: teamId || null,
      teamName: team?.name ?? null,
      teamColor: team?.color ?? null,
    }));
  };

  return (
    <div className="space-y-4">
      <TotalsBar totals={data?.totals} loading={loading} />

      {showTeams && !loading && teamProgress.length > 0 && (
        <TeamProgressPanel
          progress={teamProgress}
          selected={teamFilter}
          onSelect={(id) =>
            setTeamFilter((prev) => (prev === id ? undefined : id))
          }
        />
      )}

      <div className="dashboard-card p-4 space-y-4">
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
              className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border-token text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>
          <div className="flex flex-wrap gap-1 bg-surface-2 rounded-lg p-1">
            {visibleFilters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  filter === f.id
                    ? "bg-base text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
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
            onClick={() => setAdding((v) => !v)}
            className="btn-primary"
          >
            <UserPlus size={15} />
            Add walk-in
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

        {loading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading roster…</p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            {rows.length === 0
              ? "Nobody has signed up for this event yet."
              : "Nobody matches that filter."}
          </p>
        ) : (
          <RosterTable
            rows={visible}
            teams={teams}
            showTeams={showTeams}
            busyId={busyId}
            onTogglePaid={togglePaid}
            onChangeTeam={changeTeam}
            onSignWaiver={setSigning}
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

        {!loading && rows.length > 0 && (
          <p className="text-xs text-zinc-500">
            Showing {visible.length} of {rows.length}
            {teamFilter !== undefined && (
              <>
                {" "}
                ·{" "}
                <button
                  type="button"
                  onClick={() => setTeamFilter(undefined)}
                  className="underline underline-offset-2 hover:text-zinc-300"
                >
                  clear team filter
                </button>
              </>
            )}
            .
          </p>
        )}
      </div>
    </div>
  );
}

function TotalsBar({
  totals,
  loading,
}: {
  totals: RosterTotals | undefined;
  loading: boolean;
}) {
  const cells: {
    label: string;
    value: number | string;
    tone?: string;
    hint?: string;
  }[] = [
    { label: "Signed up", value: totals?.signedUp ?? "—" },
    { label: "Paid", value: totals?.paid ?? "—", tone: "text-green-400" },
    {
      label: "Still owes",
      value: totals?.unpaid ?? "—",
      tone: (totals?.unpaid ?? 0) > 0 ? "text-yellow-400" : undefined,
      /*
        Deliberately a sub-line under "Still owes" rather than a sixth number.
        Cash-expected is a *subset* of what is outstanding, and a card of its own
        would read as a separate bucket to add up — which is how a total that
        does not tally gets in front of somebody at the field.
      */
      hint:
        (totals?.payingCash ?? 0) > 0
          ? `${totals!.payingCash} bringing cash`
          : undefined,
    },
    {
      label: "Waiver on file",
      value: totals?.waiverOnFile ?? "—",
      tone: (totals?.waiverMissing ?? 0) > 0 ? "text-yellow-400" : "text-green-400",
    },
    { label: "No team", value: totals?.unassigned ?? "—" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cells.map((c) => (
        <div key={c.label} className="dashboard-card p-4">
          <p className="data-label">{c.label}</p>
          <p
            className={`text-2xl font-bold ${c.tone ?? "text-white"} ${
              loading ? "opacity-40" : ""
            }`}
          >
            {c.value}
          </p>
          {c.hint && (
            <p
              className={`text-[11px] text-amber-300/80 mt-0.5 ${
                loading ? "opacity-40" : ""
              }`}
            >
              {c.hint}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Payment progress per team — the pay-later view.
 *
 * Players sign up now and pay over the following weeks, so the question that
 * matters between signup and match day is "how far along is each team", not
 * "how many people paid in total". Deliberately reports; it does not enforce.
 * Nothing here blocks a player or a team, because being locked out on the day
 * over a payment deadline is a worse failure than chasing someone by text.
 */
function TeamProgressPanel({
  progress,
  selected,
  onSelect,
}: {
  progress: TeamProgress[];
  selected: string | null | undefined;
  onSelect: (teamId: string | null) => void;
}) {
  return (
    <div className="dashboard-card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">By team</h3>
        <p className="text-xs text-zinc-500">Tap a team to filter the list</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {progress.map((p) => {
          const isSelected = selected === p.teamId;
          const done = p.players > 0 && p.unpaid === 0;
          return (
            <button
              key={p.teamId ?? "__unassigned"}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(p.teamId)}
              className={`text-left rounded-lg border p-3 transition-colors ${
                isSelected
                  ? "border-brand bg-brand/10"
                  : "border-border-token bg-surface-2 hover:border-zinc-600"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`text-sm font-medium truncate ${
                    p.teamId === null ? "text-yellow-400" : "text-white"
                  }`}
                >
                  {p.teamName}
                </span>
                <span
                  className={`text-xs font-mono shrink-0 ${
                    done ? "text-green-400" : "text-zinc-400"
                  }`}
                >
                  {p.paid}/{p.players} paid
                </span>
              </div>

              <div
                className="mt-2 h-1.5 rounded-full bg-base overflow-hidden"
                role="progressbar"
                aria-valuenow={p.paidPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${p.teamName} payment progress`}
              >
                <div
                  className={`h-full rounded-full transition-all ${
                    done ? "bg-green-500" : "bg-brand"
                  }`}
                  style={{ width: `${p.paidPercent}%` }}
                />
              </div>

              <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-zinc-500">
                <span>{p.paidPercent}%</span>
                {p.unpaid > 0 && (
                  <span className="text-yellow-400">{p.unpaid} still owes</span>
                )}
                {p.waiverMissing > 0 && (
                  <span className="text-red-400">
                    {p.waiverMissing} no waiver
                  </span>
                )}
                {p.players === 0 && <span>nobody yet</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RosterTable({
  rows,
  teams,
  showTeams,
  busyId,
  onTogglePaid,
  onChangeTeam,
  onSignWaiver,
}: {
  rows: RosterRow[];
  teams: RosterTeam[];
  showTeams: boolean;
  busyId: string | null;
  onTogglePaid: (r: RosterRow) => void;
  onChangeTeam: (r: RosterRow, teamId: string) => void;
  onSignWaiver: (r: RosterRow) => void;
}) {
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className={`w-full text-sm ${showTeams ? "min-w-[640px]" : "min-w-[480px]"}`}>
        <thead>
          <tr className="text-left border-b border-border-token">
            <th className="py-2 pr-3 text-zinc-400 font-medium">Player</th>
            {showTeams && (
              <th className="py-2 px-3 text-zinc-400 font-medium">Team</th>
            )}
            <th className="py-2 px-3 text-zinc-400 font-medium">Waiver</th>
            <th className="py-2 pl-3 text-zinc-400 font-medium text-right">Paid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-border-token/50 last:border-0"
            >
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium">
                    {rosterFullName(r) || "(no name)"}
                  </span>
                  {r.role === "guest" && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-2 text-zinc-400 border border-border-token">
                      Guest
                    </span>
                  )}
                  {r.needsReview && (
                    <span
                      title="Email and phone point at different people — check this one."
                      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400"
                    >
                      <AlertTriangle size={10} />
                      Check
                    </span>
                  )}
                  {r.incomplete && (
                    <span
                      title="Missing an emergency contact or a real date of birth. Walk-ins start this way; older signups can be missing them too."
                      className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-2 text-zinc-400 border border-dashed border-border-token"
                    >
                      Needs details
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500">
                  {r.phone || r.email || "—"}
                </div>
              </td>

              {showTeams && (
                <td className="py-2.5 px-3">
                  {r.role === "guest" ? (
                    <span className="text-zinc-500">—</span>
                  ) : teams.length === 0 ? (
                    <span className="text-zinc-500 text-xs">No teams yet</span>
                  ) : (
                    <select
                      value={r.teamId ?? ""}
                      disabled={busyId === r.id}
                      onChange={(e) => onChangeTeam(r, e.target.value)}
                      className="px-2 py-1 bg-surface-2 border border-border-token text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:opacity-50"
                    >
                      <option value="">— No team —</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              )}

              <td className="py-2.5 px-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <WaiverCell row={r} />
                  {r.role === "player" && r.waiverEvidence !== "document" && (
                    <button
                      type="button"
                      onClick={() => onSignWaiver(r)}
                      title={
                        r.waiverOk
                          ? "Replace this with a real signed document"
                          : "Sign the waiver here, now, on this laptop"
                      }
                      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-brand/40 text-brand hover:bg-brand/10 transition-colors"
                    >
                      <PenLine size={11} />
                      Sign now
                    </button>
                  )}
                </div>
              </td>

              <td className="py-2.5 pl-3 text-right">
                <div className="inline-flex items-center gap-1.5">
                  {/*
                    The chip only ever appears beside "Unpaid" — `showsCashPending`
                    drops it the moment the money lands, so nobody gets asked for
                    cash they have already handed over. Marking them paid is the
                    override; there is no second control to learn.
                  */}
                  {showsCashPending(r.paymentMethod, r.paymentStatus) && (
                    <span
                      title="This player said they're bringing cash to the field"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    >
                      <Banknote size={11} />
                      Cash
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => onTogglePaid(r)}
                    title={r.paid ? "Mark as not paid" : "Mark as paid"}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                      r.paid
                        ? "bg-green-500/15 text-green-400 hover:bg-green-500/25"
                        : "bg-surface-2 text-zinc-400 border border-border-token hover:text-white"
                    }`}
                  >
                    {busyId === r.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : r.paid ? (
                      <Check size={12} />
                    ) : (
                      <X size={12} />
                    )}
                    {r.paid ? "Paid" : "Unpaid"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WaiverCell({ row }: { row: RosterRow }) {
  if (!row.waiverOk) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
        <X size={12} className="text-red-400" />
        Missing
      </span>
    );
  }
  if (row.waiverEvidence === "override") {
    return (
      <span
        title="Marked signed by an admin. There is no signed document on file."
        className="inline-flex items-center gap-1.5 text-xs text-yellow-400"
      >
        <ShieldAlert size={12} />
        Override
      </span>
    );
  }
  const expires = row.waiverExpiresAt
    ? new Date(row.waiverExpiresAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  return (
    <span
      title={expires ? `Good through ${expires}` : undefined}
      className="inline-flex items-center gap-1.5 text-xs text-green-400"
    >
      <Check size={12} />
      {expires ? `to ${expires}` : "On file"}
    </span>
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
  const [error, setError] = useState("");

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
        }
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
      setSession({ signUrl: body.signUrl, embedSrc: body.embedSrc ?? body.signUrl });
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
          : "No waiver has been started for this player yet."
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
        body: JSON.stringify({ firstName, lastName, phone, teamId: teamId || null }),
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
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
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
