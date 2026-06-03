"use client";

import { useCallback, useState, type FormEvent } from "react";
import { AlertCircle, Calendar, Clock, Loader2, Mail, MapPin, Users } from "lucide-react";
import { WhatsAppCommunityLink } from "@/components/shared/WhatsAppCommunityLink";
import { PayGateResultCard } from "@/components/pay/PayGateResultCard";
import type {
  PayEligibilitySuccessBody,
  PayEligibilityWaiverType,
} from "@/lib/pay-eligibility-types";

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

type GateStep = "form" | "checking" | "result";

type PayEmailGateProps = {
  tournament: PayEmailGateTournament;
  whatsappUrl: string;
  defaultWaiverType?: PayEligibilityWaiverType;
  onReadyToPay: (registrationId: string, payToken: string) => void;
};

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500";

const labelClass = "block text-xs font-medium text-zinc-400 mb-1.5";

function WaiverTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: PayEligibilityWaiverType;
  onChange: (v: PayEligibilityWaiverType) => void;
  disabled?: boolean;
}) {
  const options: { id: PayEligibilityWaiverType; label: string; hint: string }[] = [
    { id: "adult", label: "Adult (18+)", hint: "Adult waiver template" },
    { id: "youth", label: "Youth (under 18)", hint: "Parent/guardian youth waiver" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={`text-left rounded-lg border p-4 transition-colors disabled:opacity-60 ${
              selected
                ? "border-brand bg-brand/10 ring-1 ring-brand/40"
                : "border-border-token bg-surface-2 hover:border-zinc-500"
            }`}
          >
            <span className="block text-sm font-medium text-white">{opt.label}</span>
            <span className="block text-xs text-zinc-500 mt-1">{opt.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Logged-out pay gate: collect email + waiver type, hit the eligibility API,
 * either redirect to PayForm (ready_to_pay) or render a result card. Logged-in
 * users are resolved server-side in `/pay/page.tsx` and never see this gate.
 */
export function PayEmailGate({
  tournament,
  whatsappUrl,
  defaultWaiverType = "adult",
  onReadyToPay,
}: PayEmailGateProps) {
  const [step, setStep] = useState<GateStep>("form");
  const [email, setEmail] = useState("");
  const [waiverType, setWaiverType] = useState<PayEligibilityWaiverType>(defaultWaiverType);
  const [result, setResult] = useState<PayEligibilitySuccessBody | null>(null);
  const [error, setError] = useState("");

  const runEligibility = useCallback(
    async (emailValue: string, waiver: PayEligibilityWaiverType) => {
      setError("");
      setStep("checking");

      try {
        const res = await fetch("/api/pay/eligibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: emailValue.trim(),
            tournamentId: tournament.id,
            waiverType: waiver,
          }),
        });

        const data = (await res.json()) as PayEligibilitySuccessBody & { error?: string };

        if (!res.ok) {
          setError(data.error ?? "We could not verify eligibility. Please try again.");
          setStep("form");
          return;
        }

        if (data.status === "ready_to_pay") {
          onReadyToPay(data.registrationId, data.payToken);
          return;
        }

        setResult(data);
        setStep("result");
      } catch {
        setError("Network error. Please check your connection and try again.");
        setStep("form");
      }
    },
    [onReadyToPay, tournament.id]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    void runEligibility(trimmed, waiverType);
  };

  const retryDifferentType = () => {
    setResult(null);
    setStep("form");
  };

  const title = tournament.title;

  if (step === "checking") {
    return (
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <Loader2 className="w-8 h-8 text-brand animate-spin mx-auto mb-4" aria-hidden />
        <p className="text-zinc-300">Checking your registration for {title}...</p>
      </div>
    );
  }

  if (step === "result" && result) {
    return (
      <PayGateResultCard
        result={result}
        tournament={tournament}
        whatsappUrl={whatsappUrl}
        waiverType={waiverType}
        onRetryType={retryDifferentType}
        isLoggedIn={false}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-10 md:py-14">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-brand mb-2">
          {title}
        </p>
        <h2 className="text-xl font-semibold text-white mb-2">Join this event</h2>
        <p className="text-sm text-zinc-400">
          Enter the email you used to register. We&apos;ll check your waiver and registration,
          then take you to payment.
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
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
              aria-hidden
            />
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

        <div>
          <p className={labelClass}>Waiver type</p>
          <WaiverTypePicker value={waiverType} onChange={setWaiverType} />
        </div>

        <button type="submit" className="btn-primary w-full justify-center h-12">
          Continue to payment check
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-zinc-500">
        Questions?{" "}
        <WhatsAppCommunityLink href={whatsappUrl} variant="inline" showIcon={false} />
      </p>
    </div>
  );
}
