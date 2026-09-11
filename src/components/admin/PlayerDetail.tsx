"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminDialog } from "./AdminDialog";
import { ManualPayments } from "./ManualPayments";
import { ReviewSection } from "./ReviewSection";
import { DROP_IN_PAYMENT_STATUSES } from "@/lib/types";
import { paymentLabel } from "./workspace";
import {
  rosterFullName,
  type RosterRow,
  type RosterTeam,
} from "@/lib/admin-roster";

type RecordedPayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
};
export function PlayerDetail({
  row,
  teams,
  eventId,
  busy,
  showTeams,
  onClose,
  onTeam,
  onStatus,
  onWaiver,
  onDetails,
  onMessage,
  onRemove,
  onRecorded,
}: {
  row: RosterRow;
  teams: RosterTeam[];
  eventId: string;
  busy: boolean;
  showTeams: boolean;
  onClose: () => void;
  onTeam: (id: string) => void;
  onStatus: (status: string) => Promise<void>;
  onWaiver: () => void;
  onDetails: () => void;
  onMessage: () => void;
  onRemove: () => Promise<void>;
  /**
   * Refresh the roster after offline money is recorded or voided: a receipt can
   * move the payment status, and the list behind this dialog would otherwise
   * keep showing the old one.
   */
  onRecorded: () => void;
}) {
  const [status, setStatus] = useState(row.paymentStatus);
  const [removing, setRemoving] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState(false);
  const [payments, setPayments] = useState<RecordedPayment[]>([]);
  const [paymentError, setPaymentError] = useState("");
  const [loadingPayments, setLoadingPayments] = useState(true);
  useEffect(() => {
    setStatus(row.paymentStatus);
  }, [row.paymentStatus]);
  useEffect(() => {
    let live = true;
    if (row.role === "guest") {
      setLoadingPayments(false);
      return;
    }
    fetch(
      `/api/admin/registrations?tournament_id=${encodeURIComponent(eventId)}`,
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load recorded card payments.");
        return res.json();
      })
      .then((body) => {
        if (live)
          setPayments(
            body.registrations?.find((r: { id: string }) => r.id === row.id)
              ?.payments ?? [],
          );
      })
      .catch((error) => {
        if (live) setPaymentError(error.message);
      })
      .finally(() => {
        if (live) setLoadingPayments(false);
      });
    return () => {
      live = false;
    };
  }, [row.id, row.role, eventId]);
  return (
    <AdminDialog
      title={rosterFullName(row)}
      description={
        row.role === "guest"
          ? "Event guest"
          : row.cancelledAt
            ? "Cancelled registration"
            : "Registered player"
      }
      onClose={onClose}
      dismissDisabled={busy}
      widthClass="md:max-w-2xl"
      footer={
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={onClose}
        >
          Back to players
        </button>
      }
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-zinc-400 text-xs">Phone</dt>
            <dd>{row.phone || "Not on file"}</dd>
          </div>
          <div>
            <dt className="text-zinc-400 text-xs">Email</dt>
            <dd className="break-all">{row.email || "Not on file"}</dd>
          </div>
        </dl>
        <Link
          className="admin-link text-sm"
          href={`/admin/contacts?q=${encodeURIComponent(row.email || row.phone || rosterFullName(row))}`}
        >
          Find this player in People
        </Link>
        {row.cancelledAt && (
          <p className="border-l-2 border-zinc-500 pl-3 text-sm text-zinc-300">
            This spot was cancelled on{" "}
            {new Date(row.cancelledAt).toLocaleDateString("en-US")}. It is shown
            here only because it is flagged for review; it is not on the roster.
          </p>
        )}
        {row.review && (
          <ReviewSection
            registrationId={row.id}
            review={row.review}
            busy={busy}
            onResolved={onRecorded}
          />
        )}
        {showTeams && row.role === "player" && !row.cancelledAt && (
          <label className="admin-field">
            Team
            <select
              aria-label={`Team for ${rosterFullName(row)}`}
              value={row.teamId ?? ""}
              disabled={busy}
              onChange={(e) => onTeam(e.target.value)}
            >
              <option value="">Unassigned</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-400">
              Team changes save immediately.
            </span>
          </label>
        )}
        <section className="border-t border-border-token pt-4">
          <div className="admin-section-heading">
            <h2>Waiver</h2>
            <span
              className={
                row.waiverOk
                  ? "text-green-400 text-sm"
                  : "text-amber-200 text-sm"
              }
            >
              {row.waiverOk ? "Complete" : "Needed"}
            </span>
          </div>
          {row.waiverOk && (
            <p className="text-sm text-zinc-400">
              {row.waiverExpiresAt
                ? `Valid through ${new Date(row.waiverExpiresAt).toLocaleDateString("en-US")}. `
                : "Coverage recorded. "}
              {row.waiverEvidence !== "document"
                ? "No document link is on file."
                : "Document on file."}
            </p>
          )}
          {row.role === "player" && (
            <button
              type="button"
              className="admin-link text-sm mt-2"
              onClick={onWaiver}
            >
              {row.waiverOk ? "Open waiver actions" : "Sign waiver now"}
            </button>
          )}
        </section>
        <section className="border-t border-border-token pt-4 space-y-3">
          <h2>Payment</h2>
          <p className="text-sm">
            {row.paid
              ? "Financially accounted for"
              : "Not financially accounted for"}
            <span className="text-zinc-400">
              {" "}
              · {paymentLabel(row.paymentStatus)}
            </span>
          </p>
          <p className="text-xs text-zinc-400">
            Declared method: {row.paymentMethod || "Not specified"}. A declared
            method is not proof of receipt.
          </p>
          <div className="flex items-end gap-3">
            <label className="admin-field flex-1">
              Recorded status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={busy}
              >
                {(row.role === "guest"
                  ? DROP_IN_PAYMENT_STATUSES
                  : ["pending", "paid", "partial", "waived", "refunded"]
                ).map((s) => (
                  <option key={s} value={s}>
                    {paymentLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || status === row.paymentStatus}
              className="btn-secondary disabled:opacity-40"
              onClick={() => void onStatus(status)}
            >
              {busy ? "Saving…" : "Save status"}
            </button>
          </div>
          <p className="text-xs text-zinc-400">
            Changes only the registration status. It does not charge or refund a
            card, or record a received amount.
          </p>
          <details>
            <summary className="text-xs cursor-pointer text-zinc-400">
              Recorded card payments
            </summary>
            <div className="text-sm pt-2 space-y-2">
              {loadingPayments ? (
                "Loading payment records…"
              ) : paymentError ? (
                <p role="alert">{paymentError}</p>
              ) : payments.length === 0 ? (
                "No card payments linked to this registration."
              ) : (
                payments.map((p) => (
                  <p key={p.id}>
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: p.currency || "USD",
                    }).format(p.amount)}{" "}
                    · {p.status} ·{" "}
                    {new Date(p.created_at).toLocaleDateString("en-US")}
                  </p>
                ))
              )}
            </div>
          </details>
          {row.role !== "guest" && (
            <ManualPayments
              registrationId={row.id}
              busy={busy}
              open={receiptPreview}
              onToggle={() => setReceiptPreview((v) => !v)}
              onRecorded={onRecorded}
            />
          )}
        </section>
        <section className="border-t border-border-token pt-4">
          <h2>Player details</h2>
          <p className="text-sm text-zinc-400 mt-2">
            Emergency contact:{" "}
            {row.emergencyName
              ? `${row.emergencyName} · ${row.emergencyPhone || "No phone"}`
              : "Not on file"}
          </p>
          {row.missing.length > 0 && (
            <p className="text-xs text-zinc-400 mt-1">
              Missing: {row.missing.join(", ")}
            </p>
          )}
          {row.role === "player" && (
            <button
              className="admin-link text-sm mt-2"
              type="button"
              onClick={onDetails}
            >
              Edit emergency contact
            </button>
          )}
        </section>
        <button type="button" onClick={onMessage} className="btn-secondary">
          Preview message
        </button>
        {row.role === "player" && !row.cancelledAt && (
          <div className="border-t border-border-token pt-4">
            {removing ? (
              <div className="space-y-3">
                <p className="text-sm">
                  Remove this player from this event? Their registration history
                  is retained. This does not refund a payment.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn-secondary text-red-300"
                    disabled={busy}
                    onClick={() => void onRemove()}
                  >
                    Confirm removal
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRemoving(false)}
                  >
                    Keep player
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-red-300"
                onClick={() => setRemoving(true)}
              >
                Remove from event roster
              </button>
            )}
          </div>
        )}
      </div>
    </AdminDialog>
  );
}
