"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Section } from "@/components/shared/section";
import {
  Loader2,
  Ticket,
  Link as LinkIcon,
  Plus,
  Trash2,
  CreditCard,
  Copy,
  CheckCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/types";
import { useQueryParam } from "@/lib/admin-url-state";
import { useScrollRestoration } from "@/lib/use-scroll-restoration";

type DropInRow = {
  id: string;
  created_at: string;
  amount_cents: number;
  payment_status: "pending" | "paid" | "waived" | "refunded";
  notes: string | null;
  round_id: string | null;
  tournament: { id: string; title: string; slug: string } | null;
  round: { id: string; label: string; round_date: string | null } | null;
  contact: { id: string; first_name: string; last_name: string; email: string; phone: string | null } | null;
  paid_by: { id: string; first_name: string; last_name: string; email: string } | null;
};

type TournamentOption = {
  id: string;
  title: string;
  drop_in_fee_cents: number;
};

type RoundOption = {
  id: string;
  label: string;
  round_date: string | null;
};

function handleAuthLost() {
  if (typeof window !== "undefined") window.location.reload();
}

function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const DROP_IN_STATUSES = ["pending", "paid", "waived", "refunded"] as const;
type DropInStatus = (typeof DROP_IN_STATUSES)[number];

function isDropInStatus(value: string): value is DropInStatus {
  return (DROP_IN_STATUSES as readonly string[]).includes(value);
}

export default function AdminDropInsPage() {
  return (
    <Suspense fallback={null}>
      <AdminDropInsContent />
    </Suspense>
  );
}

function AdminDropInsContent() {
  useScrollRestoration("admin-drop-ins");

  const [rows, setRows] = useState<DropInRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tournamentFilter, setTournamentFilter] = useQueryParam(
    "tournament_id",
    "",
  );
  const [statusParam, setStatusParam] = useQueryParam("status", "");
  const statusFilter: "" | DropInStatus = isDropInStatus(statusParam)
    ? statusParam
    : "";
  const setStatusFilter = (next: string) => {
    setStatusParam(next === "" ? null : next);
  };
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tournamentFilter) params.set("tournament_id", tournamentFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/admin/drop-ins?${params.toString()}`);
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load drop-ins.");
        return;
      }
      setRows(data.drop_ins || []);
    } catch {
      toast.error("Failed to load drop-ins.");
    } finally {
      setLoading(false);
    }
  }, [tournamentFilter, statusFilter]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/tournaments");
        if (res.status === 401) return handleAuthLost();
        const data = await res.json();
        if (!res.ok) return;
        setTournaments(
          (data.tournaments as TournamentOption[])?.map((t) => ({
            id: t.id,
            title: t.title,
            drop_in_fee_cents: t.drop_in_fee_cents ?? 2000,
          })) ?? []
        );
      } catch {
        // ignore
      }
    })();
  }, []);

  const totals = useMemo(() => {
    const paid = rows.filter((r) => r.payment_status === "paid").length;
    const pending = rows.filter((r) => r.payment_status === "pending").length;
    return { paid, pending, total: rows.length };
  }, [rows]);

  return (
    <Section dark className="bg-surface">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1 inline-flex items-center gap-2">
              <Ticket size={26} className="text-brand" />
              Drop-ins
            </h1>
            <p className="text-zinc-400 text-sm">
              Single-night guest plays. Create one, then send the pay link.
            </p>
            <p className="text-zinc-500 text-xs mt-1">
              {totals.total} total · {totals.paid} paid · {totals.pending} pending
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary text-sm inline-flex items-center gap-1.5"
          >
            <Plus size={14} />
            New drop-in
          </button>
        </div>

        <div className="dashboard-card p-4 flex flex-col sm:flex-row gap-3">
          <select
            value={tournamentFilter}
            onChange={(e) => setTournamentFilter(e.target.value)}
            className="px-3 py-2 bg-surface-2 border border-border-token rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand/50 flex-1"
          >
            <option value="">All tournaments</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-surface-2 border border-border-token rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand/50 sm:w-48"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>

        <div className="dashboard-card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-zinc-400 inline-flex items-center justify-center gap-2 w-full">
              <Loader2 size={16} className="animate-spin" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No drop-ins yet. Click &quot;New drop-in&quot; to add one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-token text-left">
                    <th className="px-4 py-3 text-zinc-400 font-medium">Player</th>
                    <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">Tournament</th>
                    <th className="px-4 py-3 text-zinc-400 font-medium hidden lg:table-cell">Round</th>
                    <th className="px-4 py-3 text-zinc-400 font-medium">Amount</th>
                    <th className="px-4 py-3 text-zinc-400 font-medium">Status</th>
                    <th className="px-4 py-3 text-zinc-400 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border-token hover:bg-surface-2/40">
                      <td className="px-4 py-3">
                        <div className="text-white font-medium">
                          {r.contact ? (
                            `${r.contact.first_name} ${r.contact.last_name}`.trim() || r.contact.email
                          ) : (
                            <span className="text-zinc-500">Unknown</span>
                          )}
                        </div>
                        {r.paid_by && (
                          <div className="text-xs text-zinc-500 mt-0.5">
                            paid by {r.paid_by.first_name} {r.paid_by.last_name}
                          </div>
                        )}
                        <div className="text-xs text-zinc-500">{formatDate(r.created_at)}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-300 hidden md:table-cell">
                        {r.tournament?.title ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-300 hidden lg:table-cell">
                        {r.round?.label ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-white font-semibold">
                        {formatMoney(r.amount_cents)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={r.payment_status} />
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        {r.payment_status === "pending" && (
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await fetch(
                                `/api/admin/drop-ins/${r.id}/pay-link`,
                                { method: "POST" }
                              );
                              if (res.status === 401) return handleAuthLost();
                              const data = await res.json();
                              if (!res.ok || !data.url) {
                                toast.error(data.error || "Failed to create pay link.");
                                return;
                              }
                              await navigator.clipboard.writeText(data.url);
                              toast.success("Pay link copied to clipboard.");
                            }}
                            className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-hover"
                            title="Generate Stripe checkout link"
                          >
                            <LinkIcon size={12} />
                            Pay link
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            const next =
                              r.payment_status === "paid" ? "pending" : "paid";
                            const res = await fetch(`/api/admin/drop-ins/${r.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ payment_status: next }),
                            });
                            if (res.status === 401) return handleAuthLost();
                            if (!res.ok) {
                              toast.error("Failed.");
                              return;
                            }
                            fetchRows();
                          }}
                          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
                          title="Toggle paid/pending"
                        >
                          <CreditCard size={12} />
                          {r.payment_status === "paid" ? "Unmark" : "Mark paid"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm("Delete this drop-in?")) return;
                            const res = await fetch(`/api/admin/drop-ins/${r.id}`, {
                              method: "DELETE",
                            });
                            if (res.status === 401) return handleAuthLost();
                            if (!res.ok) {
                              toast.error("Failed.");
                              return;
                            }
                            fetchRows();
                          }}
                          className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <NewDropInModal
          tournaments={tournaments}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchRows();
          }}
        />
      )}
    </Section>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "paid"
      ? "bg-brand/20 text-brand"
      : status === "pending"
        ? "bg-yellow-500/20 text-yellow-400"
        : status === "refunded"
          ? "bg-red-500/20 text-red-400"
          : "bg-zinc-500/20 text-zinc-300";
  const Icon =
    status === "paid"
      ? CheckCircle
      : status === "pending"
        ? Clock
        : Copy;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cls}`}
    >
      <Icon size={12} />
      {status}
    </span>
  );
}

function NewDropInModal({
  tournaments,
  onClose,
  onCreated,
}: {
  tournaments: TournamentOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? "");
  const [rounds, setRounds] = useState<RoundOption[]>([]);
  const [roundId, setRoundId] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState("");
  const [paidByContactId, setPaidByContactId] = useState("");
  const [amountCents, setAmountCents] = useState<number>(
    tournaments[0]?.drop_in_fee_cents ?? 2000
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = tournaments.find((x) => x.id === tournamentId);
    if (t) setAmountCents(t.drop_in_fee_cents);
  }, [tournamentId, tournaments]);

  useEffect(() => {
    if (!tournamentId) {
      setRounds([]);
      return;
    }
    (async () => {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/rounds`);
      if (!res.ok) return;
      const data = await res.json();
      setRounds(data.rounds || []);
    })();
  }, [tournamentId]);

  useEffect(() => {
    if (!contactQuery.trim()) {
      setContactResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const res = await fetch(
        `/api/admin/contacts?q=${encodeURIComponent(contactQuery)}&limit=10`
      );
      if (res.ok) {
        const data = await res.json();
        setContactResults(data.contacts || []);
      }
      setSearching(false);
    }, 200);
    return () => clearTimeout(handle);
  }, [contactQuery]);

  const inputCls =
    "w-full px-3 py-2 bg-surface-2 border border-border-token rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/50";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId) {
      toast.error("Pick a contact for the player.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/drop-ins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_id: tournamentId,
          contact_id: contactId,
          round_id: roundId || null,
          paid_by_contact_id: paidByContactId || null,
          amount_cents: amountCents,
          notes: notes || null,
        }),
      });
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create.");
        return;
      }
      toast.success("Drop-in created.");
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-border-token rounded-lg p-6 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-xl font-bold text-white">New drop-in</h2>

        <label className="block">
          <span className="text-xs text-zinc-400">Tournament</span>
          <select
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
            className={inputCls}
            required
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-zinc-400">Round (optional)</span>
          <select
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            className={inputCls}
          >
            <option value="">No specific round</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
                {r.round_date ? ` — ${r.round_date}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-zinc-400">Player (search contacts)</span>
          <input
            className={inputCls}
            placeholder="Name, email, or phone…"
            value={contactQuery}
            onChange={(e) => setContactQuery(e.target.value)}
          />
        </label>

        {(searching || contactResults.length > 0) && (
          <div className="border border-border-token rounded-md bg-surface-2 divide-y divide-border-token max-h-40 overflow-y-auto">
            {searching && (
              <p className="px-3 py-2 text-xs text-zinc-500">Searching…</p>
            )}
            {contactResults.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setContactId(c.id);
                  setContactQuery(`${c.first_name} ${c.last_name} <${c.email}>`);
                  setContactResults([]);
                }}
                className={`block w-full text-left px-3 py-2 hover:bg-base text-sm ${
                  c.id === contactId ? "bg-brand/10 text-brand" : "text-zinc-200"
                }`}
              >
                {c.first_name} {c.last_name}{" "}
                <span className="text-zinc-500 text-xs">{c.email}</span>
              </button>
            ))}
          </div>
        )}

        <label className="block">
          <span className="text-xs text-zinc-400">Amount (cents)</span>
          <input
            className={inputCls}
            type="number"
            min={0}
            value={amountCents}
            onChange={(e) => setAmountCents(Number(e.target.value))}
          />
          <span className="text-xs text-zinc-500 mt-1 block">
            = {formatMoney(amountCents)}
          </span>
        </label>

        <label className="block">
          <span className="text-xs text-zinc-400">Notes (optional)</span>
          <textarea
            className={inputCls}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <p className="text-xs text-zinc-500">
          Tip: if someone else is paying for this drop-in, create the row, then
          use &quot;Pay link&quot; to copy a Stripe checkout URL and send it.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !contactId}
            className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
