"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MANUAL_PAYMENT_METHODS,
  centsToAmount,
  liveTotalCents,
  manualPaymentMethodLabel,
  type ManualPaymentRow,
  type ManualPaymentsPayload,
} from "@/lib/manual-payments";

/**
 * Cash and Zelle, recorded for real (Stage 2.3 item A).
 *
 * This replaces the Stage 2.1 prototype that collected a method and an amount
 * and saved nothing. The layout is deliberately the same shape as the prototype
 * it stands in for — this is an integration change, not a redesign.
 *
 * Two things it will not do, both on purpose:
 *
 *   * It never edits a receipt. A correction is a void plus a new receipt, so
 *     the list is a history rather than a current opinion.
 *   * It never claims to have changed the payment status. The server decides
 *     that — Stripe and the owner's own 'waived'/'refunded' decisions outrank
 *     a cash receipt — so the response is reported rather than assumed.
 */
export function ManualPayments({
  registrationId,
  busy,
  open,
  onToggle,
  onRecorded,
}: {
  registrationId: string;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  /** Lets the roster refresh, since a receipt can move the payment status. */
  onRecorded: () => void;
}) {
  const [receipts, setReceipts] = useState<ManualPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const [method, setMethod] = useState<string>("cash");
  const [amount, setAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [recordedBy, setRecordedBy] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/manual-payments`);
      if (!res.ok) throw new Error("Could not load recorded payments.");
      const body = (await res.json()) as ManualPaymentsPayload;
      setReceipts(body.receipts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recorded payments.");
    } finally {
      setLoading(false);
    }
  }, [registrationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Default the date to today, so the common case is one tap. The field stays
  // editable because money is often entered the morning after it was taken.
  useEffect(() => {
    if (open && !receivedAt) {
      setReceivedAt(new Date().toISOString().slice(0, 10));
    }
  }, [open, receivedAt]);

  const total = liveTotalCents(receipts);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/manual-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          method,
          received_at: receivedAt,
          recorded_by: recordedBy,
          note,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        payment_status?: string;
        needs_review?: boolean;
        status_unchanged?: boolean;
      };
      if (!res.ok) throw new Error(body.error || "Could not record that payment.");

      setAmount("");
      setNote("");
      // Report what the server actually did, including when it declined to move
      // the status — silence there would read as "nothing happened".
      setNotice(
        body.needs_review
          ? `Recorded. This player is now flagged for review — the status stayed ${body.payment_status}.`
          : body.status_unchanged
            ? `Recorded. The payment status stayed ${body.payment_status}.`
            : `Recorded. Payment status is now ${body.payment_status}.`
      );
      await load();
      onRecorded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that payment.");
    } finally {
      setSaving(false);
    }
  }

  async function voidReceipt(receipt: ManualPaymentRow) {
    const who = window.prompt("Who is voiding this receipt?");
    if (!who?.trim()) return;
    const reason = window.prompt("Why? (optional)") ?? "";
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(
        `/api/admin/registrations/${registrationId}/manual-payments/${receipt.id}/void`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voided_by: who, reason }),
        }
      );
      const body = (await res.json()) as { error?: string; payment_status?: string };
      if (!res.ok) throw new Error(body.error || "Could not void that receipt.");
      setNotice(`Voided. Payment status is now ${body.payment_status}.`);
      await load();
      onRecorded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not void that receipt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className="admin-link text-xs" onClick={onToggle}>
        {open ? "Hide" : "Record"} cash / Zelle payment
        {total > 0 ? ` · $${centsToAmount(total)} recorded` : ""}
      </button>

      {open && (
        <div className="border border-border-token p-3 space-y-4">
          {loading ? (
            <p className="text-xs text-zinc-400">Loading recorded payments…</p>
          ) : receipts.length > 0 ? (
            <ul className="space-y-1 text-xs">
              {receipts.map((r) => (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-baseline gap-x-2 ${r.voided_at ? "text-zinc-500 line-through" : ""}`}
                >
                  <span className="font-medium">${centsToAmount(r.amount_cents)}</span>
                  <span>{manualPaymentMethodLabel(r.method)}</span>
                  <span className="text-zinc-400">{r.received_at}</span>
                  <span className="text-zinc-400">· {r.recorded_by}</span>
                  {r.note && <span className="text-zinc-400">· {r.note}</span>}
                  {r.voided_at ? (
                    <span className="no-underline text-zinc-500">
                      (voided by {r.voided_by}
                      {r.void_reason ? `: ${r.void_reason}` : ""})
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="admin-link"
                      disabled={saving || busy}
                      onClick={() => void voidReceipt(r)}
                    >
                      Void
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-400">No cash or Zelle payments recorded yet.</p>
          )}

          <form className="space-y-3" onSubmit={submit}>
            <label className="admin-field">
              Method
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {MANUAL_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {manualPaymentMethodLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              Amount received (USD)
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="admin-field">
              Date received
              <input
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                required
              />
            </label>
            <label className="admin-field">
              Taken by
              <input
                type="text"
                placeholder="Who accepted it"
                value={recordedBy}
                onChange={(e) => setRecordedBy(e.target.value)}
                required
              />
            </label>
            <label className="admin-field">
              Note (optional)
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button type="submit" className="btn-primary text-sm" disabled={saving || busy}>
              {saving ? "Recording…" : "Record payment"}
            </button>
          </form>

          {notice && <p className="text-xs">{notice}</p>}
          {error && (
            <p className="text-xs text-red-400" role="alert">
              {error}
            </p>
          )}
          <p className="text-xs text-zinc-400">
            Card payments are handled by Stripe and are listed separately above.
            A receipt here is never edited — to correct one, void it and record a
            new one.
          </p>
        </div>
      )}
    </div>
  );
}
