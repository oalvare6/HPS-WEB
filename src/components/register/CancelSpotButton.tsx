"use client";

import { useState } from "react";
import { AlertCircle, Loader2, XCircle } from "lucide-react";

/**
 * The way off a roster.
 *
 * There wasn't one. Every `DELETE` in the app is admin-only, `/me` was a
 * read-only table, and both status cards offered payment controls and nothing
 * else — so a player looking at a signup they couldn't honour had no exit and
 * no way to tell the owner except by messaging them. The operator's words:
 * *"let me get out if i havent made payment."*
 *
 * ## Why it is visible
 *
 * It shipped as 11px of grey underlined text at the bottom of the card, on the
 * theory that a cancel of equal weight beside "Pay $15 by card" would offer the
 * two as comparable choices. The operator's next note was that it needed to
 * *"stand out a lot more"* — and he's right about which mistake costs more. A
 * player who quietly closes the tab still occupies a spot: the owner counts
 * them, plans sides around them, and can't give the place to anyone else. An
 * exit nobody finds is the same as no exit.
 *
 * So it is a real button now — full width, red-tinted, with an icon — but still
 * outlined rather than filled, below a divider, and behind a confirm step. It
 * reads as the door marked exit, not as a third way to pay.
 *
 * ## Suspense note
 *
 * A client component with **no async children**, deliberately — same rule as
 * `PaymentChoice`, and for the same reason. It renders on `/register` (inside
 * the status cards) and on `/pay` (inside `PayLaterCard`), and the `/pay` one
 * sits in `PayForm`'s Suspense subtree: an awaiting child there strands the
 * boundary's fallback `<template>` and the Pay button never renders at all.
 * Reproduced on a clean production build — see `EnrolledPanels.tsx`. Do not
 * give this an async server component child.
 */
export function CancelSpotButton({
  registrationId,
  payToken,
  eventTitle,
  className = "",
}: {
  registrationId: string;
  /** HMAC pay-resume token — the route's authorization for signed-out players. */
  payToken: string;
  eventTitle: string;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cancel = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/registrations/${registrationId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payToken }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };

      if (!res.ok) {
        setError(data.error || "We couldn't cancel that. Please try again.");
        setBusy(false);
        return;
      }

      // Reload rather than render "you're cancelled" here. The page resolves
      // state from the server on every load, so it will land on the signup card
      // by itself — and a component that decided for itself what the new state
      // was is exactly how two screens start disagreeing about one player.
      window.location.reload();
    } catch {
      setError("Network error. Check your connection and try again.");
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <div className={`space-y-2 ${className}`}>
        {error && <ErrorLine message={error} />}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 text-sm font-semibold text-red-200 hover:bg-red-500/20 hover:border-red-500/60 transition-colors"
        >
          <XCircle size={16} />
          Can&apos;t make it? Cancel my spot
        </button>
        {/*
          The reason it's worth pressing, said out loud. Most people who drop out
          say nothing, and silence and "I'm coming" look identical on a roster.
        */}
        <p className="text-xs text-zinc-500 text-center">
          Tell us and we&apos;ll free your place up for someone else.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {error && <ErrorLine message={error} />}

      <div className="rounded-lg border border-border-token bg-surface-2/50 p-4 space-y-3">
        <p className="text-sm text-zinc-200">
          Give up your spot for{" "}
          <span className="text-white font-medium">{eventTitle}</span>?
        </p>
        <p className="text-xs text-zinc-400">
          You can sign up again later if there&apos;s still room.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 text-sm font-medium text-red-200 hover:bg-red-500/20 transition-colors disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <XCircle size={14} />
            )}
            {busy ? "Cancelling…" : "Yes, cancel my spot"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="flex-1 h-11 inline-flex items-center justify-center rounded-lg border border-border-token text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-60"
          >
            Keep my spot
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div
      className="flex gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 mb-3"
      role="alert"
    >
      <AlertCircle className="w-5 h-5 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
