"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const MIN_PASSWORD_LEN = 8;

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500";
const labelClass = "block text-sm font-semibold text-zinc-200";

/**
 * Set or change the player's password from `/me/security`.
 *
 * When the user already has a password (`hasPassword=true`), we re-verify
 * by calling `signInWithPassword({ email, password: current })` before
 * updating. This keeps a stolen-cookie attacker from rotating the password
 * out from under the legitimate user. When `hasPassword=false`, the
 * current-password field is hidden and we go straight to `updateUser`.
 *
 * Either branch flips `user_metadata.has_password = true` on success so
 * the next render of `/me/security` knows to require the current password.
 */
export function SecurityForm({
  email,
  hasPassword,
}: {
  email: string;
  hasPassword: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSavedAt(null);

    if (newPassword.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two new passwords don't match.");
      return;
    }
    if (hasPassword && !currentPassword) {
      setError("Enter your current password to confirm this change.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();

      if (hasPassword) {
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (verifyError) {
          setError(
            verifyError.message?.toLowerCase().includes("invalid")
              ? "Your current password is incorrect."
              : verifyError.message ||
                  "We couldn't verify your current password."
          );
          setSubmitting(false);
          return;
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
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

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSavedAt(Date.now());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't save your new password. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="dashboard-card p-5 md:p-6 space-y-6"
    >
      {hasPassword && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Lock size={16} className="text-brand" />
            <label htmlFor="security-current" className={labelClass}>
              Current password
            </label>
          </div>
          <input
            type="password"
            id="security-current"
            name="current_password"
            required={hasPassword}
            autoComplete="current-password"
            placeholder="Your current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={16} className="text-brand" />
          <label htmlFor="security-new" className={labelClass}>
            New password
          </label>
        </div>
        <input
          type="password"
          id="security-new"
          name="new_password"
          required
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LEN}
          placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={16} className="text-brand" />
          <label htmlFor="security-confirm" className={labelClass}>
            Confirm new password
          </label>
        </div>
        <input
          type="password"
          id="security-confirm"
          name="confirm_password"
          required
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LEN}
          placeholder="Re-enter the new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary h-11 px-5 inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {submitting
            ? "Saving..."
            : hasPassword
              ? "Update password"
              : "Set password"}
        </button>
        {savedAt && !error && (
          <span className="inline-flex items-center gap-1.5 text-sm text-brand">
            <CheckCircle2 size={14} /> Saved
          </span>
        )}
        {error && (
          <span className="text-sm text-red-400" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
