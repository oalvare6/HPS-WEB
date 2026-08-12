"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  X,
  Search,
  UserPlus,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import {
  rosterFullName,
  type RosterPayload,
  type RosterRow,
  type RosterTeam,
  type RosterTotals,
} from "@/lib/admin-roster";

type Filter = "all" | "unpaid" | "waiver-missing" | "no-team";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "unpaid", label: "Still owes money" },
  { id: "waiver-missing", label: "No waiver" },
  { id: "no-team", label: "No team" },
];

/**
 * The owner's daily driver (A3). One row per person playing this event:
 * name · team · waiver · paid. Everything the owner does at the field — change
 * someone's team, mark them paid, add a walk-in — happens in this one screen
 * without opening a second page.
 */
export default function RosterScreen({ tournamentId }: { tournamentId: string }) {
  const [data, setData] = useState<RosterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "unpaid" && r.paid) return false;
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
  }, [rows, search, filter]);

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
            {FILTERS.map((f) => (
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
            busyId={busyId}
            onTogglePaid={togglePaid}
            onChangeTeam={changeTeam}
          />
        )}

        {!loading && rows.length > 0 && (
          <p className="text-xs text-zinc-500">
            Showing {visible.length} of {rows.length}.
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
  const cells: { label: string; value: number | string; tone?: string }[] = [
    { label: "Signed up", value: totals?.signedUp ?? "—" },
    { label: "Paid", value: totals?.paid ?? "—", tone: "text-green-400" },
    {
      label: "Still owes",
      value: totals?.unpaid ?? "—",
      tone: (totals?.unpaid ?? 0) > 0 ? "text-yellow-400" : undefined,
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
        </div>
      ))}
    </div>
  );
}

function RosterTable({
  rows,
  teams,
  busyId,
  onTogglePaid,
  onChangeTeam,
}: {
  rows: RosterRow[];
  teams: RosterTeam[];
  busyId: string | null;
  onTogglePaid: (r: RosterRow) => void;
  onChangeTeam: (r: RosterRow, teamId: string) => void;
}) {
  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-left border-b border-border-token">
            <th className="py-2 pr-3 text-zinc-400 font-medium">Player</th>
            <th className="py-2 px-3 text-zinc-400 font-medium">Team</th>
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

              <td className="py-2.5 px-3">
                <WaiverCell row={r} />
              </td>

              <td className="py-2.5 pl-3 text-right">
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
