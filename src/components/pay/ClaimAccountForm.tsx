"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const RESEND_COOLDOWN_SEC = 60;

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500 disabled:opacity-70 disabled:cursor-not-allowed";

/**
 * Post-checkout claim card. The email is locked to whatever Stripe verified
 * for this session, so we never let the user re-aim the magic link at a
 * different inbox from the success page.
 *
 * Sends a magic link via `signInWithOtp` (Supabase auto-creates the user
 * when one doesn't exist yet — that's the entire point of the claim flow).
 * The `emailRedirectTo` lands the player on `/auth/claim` after the PKCE
 * exchange, where they get a tailored welcome.
 */
export function ClaimAccountForm({ email }: { email: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(RESEND_COOLDOWN_SEC);

  useEffect(() => {
    if (!sent) return;
    setCooldownSec(RESEND_COOLDOWN_SEC);
  }, [sent]);

  useEffect(() => {
    if (!sent || cooldownSec <= 0) return;
    const id = window.setInterval(() => {
      setCooldownSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [sent, cooldownSec]);

  const sendClaimLink = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const redirectUrl = new URL("/auth/callback", window.location.origin);
    redirectUrl.searchParams.set("next", "/auth/claim");

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl.toString(),
        shouldCreateUser: true,
      },
    });

    if (otpError) {
      throw new Error(
        otpError.message ||
          "We couldn't send the claim link. Please try again."
      );
    }
  }, [email]);

  const handleSubmit = async () => {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await sendClaimLink();
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't send the claim link. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldownSec > 0 || resending) return;
    setError("");
    setResending(true);
    try {
      await sendClaimLink();
      setCooldownSec(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't resend the claim link. Please try again."
      );
    } finally {
      setResending(false);
    }
  };

  if (sent) {
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
          We sent a sign-in link to{" "}
          <span className="text-white font-medium">{email}</span>. Open it on
          this device to finish claiming your account.
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
              : "Resend claim link"}
        </button>
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="dashboard-card p-6 space-y-4 text-left">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <ShieldCheck size={18} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">
            Claim your account
          </h3>
          <p className="text-sm text-zinc-400 mt-1">
            Save your registration history, waiver status, and receipts to
            your account so you can re-register in one click next time.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Mail size={16} className="text-brand" />
          <label
            htmlFor="claim-email"
            className="block text-sm font-semibold text-zinc-200"
          >
            Email
          </label>
        </div>
        <input
          type="email"
          id="claim-email"
          name="email"
          value={email}
          readOnly
          disabled
          aria-readonly="true"
          className={inputClass}
        />
        <p className="text-xs text-zinc-500">
          We&apos;ll send the sign-in link to this address — the same one you
          paid with.
        </p>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full btn-primary h-12 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        {submitting ? "Sending link..." : "Send me a sign-in link"}
      </button>

      {error && (
        <p className="text-sm text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
