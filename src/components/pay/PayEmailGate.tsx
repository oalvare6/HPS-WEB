"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Calendar, Clock, Loader2, Mail, MailCheck, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { WhatsAppCommunityLink } from "@/components/shared/WhatsAppCommunityLink";

export type PayEmailGateTournament = {
  id: string;
  title: string;
  slug: string;
  /** Optional context fields rendered as a summary card above the form. */
  recurrence?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  location?: string | null;
  format?: string | null;
};

function TournamentSummary({ tournament }: { tournament: PayEmailGateTournament }) {
  const timeRange =
    tournament.time_start && tournament.time_end
      ? `${tournament.time_start} – ${tournament.time_end}`
      : tournament.time_start || tournament.time_end || null;

  const rows: { icon: typeof Calendar; text: string }[] = [];
  if (tournament.recurrence) rows.push({ icon: Calendar, text: tournament.recurrence });
  if (timeRange) rows.push({ icon: Clock, text: timeRange });
  if (tournament.location) rows.push({ icon: MapPin, text: tournament.location });
  if (tournament.format) rows.push({ icon: Users, text: tournament.format });

  if (rows.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-border-token bg-surface-2 px-4 py-3">
      <p className="text-sm font-medium text-white mb-2">{tournament.title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-zinc-300">
        {rows.map((row, i) => {
          const Icon = row.icon;
          return (
            <div key={i} className="flex items-center gap-2">
              <Icon size={12} className="text-brand flex-shrink-0" aria-hidden />
              <span className="truncate">{row.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type GateStep = "form" | "sending" | "sent";

type PayEmailGateProps = {
  tournament: PayEmailGateTournament;
  whatsappUrl: string;
};

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500";

const labelClass = "block text-xs font-medium text-zinc-400 mb-1.5";

/**
 * Logged-out pay gate.
 *
 * It used to check the email against the roster and hand the browser a
 * token on the spot, which meant anyone who knew your email could act on your
 * registration (backend_audit_v1.md F-01). Now it only asks the server to
 * email a personal link; the screen looks the same whether or not a
 * registration exists, so it cannot be used to look people up.
 */
export function PayEmailGate({ tournament, whatsappUrl }: PayEmailGateProps) {
  const [step, setStep] = useState<GateStep>("form");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setStep("sending");
    try {
      const res = await fetch("/api/pay/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, tournamentId: tournament.id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "We couldn't send a link right now. Please try again.");
        setStep("form");
        return;
      }
      setStep("sent");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStep("form");
    }
  };

  const title = tournament.title;

  if (step === "sending") {
    return (
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <Loader2 className="w-8 h-8 text-brand animate-spin mx-auto mb-4" aria-hidden />
        <p className="text-zinc-300">One moment…</p>
      </div>
    );
  }

  if (step === "sent") {
    return (
      <div className="max-w-lg mx-auto px-6 py-10 md:py-14">
        <div className="rounded-xl border border-border-token bg-surface-2 p-6 md:p-8 space-y-5">
          <MailCheck className="w-10 h-10 text-emerald-400" aria-hidden />
          <h2 className="text-xl font-semibold text-white">Check your email</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            If you have a pending registration for {title} under that address, we&apos;ve
            emailed you a personal link to pay, sign your waiver, or cancel. It works
            once and expires in twenty minutes.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Nothing arrived? Check spam, or if you haven&apos;t signed up yet,{" "}
            <Link
              href={`/register?tournament=${encodeURIComponent(tournament.slug)}`}
              className="text-white underline underline-offset-2"
            >
              sign up for {title}
            </Link>
            .
          </p>
          <WhatsAppCommunityLink href={whatsappUrl} variant="button" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-10 md:py-14">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-brand mb-2">{title}</p>
        <h2 className="text-xl font-semibold text-white mb-2">Already signed up?</h2>
        <p className="text-sm text-zinc-400">
          Enter the email you registered with and we&apos;ll send you a personal link to
          finish paying. New here?{" "}
          <Link
            href={`/register?tournament=${encodeURIComponent(tournament.slug)}`}
            className="text-white underline underline-offset-2"
          >
            Sign up first
          </Link>
          .
        </p>
      </div>

      <TournamentSummary tournament={tournament} />

      {error && (
        <div
          className="mb-6 flex gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="pay-gate-email" className={labelClass}>
            Email address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" aria-hidden />
            <input
              id="pay-gate-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClass} pl-10`}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <button type="submit" className="btn-primary w-full justify-center h-12">
          Email me my link
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-zinc-500">
        Questions?{" "}
        <WhatsAppCommunityLink href={whatsappUrl} variant="inline" showIcon={false} />
      </p>
    </div>
  );
}
