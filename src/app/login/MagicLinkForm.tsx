"use client";

import { FormEvent, useState } from "react";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500";

export function MagicLinkForm({ nextPath }: { nextPath: string | null }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (nextPath) callbackUrl.searchParams.set("next", nextPath);

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      });

      if (otpError) {
        setError(
          otpError.message ||
            "We couldn't send the sign-in link. Please try again."
        );
        return;
      }

      setSentTo(trimmed);
    } catch {
      setError("We couldn't send the sign-in link. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <div className="dashboard-card p-6 text-center space-y-3">
        <CheckCircle2
          size={36}
          className="text-brand mx-auto"
          aria-hidden="true"
        />
        <h3 className="text-lg font-semibold text-white">Check your inbox</h3>
        <p className="text-sm text-zinc-400">
          We sent a sign-in link to{" "}
          <span className="text-white font-medium">{sentTo}</span>. Open it on
          this device to finish signing in.
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setEmail("");
          }}
          className="text-sm text-zinc-400 hover:text-white underline-offset-2 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Mail size={16} className="text-brand" />
          <label
            htmlFor="email"
            className="block text-sm font-semibold text-zinc-200"
          >
            Email
          </label>
        </div>
        <input
          type="email"
          id="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full btn-primary h-12 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        {submitting ? "Sending link..." : "Send sign-in link"}
      </button>

      {error && (
        <p className="text-sm text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
