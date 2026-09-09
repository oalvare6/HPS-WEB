"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, CreditCard, PenLine, XCircle } from "lucide-react";
import type { ResumeSummary } from "@/lib/resume-routes";

/**
 * The actions a resume session may take, and nothing else. Every button POSTs
 * to /pay/resume/api/* with the HttpOnly session cookie; the browser never
 * holds a registration id or a token.
 */
export function ResumePanel({ summary }: { summary: ResumeSummary }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(Boolean(summary.cancelledAt));
  const [confirmCancel, setConfirmCancel] = useState(false);

  const settled = summary.paymentStatus === "paid" || summary.paymentStatus === "waived";
  const feeLabel = summary.entryFeeCents != null ? `$${(summary.entryFeeCents / 100).toFixed(2)}` : null;

  async function post(path: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  }

  const payNow = async () => {
    setError("");
    setBusy("pay");
    try {
      const { ok, data } = await post("/pay/resume/api/checkout");
      if (!ok || typeof data.url !== "string") {
        setError(typeof data.error === "string" ? data.error : "We couldn't start payment. Please try again.");
        setBusy(null);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Network error. Please try again.");
      setBusy(null);
    }
  };

  const signWaiver = async () => {
    setError("");
    setBusy("waiver");
    try {
      const { ok, data } = await post("/pay/resume/api/waiver");
      if (!ok || typeof data.url !== "string") {
        setError(typeof data.error === "string" ? data.error : "We couldn't open the waiver. Please try again.");
        setBusy(null);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Network error. Please try again.");
      setBusy(null);
    }
  };

  const cancelSpot = async () => {
    setError("");
    setBusy("cancel");
    try {
      const { ok, data } = await post("/pay/resume/api/cancel");
      if (!ok) {
        setError(typeof data.error === "string" ? data.error : "We couldn't cancel that just now.");
        setBusy(null);
        return;
      }
      setCancelled(true);
      setConfirmCancel(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dashboard-card p-6 md:p-8 space-y-6">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Row label="Event" value={summary.eventTitle ?? "—"} />
        <Row label="Team" value={summary.teamName ?? "Not assigned yet"} />
        <Row
          label="Waiver"
          value={summary.waiverSigned ? "Signed" : "Not signed yet"}
          tone={summary.waiverSigned ? "good" : "warn"}
        />
        <Row
          label="Payment"
          value={
            cancelled
              ? "Spot cancelled"
              : settled
                ? "Paid"
                : `${feeLabel ?? "Entry fee"} outstanding${summary.paymentMethod === "cash" ? " — paying cash at the field" : ""}`
          }
          tone={cancelled ? "warn" : settled ? "good" : "warn"}
        />
      </dl>

      {error && (
        <div role="alert" className="flex gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {cancelled ? (
        <p className="text-sm text-zinc-400">
          You&apos;re off the list for this event. Changed your mind?{" "}
          {summary.eventSlug ? (
            <Link href={`/register?tournament=${encodeURIComponent(summary.eventSlug)}`} className="underline underline-offset-2 text-white">
              Sign up again
            </Link>
          ) : (
            <Link href="/events" className="underline underline-offset-2 text-white">See events</Link>
          )}
          .
        </p>
      ) : (
        <div className="space-y-3">
          {!summary.waiverSigned && (
            <button type="button" onClick={signWaiver} disabled={busy !== null} className="btn-primary w-full justify-center">
              <PenLine size={16} />
              {busy === "waiver" ? "Opening waiver…" : "Sign my waiver"}
            </button>
          )}

          {!settled && summary.waiverSigned && (
            <button type="button" onClick={payNow} disabled={busy !== null} className="btn-primary w-full justify-center">
              <CreditCard size={16} />
              {busy === "pay" ? "Opening secure checkout…" : feeLabel ? `Pay ${feeLabel} by card` : "Pay by card"}
            </button>
          )}

          {settled && (
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <CheckCircle2 size={16} /> You&apos;re paid up. See you on the field.
            </p>
          )}

          {!settled && (
            <div className="border-t border-border-token pt-4">
              {confirmCancel ? (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-300">
                    Take you off the list for {summary.eventTitle ?? "this event"}? You can sign up again later.
                  </p>
                  <div className="flex gap-3">
                    <button type="button" onClick={cancelSpot} disabled={busy !== null} className="btn-secondary flex-1 justify-center border-red-500/40 text-red-200">
                      <XCircle size={16} />
                      {busy === "cancel" ? "Cancelling…" : "Yes, cancel my spot"}
                    </button>
                    <button type="button" onClick={() => setConfirmCancel(false)} disabled={busy !== null} className="btn-secondary flex-1 justify-center">
                      Keep my spot
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmCancel(true)} disabled={busy !== null} className="w-full text-sm text-zinc-400 hover:text-red-200 transition-colors">
                  I&apos;m not coming — cancel my spot
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <form method="post" action="/pay/resume/api/sign-out" className="pt-2 border-t border-border-token">
        <button type="submit" className="w-full text-xs text-zinc-500 hover:text-zinc-300 pt-3">
          Done — sign out of this link
        </button>
      </form>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-white";
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={`mt-0.5 font-medium ${color}`}>{value}</dd>
    </div>
  );
}
