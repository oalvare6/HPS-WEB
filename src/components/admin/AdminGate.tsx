"use client";

import { ReactNode, useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Section } from "@/components/shared/section";

type AuthState = "checking" | "unauthed" | "authed";

export function AdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("checking");
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => setState(res.ok ? "authed" : "unauthed"))
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
