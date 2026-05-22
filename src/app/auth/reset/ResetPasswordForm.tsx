"use client";

import { FormEvent, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const MIN_PASSWORD_LEN = 8;

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500";

/**
 * Sets a new password for the currently-recovered session via
 * `supabase.auth.updateUser`. Also flips the `has_password` flag in
 * `user_metadata` so `/me/security` knows to require the current password
 * on subsequent changes.
 */
export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { has_password: true },
      });
      if (updateError) {
        setError(
          updateError.message ||
            "We couldn't save your new password. Please try again."
        );
        setSubmitting(false);
        return;
      }
      window.location.assign("/me");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't save your new password. Please try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={16} className="text-brand" />
          <label
            htmlFor="reset-password"
            className="block text-sm font-semibold text-zinc-200"
          >
            New password
          </label>
        </div>
        <input
          type="password"
          id="reset-password"
          name="password"
          required
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LEN}
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={16} className="text-brand" />
          <label
            htmlFor="reset-confirm"
            className="block text-sm font-semibold text-zinc-200"
          >
            Confirm new password
          </label>
        </div>
        <input
          type="password"
          id="reset-confirm"
          name="confirm"
          required
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LEN}
          placeholder="Re-enter your new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full btn-primary h-12 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        {submitting ? "Saving..." : "Save new password"}
      </button>

      {error && (
        <p className="text-sm text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
