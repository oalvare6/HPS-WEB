"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, PenLine } from "lucide-react";
import { getSignerLabel, type WaiverType } from "@/lib/waiver-text";

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500 disabled:opacity-70";

/**
 * Type-your-name signature. This is the placeholder standing in for the PDF
 * service, and it is intentionally the plainest thing that still produces a
 * record worth keeping: the name, the box, and one button.
 *
 * On success the browser navigates to the pay page with a full page load rather
 * than a client transition, so the next request re-reads the registration and
 * cannot render a stale "waiver required" state.
 */
export function WaiverSignForm({
  registrationId,
  payToken,
  waiverType,
  playerName,
}: {
  registrationId: string;
  payToken: string;
  waiverType: WaiverType;
  playerName: string;
}) {
  const [signedName, setSignedName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isYouth = waiverType === "youth";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const name = signedName.trim();
    if (!name.includes(" ")) {
      setError("Please type your full name — first and last.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/waiver/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId,
          payToken,
          signedName: name,
          signerRelationship: isYouth ? relationship.trim() || null : null,
        }),
      });

      const data = (await res.json()) as { error?: string; payUrl?: string };

      if (!res.ok || !data.payUrl) {
        setError(data.error || "We couldn't record your signature. Please try again.");
        setSubmitting(false);
        return;
      }

      window.location.href = data.payUrl;
    } catch {
      setError("Network error. Check your connection and try again.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="dashboard-card p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-2">
        <PenLine size={18} className="text-brand" />
        <h2 className="text-base font-semibold text-white">Sign here</h2>
      </div>

      {isYouth && (
        <div>
          <label htmlFor="relationship" className="block text-xs font-medium text-zinc-400 mb-1.5">
            Your relationship to {playerName || "the player"}
          </label>
          <input
            id="relationship"
            type="text"
            autoComplete="off"
            placeholder="Parent, legal guardian…"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className={inputClass}
            disabled={submitting}
          />
        </div>
      )}

      <div>
        <label htmlFor="signedName" className="block text-xs font-medium text-zinc-400 mb-1.5">
          {getSignerLabel(waiverType)} <span className="text-red-400">*</span>
        </label>
        <input
          id="signedName"
          type="text"
          required
          autoComplete="name"
          autoCapitalize="words"
          placeholder={isYouth ? "Parent or guardian name" : playerName || "First and last name"}
          value={signedName}
          onChange={(e) => setSignedName(e.target.value)}
          className={`${inputClass} font-serif text-lg`}
          disabled={submitting}
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          Typing your name here counts as your signature. We record the name, the
          date and time, and the version of the waiver above.
        </p>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          required
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={submitting}
          className="w-5 h-5 mt-0.5 border-border-token bg-surface-2 rounded focus:ring-brand text-brand"
        />
        <span className="text-sm text-zinc-300">
          I have read the waiver above in full, I understand it, and I agree to
          it{isYouth ? " on behalf of my child" : ""}.
        </span>
      </label>

      {error && (
        <div
          className="flex gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !agreed}
        className="w-full btn-primary h-12 justify-center disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? "Recording your signature…" : "Sign and continue to payment"}
      </button>
    </form>
  );
}
