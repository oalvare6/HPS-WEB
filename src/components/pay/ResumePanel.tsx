"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Banknote, CheckCircle2, CreditCard, PenLine, XCircle } from "lucide-react";
import { trackRegistrationEvent } from "@/lib/analytics";
import type { ResumeSummary } from "@/lib/resume-routes";

/**
 * The actions a registration-bound session may take, and nothing else. Every
 * button POSTs to /pay/resume/api/* with the HttpOnly session cookie; the
 * browser never holds a registration id or a token.
 *
 * Two kinds of session land here and see the same panel: a magic-link
 * session, and the session minted for the browser that just created the
 * registration (Stage 1.3 — this replaced the confirmation card that used to
 * carry a 90-day token). `notice` only changes the first line.
 */
export type ResumeNotice = "registered" | "signed" | null;

export function ResumePanel({
  summary,
  notice = null,
}: {
  summary: ResumeSummary;
  notice?: ResumeNotice;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(Boolean(summary.cancelledAt));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(summary.paymentMethod);
  const shownTracked = useRef(false);

  const settled = summary.paymentStatus === "paid" || summary.paymentStatus === "waived";
  const payingCash = paymentMethod === "cash" && !settled;
  const feeLabel = summary.entryFeeCents != null ? `$${(summary.entryFeeCents / 100).toFixed(2)}` : null;

  useEffect(() => {
    if (shownTracked.current || settled || cancelled) return;
    shownTracked.current = true;
    trackRegistrationEvent("registration_payment_link_shown", {
      source: "resume_page",
      waiver_on_file: summary.waiverSigned,
      notice: notice ?? undefined,
    });
  }, [settled, cancelled, summary.waiverSigned, notice]);

  async function post(path: string, body: Record<string, unknown> = {}): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  }

  const payNow = async () => {
    setError("");
    setBusy("pay");
    try {
      // Card is a declared intent as well as a payment, so the roster shows it.
      await post("/pay/resume/api/payment-method", { method: "card" });
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

  const payCash = async () => {
    setError("");
    setBusy("cash");
    try {
      const { ok, data } = await post("/pay/resume/api/payment-method", { method: "cash" });
      if (!ok) {
        setError(typeof data.error === "string" ? data.error : "We couldn't save that. Please try again.");
        setBusy(null);
        return;
      }
      setPaymentMethod("cash");
      trackRegistrationEvent("registration_payment_method_chosen", { surface: "resume", method: "cash" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
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
        // A session older than thirty minutes may read and pay but not cancel;
        // the server says so and the player re-verifies through a fresh link.
        setError(
          typeof data.error === "string"
            ? data.error
            : "We couldn't cancel that just now."
        );
        setConfirmCancel(false);
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
      {notice === "registered" && (
        <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-300" aria-hidden />
          <span>
            You&apos;re registered{summary.eventTitle ? ` for ${summary.eventTitle}` : ""}. Your
            waiver is on file — nothing to sign. Last thing: how do you want to pay?
          </span>
        </p>
      )}
      {notice === "signed" && summary.waiverSigned && (
        <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-300" aria-hidden />
          <span>Waiver signed — thank you. Your spot is held; pay now or at the field.</span>
        </p>
      )}

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
                : `${feeLabel ?? "Entry fee"} outstanding${payingCash ? " — paying cash at the field" : ""}`
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
            <>
              <button type="button" onClick={payNow} disabled={busy !== null} className="btn-primary w-full justify-center">
                <CreditCard size={16} />
                {busy === "pay" ? "Opening secure checkout…" : feeLabel ? `Pay ${feeLabel} by card` : "Pay by card"}
              </button>

              {payingCash ? (
                <div className="flex gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                  <Banknote size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-white">Paying {feeLabel ?? "the fee"} at the field</p>
                    <p className="text-xs text-zinc-400">Your spot is saved. Bring it on the night — we&apos;ll mark you off when you hand it over.</p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={payCash}
                  disabled={busy !== null}
                  className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-lg border border-border-token text-sm font-medium text-zinc-200 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-60"
                >
                  <Banknote size={16} />
                  {busy === "cash" ? "Saving…" : "I'll pay cash at the field"}
                </button>
              )}
              <p className="text-xs text-zinc-500 text-center">
                Either way your spot is saved — the waiver is what holds it, not the payment.
              </p>
            </>
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
