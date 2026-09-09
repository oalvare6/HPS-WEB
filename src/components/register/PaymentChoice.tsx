"use client";

import { useState } from "react";
import { AlertCircle, Banknote, CreditCard, Loader2 } from "lucide-react";
import { trackRegistrationEvent } from "@/lib/analytics";
import type { EventKind } from "@/lib/types";

/**
 * Card or cash — the two ways this business actually gets paid, offered as two
 * buttons of equal weight.
 *
 * ## Why this is a component and not a line of copy
 *
 * Every signup path used to end on a Stripe form. The operator's report was
 * blunt: *"it only says pay eighty."* A player who wasn't paying that day had no
 * offered exit, so they closed the tab — and could not tell whether they had a
 * spot. Their registration row existed the whole time. The system knew; the
 * player didn't.
 *
 * ## What it changes
 *
 * Nothing about money. Choosing cash writes `payment_method='cash'` and leaves
 * `payment_status='pending'`, so the Roster keeps counting the player as owing
 * and the owner collects at the field. What it changes is that the player is
 * *told* their spot is safe, and the owner learns who to expect cash from.
 *
 * ## Where it posts (Stage 1.3)
 *
 * There is no token in the browser any more. `surface` picks the routes:
 *   account — `/api/registrations/<id>/…`, authorised by the Supabase session
 *             (the `/register` status cards);
 *   resume  — `/pay/resume/api/…`, authorised by the HttpOnly session cookie
 *             (the `/pay/resume` page).
 * Picking card declares the method, then starts checkout and follows Stripe's
 * URL, so the click means what it looks like it means.
 */
export type PaymentChoiceSurface =
  | { kind: "account"; registrationId: string }
  | { kind: "resume" };

export function PaymentChoice({
  surface,
  entryFeeLabel,
  initialMethod = null,
  mode = "both",
  className = "",
  eventKind = "tournament",
}: {
  surface: PaymentChoiceSurface;
  entryFeeLabel: string | null;
  /** `"cash"` when they have already told us. */
  initialMethod?: string | null;
  /** Words only — "match night" reads wrong on a one-off open play night. */
  eventKind?: EventKind;
  /**
   * `"cash-only"` drops the card button where a card button already sits
   * inches away.
   */
  mode?: "both" | "cash-only";
  className?: string;
}) {
  const [method, setMethod] = useState<string | null>(initialMethod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const base =
    surface.kind === "resume"
      ? "/pay/resume/api"
      : `/api/registrations/${encodeURIComponent(surface.registrationId)}`;

  const choose = async (next: "cash" | "card") => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${base}/payment-method`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: next }),
      });
      const data = (await res.json()) as { error?: string; method?: string };

      if (!res.ok) {
        setError(data.error || "We couldn't save that. Please try again.");
        setBusy(false);
        return;
      }

      setMethod(data.method ?? next);
      trackRegistrationEvent("registration_payment_method_chosen", {
        surface: surface.kind,
        method: next,
      });

      // Picking card is a statement of intent, not a payment. Start checkout
      // and go straight to Stripe.
      if (next === "card") {
        const checkout = await fetch(`${base}/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const payload = (await checkout.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!checkout.ok || typeof payload.url !== "string") {
          setError(payload.error || "We couldn't start payment. Please try again.");
          setBusy(false);
          return;
        }
        window.location.assign(payload.url);
        return;
      }
      setBusy(false);
    } catch {
      setError("Network error. Check your connection and try again.");
      setBusy(false);
    }
  };

  const feeText =
    entryFeeLabel ??
    (eventKind === "open_play" ? "the door price" : "your entry fee");

  if (method === "cash") {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <Banknote size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-white">
              Paying {feeText} at the field
            </p>
            <p className="text-xs text-zinc-400">
              Your spot is saved. Bring it{" "}
              {eventKind === "open_play" ? "on the night" : "on your first match night"}
              {" "}— we&apos;ll mark you off when you hand it over.
            </p>
          </div>
        </div>

        {error && <ErrorLine message={error} />}

        <button
          type="button"
          onClick={() => choose("card")}
          disabled={busy}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-border-token text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-60"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CreditCard size={14} />
          )}
          Changed my mind — pay by card
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {error && <ErrorLine message={error} />}

      {mode === "both" && (
        <button
          type="button"
          onClick={() => choose("card")}
          disabled={busy}
          className="btn-primary w-full h-12 inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
          Pay {entryFeeLabel ? `${entryFeeLabel} ` : ""}by card
        </button>
      )}

      {/*
        Deliberately a real button, not a caption. This used to be 11px of grey
        text under the pay button — present, and invisible.
      */}
      <button
        type="button"
        onClick={() => choose("cash")}
        disabled={busy}
        className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-lg border border-border-token text-sm font-medium text-zinc-200 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Banknote size={16} />
        )}
        I&apos;ll pay cash at the field
      </button>

      {mode === "both" && (
        <p className="text-xs text-zinc-500 text-center">
          Either way your spot is saved — the waiver is what holds it, not the
          payment.
        </p>
      )}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div
      className="flex gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
      role="alert"
    >
      <AlertCircle className="w-5 h-5 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
