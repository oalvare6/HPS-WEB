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
 * There *was* a pay-later link, at the very bottom of `/pay`, underneath the
 * checkout form. An option you have to scroll past a payment form to find is not
 * an option anybody takes.
 *
 * ## What it changes
 *
 * Nothing about money. Choosing cash writes `payment_method='cash'` and leaves
 * `payment_status='pending'`, so the Roster keeps counting the player as owing
 * and the owner collects at the field. What it changes is that the player is
 * *told* their spot is safe, and the owner learns who to expect cash from —
 * which "said nothing and closed the tab" never conveyed.
 *
 * ## Note for whoever renders this on `/pay`
 *
 * This is a client component with no async children, which is what makes it safe
 * next to `PayForm`'s Suspense boundary. Do not give it an awaiting child (an
 * async Server Component such as `WhatsAppCommunityLinkFromSite`) — that is the
 * exact shape that stranded the boundary's fallback and made the Pay button
 * vanish. See `EnrolledPanels.tsx`.
 */
export function PaymentChoice({
  registrationId,
  payToken,
  payHref,
  entryFeeLabel,
  initialMethod = null,
  mode = "both",
  className = "",
  eventKind = "tournament",
}: {
  registrationId: string;
  /** HMAC pay-resume token for this registration — the route's authorization. */
  payToken: string;
  /** Where the card button goes. */
  payHref: string;
  entryFeeLabel: string | null;
  /** `"cash"` when they have already told us. */
  initialMethod?: string | null;
  /** Words only — "match night" reads wrong on a one-off open play night. */
  eventKind?: EventKind;
  /**
   * `"cash-only"` drops the card button, for `/pay` — the Stripe form is
   * already on that screen, and a second route to it would be two buttons that
   * do the same thing sitting inches apart.
   */
  mode?: "both" | "cash-only";
  className?: string;
}) {
  const [method, setMethod] = useState<string | null>(initialMethod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choose = async (next: "cash" | "card") => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/register/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, payToken, method: next }),
      });
      const data = (await res.json()) as { error?: string; method?: string };

      if (!res.ok) {
        setError(data.error || "We couldn't save that. Please try again.");
        setBusy(false);
        return;
      }

      setMethod(data.method ?? next);
      trackRegistrationEvent("registration_payment_method_chosen", {
        registration_id: registrationId,
        method: next,
      });

      // Picking card is a statement of intent, not a payment. Send them
      // straight to checkout so the click means what it looks like it means.
      if (next === "card") {
        window.location.href = payHref;
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
          <CreditCard size={16} />
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
