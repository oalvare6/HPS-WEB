"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const RESEND_COOLDOWN_SEC = 60;

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500";

/**
 * Sends a password-recovery email via `supabase.auth.resetPasswordForEmail`.
 *
 * `redirectTo` is set to `<origin>/auth/callback?next=/auth/reset` so the
 * existing PKCE callback handles session creation, then forwards the user
 * to the in-app "set a new password" surface.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(RESEND_COOLDOWN_SEC);

  useEffect(() => {
    if (!sentTo) return;
    setCooldownSec(RESEND_COOLDOWN_SEC);
  }, [sentTo]);

  useEffect(() => {
    if (!sentTo || cooldownSec <= 0) return;
    const id = window.setInterval(() => {
      setCooldownSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [sentTo, cooldownSec]);

  const sendResetEmail = useCallback(async (targetEmail: string) => {
    const supabase = createSupabaseBrowserClient();
    const redirectUrl = new URL("/auth/callback", window.location.origin);
    redirectUrl.searchParams.set("next", "/auth/reset");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      targetEmail,
      { redirectTo: redirectUrl.toString() }
    );

    if (resetError) {
      throw new Error(
        resetError.message ||
          "We couldn't send the reset email. Please try again."
      );
    }
  }, []);

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
      await sendResetEmail(trimmed);
      setSentTo(trimmed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't send the reset email. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!sentTo || cooldownSec > 0 || resending) return;
    setError("");
    setResending(true);
    try {
      await sendResetEmail(sentTo);
      setCooldownSec(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't resend the reset email. Please try again."
      );
    } finally {
      setResending(false);
    }
  };

  if (sentTo) {
    const resendDisabled = cooldownSec > 0 || resending;
    return (
      <div className="dashboard-card p-6 text-center space-y-3">
        <CheckCircle2
          size={36}
          className="text-brand mx-auto"
          aria-hidden="true"
        />
        <h3 className="text-lg font-semibold text-white">Check your inbox</h3>
        <p className="text-sm text-zinc-400">
          We sent a password-reset link to{" "}
          <span className="text-white font-medium">{sentTo}</span>. Open it on
          this device and choose a new password.
        </p>
        <p className="text-sm text-zinc-500">
          Didn&apos;t get it? Check spam, then resend after the cooldown.
        </p>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendDisabled}
          className="w-full btn-primary h-11 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {resending && <Loader2 size={16} className="animate-spin" />}
          {resending
            ? "Sending..."
            : cooldownSec > 0
              ? `Resend link (${cooldownSec}s)`
              : "Resend reset link"}
        </button>
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setEmail("");
            setError("");
            setCooldownSec(0);
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
            htmlFor="forgot-email"
            className="block text-sm font-semibold text-zinc-200"
          >
            Email
          </label>
        </div>
        <input
          type="email"
          id="forgot-email"
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
        {submitting ? "Sending link..." : "Send reset link"}
      </button>

      {error && (
        <p className="text-sm text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
