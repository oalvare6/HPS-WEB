"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Shield,
  User,
} from "lucide-react";
import { WhatsAppCommunityLink } from "@/components/shared/WhatsAppCommunityLink";
import type {
  PayEligibilitySuccessBody,
  PayEligibilityWaiverType,
} from "@/lib/pay-eligibility-types";

export type PayEmailGateTournament = {
  id: string;
  title: string;
  slug: string;
};

type GateStep = "email" | "waiverType" | "checking" | "result";

type PayEmailGateProps = {
  tournament: PayEmailGateTournament;
  whatsappUrl: string;
  /** When set, step 1 (email) is skipped. */
  playerEmail?: string | null;
  defaultWaiverType?: PayEligibilityWaiverType;
  onReadyToPay: (registrationId: string, payToken: string) => void;
};

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500";

const labelClass = "block text-xs font-medium text-zinc-400 mb-1.5";

function registerHref(slug: string, waiverType: PayEligibilityWaiverType) {
  return `/register?tournament=${encodeURIComponent(slug)}&type=${waiverType}`;
}

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

export function PayEmailGate({
  tournament,
  whatsappUrl,
  playerEmail = null,
  defaultWaiverType = "adult",
  onReadyToPay,
}: PayEmailGateProps) {
  const isLoggedIn = Boolean(playerEmail);
  const [step, setStep] = useState<GateStep>(isLoggedIn ? "checking" : "email");
  const [email, setEmail] = useState(playerEmail ?? "");
  const [waiverType, setWaiverType] = useState<PayEligibilityWaiverType>(defaultWaiverType);
  const [result, setResult] = useState<PayEligibilitySuccessBody | null>(null);
  const [error, setError] = useState("");
  const autoRan = useRef(false);

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
          setStep(isLoggedIn ? "waiverType" : "waiverType");
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
        setStep(isLoggedIn ? "waiverType" : "waiverType");
      }
    },
    [isLoggedIn, onReadyToPay, tournament.id]
  );

  useEffect(() => {
    if (!isLoggedIn || autoRan.current) return;
    autoRan.current = true;
    void runEligibility(playerEmail!, defaultWaiverType);
  }, [isLoggedIn, playerEmail, defaultWaiverType, runEligibility]);

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setStep("waiverType");
  };

  const handleWaiverSubmit = (e: FormEvent) => {
    e.preventDefault();
    const emailValue = isLoggedIn ? (playerEmail ?? "") : email.trim();
    if (!emailValue) {
      setError("Email is required.");
      return;
    }
    void runEligibility(emailValue, waiverType);
  };

  const retryDifferentType = () => {
    setResult(null);
    setStep("waiverType");
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
      <PayEmailGateResult
        result={result}
        tournament={tournament}
        whatsappUrl={whatsappUrl}
        waiverType={waiverType}
        onRetryType={retryDifferentType}
        isLoggedIn={isLoggedIn}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-10 md:py-14">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-brand mb-2">
          {title}
        </p>
        <h2 className="text-xl font-semibold text-white mb-2">Before you pay</h2>
        <p className="text-sm text-zinc-400">
          {isLoggedIn
            ? "Confirm your waiver type so we can match your registration."
            : "Enter the email you used to register. We'll check your waiver and registration."}
        </p>
      </div>

      {error && (
        <div
          className="mb-6 flex gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {step === "email" && (
        <form onSubmit={handleEmailSubmit} className="space-y-6">
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
          <button type="submit" className="btn-primary w-full justify-center h-12">
            Continue
          </button>
        </form>
      )}

      {step === "waiverType" && (
        <form onSubmit={handleWaiverSubmit} className="space-y-6">
          {isLoggedIn && playerEmail && (
            <div className="rounded-lg border border-border-token bg-surface-2 px-4 py-3 text-sm text-zinc-300">
              <span className="text-zinc-500">Signed in as </span>
              <span className="text-white font-medium">{playerEmail}</span>
            </div>
          )}

          <div>
            <p className={labelClass}>Waiver type</p>
            <WaiverTypePicker
              value={waiverType}
              onChange={setWaiverType}
              disabled={isLoggedIn && autoRan.current && !result}
            />
          </div>

          <button type="submit" className="btn-primary w-full justify-center h-12">
            {isLoggedIn ? "Check eligibility" : "Continue to payment check"}
          </button>

          {!isLoggedIn && (
            <button
              type="button"
              className="w-full text-sm text-zinc-500 hover:text-zinc-300"
              onClick={() => setStep("email")}
            >
              Back to email
            </button>
          )}
        </form>
      )}

      <p className="mt-8 text-center text-xs text-zinc-500">
        Questions?{" "}
        <WhatsAppCommunityLink href={whatsappUrl} variant="inline" showIcon={false} />
      </p>
    </div>
  );
}

