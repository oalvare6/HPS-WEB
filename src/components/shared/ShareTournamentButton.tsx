"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { summarizeText } from "@/lib/text";

type ShareTournamentButtonProps = {
  /** Tournament title, used as the share sheet title and message prefix. */
  title: string;
  /** Optional short description appended to the share text. */
  description?: string | null;
  /** Optional path to share. Defaults to the current page URL at click time. */
  path?: string;
  /** Visual variant for the button. */
  variant?: "primary" | "secondary";
  className?: string;
};

/**
 * Mobile-first share. Uses the Web Share API when available (iOS Safari,
 * Android Chrome — surfaces the OS sheet with Messages / WhatsApp / Instagram
 * / Mail / etc). Falls back to copying the URL to the clipboard with a
 * 2-second confirmation tick.
 */
export function ShareTournamentButton({
  title,
  description,
  path,
  variant = "secondary",
  className = "",
}: ShareTournamentButtonProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const handleShare = async () => {
    setError("");
    const url =
      typeof window !== "undefined"
        ? path
          ? new URL(path, window.location.origin).toString()
          : window.location.href
        : path ?? "";

    const tagline = description ? summarizeText(description, 100) : "";
    const text = tagline ? `${title} — ${tagline}` : title;

    // Web Share API (mobile). User can cancel safely; AbortError is silent.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        // Fall through to clipboard if share itself failed (e.g. unsupported scheme).
      }
    }

    // Clipboard fallback.
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch {
      // Fall through to error state.
    }

    setError("Couldn't open the share sheet. Long-press the URL bar to share.");
  };

  const buttonClass =
    variant === "primary"
      ? "btn-primary w-full justify-center text-sm"
      : "btn-secondary w-full justify-center text-sm";

  return (
    <div className={className}>
      <button type="button" onClick={handleShare} className={buttonClass}>
        {copied ? (
          <>
            <Check size={14} />
            Link copied
          </>
        ) : (
          <>
            <Share2 size={14} />
            Share tournament
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 text-xs text-amber-300 text-center">{error}</p>
      )}
    </div>
  );
}
