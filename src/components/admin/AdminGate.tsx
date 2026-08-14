"use client";

import { ReactNode, useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Section } from "@/components/shared/section";

type AuthState = "checking" | "unauthed" | "authed";

export function AdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("checking");
  const [loginError, setLoginError] = useState("");
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then(async (res) => {
        if (res.ok) {
          setState("authed");
          return;
        }
        // "Your session ran out" and "you were never signed in" look identical
        // on screen otherwise, and the first one is the common case.
        const body = (await res.json().catch(() => ({}))) as { reason?: string };
        setExpired(body.reason === "expired");
        setState("unauthed");
      })
      .catch(() => setState("unauthed"));
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError("");
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Login failed.");
        setSubmitting(false);
        return;
      }
      setState("authed");
    } catch {
      setLoginError("Login failed. Please try again.");
      setSubmitting(false);
    }
  };

  if (state === "checking") {
    return (
      <Section dark className="bg-surface min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-zinc-400">
          <Loader2 size={40} className="animate-spin" />
        </div>
      </Section>
    );
  }

  if (state === "unauthed") {
    return (
      <Section dark className="bg-surface min-h-[80vh] flex items-center justify-center">
        <div className="dashboard-card p-8 max-w-sm w-full">
          <div className="flex flex-col items-center mb-6">
            <Lock size={32} className="text-zinc-400 mb-3" />
            <h2 className="text-xl font-semibold text-white">Admin Login</h2>
            {expired && (
              <p className="text-sm text-zinc-400 mt-2 text-center">
                Your session timed out. Sign in again — this one lasts 30 days.
              </p>
            )}
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
              <input
                type="text"
                name="username"
                required
                autoComplete="username"
                className="w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors"
              />
            </div>
            {loginError && <p className="text-sm text-red-400 text-center">{loginError}</p>}
            <button type="submit" disabled={submitting} className="w-full btn-primary h-12 disabled:opacity-60">
              {submitting ? "Signing in…" : "Log In"}
            </button>
          </form>
        </div>
      </Section>
    );
  }

  return <>{children}</>;
}