function PayEmailGateResult({
  result,
  tournament,
  whatsappUrl,
  waiverType,
  onRetryType,
  isLoggedIn,
}: {
  result: PayEligibilitySuccessBody;
  tournament: PayEmailGateTournament;
  whatsappUrl: string;
  waiverType: PayEligibilityWaiverType;
  onRetryType: () => void;
  isLoggedIn: boolean;
}) {
  const title = tournament.title;
  const regHref = registerHref(tournament.slug, waiverType);

  const cardClass =
    "rounded-xl border border-border-token bg-surface-2 p-6 md:p-8 space-y-5";

  if (result.status === "already_paid") {
    return (
      <div className="max-w-lg mx-auto px-6 py-10 md:py-14">
        <div className={cardClass}>
          <CheckCircle2 className="w-10 h-10 text-emerald-400" aria-hidden />
          <h2 className="text-xl font-semibold text-white">You&apos;re paid up</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            You&apos;re paid up for {title}. See you on the field. Join WhatsApp for schedules
            and updates.
          </p>
          <WhatsAppCommunityLink href={whatsappUrl} variant="card" />
        </div>
      </div>
    );
  }

  if (result.status === "needs_registration") {
    return (
      <div className="max-w-lg mx-auto px-6 py-10 md:py-14">
        <div className={cardClass}>
          <Shield className="w-10 h-10 text-brand" aria-hidden />
          <h2 className="text-xl font-semibold text-white">Register for this event</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Your waiver is on file. Register for {title} to join the roster, then return here
            to pay.
          </p>
          <div className="flex flex-col gap-3">
            <Link href={regHref} className="btn-primary w-full justify-center">
              Register for this event
            </Link>
            <WhatsAppCommunityLink href={whatsappUrl} variant="button" />
          </div>
        </div>
      </div>
    );
  }

  if (
    result.status === "unknown_email" ||
    result.status === "no_waiver" ||
    result.status === "needs_waiver"
  ) {
    const isUnknown = result.status === "unknown_email";
    const isNoWaiver = result.status === "no_waiver";

    const heading = isUnknown
      ? "Register and sign your waiver first"
      : isNoWaiver
        ? "Waiver required"
        : "Complete your waiver";

    const body = isUnknown
      ? `We don't have a signed waiver for this email. Register for ${title}, sign the waiver, then come back here to pay. Questions? Join our WhatsApp community.`
      : isNoWaiver
        ? `We don't have a valid ${waiverType} waiver on file for this email. Register for ${title}, sign the waiver, then return here to pay.`
        : `Your registration for ${title} still needs a signed waiver. Complete registration and the waiver, then return here to pay.`;

    return (
      <div className="max-w-lg mx-auto px-6 py-10 md:py-14">
        <div className={cardClass}>
          <User className="w-10 h-10 text-amber-400" aria-hidden />
          <h2 className="text-xl font-semibold text-white">{heading}</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
          <div className="flex flex-col gap-3">
            <Link href={regHref} className="btn-primary w-full justify-center">
              Register for this event
            </Link>
            <WhatsAppCommunityLink href={whatsappUrl} variant="button" />
          </div>
          {isLoggedIn && (
            <button
              type="button"
              onClick={onRetryType}
              className="w-full text-sm text-zinc-500 hover:text-zinc-300 pt-2"
            >
              Try a different waiver type (adult / youth)
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
