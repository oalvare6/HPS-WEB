"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ReviewReason, ReviewView } from "@/lib/admin-review";
import { RESOLUTION_MAX_LENGTH } from "@/lib/admin-review";

/**
 * Stage 2.3 D — the review block in Player Detail.
 *
 * Answers the three questions the owner could not answer before: why is this
 * player flagged (the sentence the writer left, and what is unsafe right now),
 * what do I do (one action per reason, in his words), and has it been dealt
 * with (every past resolution, with its date). The Resolve button posts to
 * /api/admin/registrations/[id]/review; the server runs the same live check
 * again and refuses while something still needs doing, unless the owner
 * confirms in so many words that he handled it and says what he did.
 *
 * Same conventions as ManualPayments: plain fetch, an inline notice that
 * repeats what the server actually did, 44px targets in the bottom sheet.
 */

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function ReasonList({ items, tone }: { items: ReviewReason[]; tone: "amber" | "muted" }) {
  return (
    <ul className="space-y-2">
      {items.map((r, i) => (
        <li key={`${r.code}-${i}`} className="text-sm">
          <p className={tone === "amber" ? "text-amber-100" : "text-zinc-300"}>{r.text}</p>
          <p className="text-xs text-zinc-400">What to do: {r.action}</p>
        </li>
      ))}
    </ul>
  );
}

export function ReviewSection({
  registrationId,
  review,
  busy,
  onResolved,
}: {
  registrationId: string;
  review: ReviewView;
  busy: boolean;
  /** Refresh the roster: the flag, the filter and the badge all change. */
  onResolved: () => void;
}) {
  const [note, setNote] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stillUnsafe, setStillUnsafe] = useState<ReviewReason[]>([]);
  const [notice, setNotice] = useState("");

  const live = stillUnsafe.length > 0 ? stillUnsafe : review.live;
  const mustExplain = live.length > 0;

  async function resolve() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution: note, acknowledge }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        live?: ReviewReason[];
      };
      if (!res.ok) {
        if (body.code === "still_unsafe" || body.code === "note_required") {
          setStillUnsafe(body.live ?? []);
        }
        throw new Error(body.error || "Could not resolve this review.");
      }
      setNotice("Resolved. The flag is cleared; the explanation stays in this player's notes.");
      toast.success("Review resolved.");
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve this review.");
    } finally {
      setSaving(false);
    }
  }

  const history = review.history.length > 0 || review.earlier.length > 0;

  return (
    <section
      className={`border-l-2 pl-3 space-y-3 ${review.open ? "border-amber-400" : "border-border-token"}`}
      aria-label="Review"
    >
      <div className="admin-section-heading">
        <h2>{review.open ? "Needs review" : "Review"}</h2>
        {!review.open && <span className="text-sm text-zinc-400">Resolved</span>}
      </div>

      {review.open && (
        <>
          {review.reasons.length > 0 ? (
            <ReasonList items={review.reasons} tone="amber" />
          ) : (
            <p className="text-sm text-amber-100">
              {review.flaggedAgain
                ? `Flagged again after it was resolved on ${formatWhen(review.history[review.history.length - 1].at)}.`
                : "Flagged before reasons were recorded."}
            </p>
          )}

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Right now</p>
            {live.length > 0 ? (
              <ReasonList items={live} tone="amber" />
            ) : (
              <p className="text-sm text-zinc-300">
                Nothing looks unsafe: card payments, offline receipts and People records all check
                out. If you have looked, mark it reviewed.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="admin-field">
              {mustExplain ? "What did you do about it?" : "Note (optional)"}
              <input
                type="text"
                maxLength={RESOLUTION_MAX_LENGTH}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={mustExplain ? "e.g. Refunded in Stripe on Friday" : "e.g. Same person, merged"}
                disabled={saving || busy}
              />
            </label>
            {mustExplain && (
              <label className="flex items-start gap-2 text-sm min-h-11">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)}
                  disabled={saving || busy}
                />
                <span>
                  I have handled this outside the app. Resolve anyway and record what I did.
                </span>
              </label>
            )}
            <button
              type="button"
              className="btn-primary text-sm !min-h-11 disabled:opacity-50"
              disabled={saving || busy || (mustExplain && (!acknowledge || !note.trim()))}
              onClick={() => void resolve()}
            >
              {saving ? "Resolving…" : "Mark reviewed"}
            </button>
            <p className="text-xs text-zinc-400">
              Clears the flag and writes a dated line to this player&apos;s notes. It does not
              change the payment status or touch any money.
            </p>
          </div>
        </>
      )}

      {notice && <p className="text-xs">{notice}</p>}
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}

      {history && (
        <details open={!review.open}>
          <summary className="text-xs cursor-pointer text-zinc-400 min-h-11 flex items-center">
            Review history
          </summary>
          <div className="space-y-3 pt-2">
            {review.earlier.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-zinc-400">Earlier flags</p>
                <ReasonList items={review.earlier} tone="muted" />
              </div>
            )}
            <ul className="space-y-2 text-sm">
              {review.history.map((h) => (
                <li key={h.at}>
                  <p className="text-zinc-300">
                    Resolved {formatWhen(h.at)} — {h.text}
                  </p>
                  {h.despite.length > 0 && (
                    <p className="text-xs text-zinc-400">
                      Still open at the time: {h.despite.join("; ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </section>
  );
}
