"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Loader2, Lock, Mail } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500";

/**
 * Email + password sign-in via `supabase.auth.signInWithPassword`.
 *
 * On success we do a full-page navigation (`window.location.assign`) instead
 * of a Next.js soft navigation. The Supabase browser client writes the new
 * session cookies via document.cookie; a hard load guarantees the next
 * request hits middleware with the cookies attached and Server Components
 * see the player.
 */
export function PasswordForm({ nextPath }: { nextPath: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (signInError) {
        setError(signInError.message || "We couldn't sign you in.");
        setSubmitting(false);
        return;
      }
      window.location.assign(nextPath ?? "/me");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't sign you in. Please try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Mail size={16} className="text-brand" />
          <label
            htmlFor="password-email"
            className="block text-sm font-semibold text-zinc-200"
          >
            Email
          </label>
        </div>
        <input
          type="email"
          id="password-email"
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

      <div className="space-y-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-brand" />
            <label
              htmlFor="password-password"
              className="block text-sm font-semibold text-zinc-200"
            >
              Password
            </label>
          </div>
          <Link
            href="/login/forgot-password"
            className="text-xs text-zinc-400 hover:text-white underline-offset-2 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
        <input
          type="password"
          id="password-password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full btn-primary h-12 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {submitting && <Loader2 size={16} className="animate-spin" />}
        {submitting ? "Signing in..." : "Sign in"}
      </button>

      {error && (
        <p className="text-sm text-red-400 text-center" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
