"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FormFieldsSkeleton } from "@/components/shared/skeleton";
import { EnrolledBanner, PayLaterCard } from "@/components/pay/EnrolledPanels";
import { trackRegistrationEvent } from "@/lib/analytics";
import {
  Trophy,
  Calendar,
  MapPin,
  Clock,
  CreditCard,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Users,
  UserCheck,
} from "lucide-react";
import {
  formatUsdFromCents,
  isWorldCupTournamentSlug,
  WORLD_CUP_ROSTER_SIZE_OPTIONS,
  WORLD_CUP_TEAM_FEE_CENTS,
  worldCupShareAmountCents,
  type GenericPayKind,
  type WorldCupPayKind,
} from "@/lib/world-cup-pricing";

export type TournamentPayOption = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
  recurrence: string | null;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  entry_fee_cents: number | null;
  drop_in_fee_cents: number;
};

function formatUsd(cents: number) {
  return formatUsdFromCents(cents);
}

type PayFormProps = {
  /**
   * Server-resolved tournament id to preselect (from `/pay?tournament=<slug>`).
   * The component still fetches `/api/pay/options` on mount so the user can
   * switch to a different open tournament if they want.
   */
  initialTournamentId?: string | null;
  /**
   * Server-resolved tournament row, used as a placeholder so the preselected
   * tournament's info renders instantly without waiting for the options fetch.
   * Must already be in the payments-open set.
   */
  initialTournament?: TournamentPayOption | null;
  /**
   * Roster standing for a player arriving on a resume link, rendered as the
   * "you're on the roster" banner and the "pay later" exit.
   *
   * These live **inside** this component rather than beside it on the page.
   * `PayForm` sits behind a Suspense boundary because it calls
   * `useSearchParams()`, and rendering sibling content next to that boundary
   * strands its fallback `<template>` — the Pay button then never appears at
   * all. Reproduced on a clean production build. Passing the data in keeps the
   * boundary's subtree self-contained, which is the arrangement that works.
   */
  enrolled?: EnrolledStanding | null;
};

export type EnrolledStanding = {
  tournamentTitle: string | null;
  teamName: string | null;
  isPaid: boolean;
  /** Where "I'll pay later" sends them to check their standing. */
  statusHref: string;
  entryFeeLabel: string | null;
  /** They have already told us they're bringing cash. */
  payingCash: boolean;
};

export function PayForm({
  initialTournamentId = null,
  initialTournament = null,
  enrolled = null,
}: PayFormProps) {
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("cancelled") === "true";
  const registrationId = searchParams.get("registrationId") ?? "";
  const payToken = searchParams.get("payToken") ?? "";

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [tournaments, setTournaments] = useState<TournamentPayOption[]>(
    initialTournament ? [initialTournament] : []
  );
  const [selectedTournamentId, setSelectedTournamentId] = useState(
    initialTournamentId ?? ""
  );
  const [selectedPayKind, setSelectedPayKind] = useState<GenericPayKind>("entry");
  const [worldCupPayKind, setWorldCupPayKind] = useState<WorldCupPayKind>("team_full");
  const [rosterSize, setRosterSize] = useState<number>(10);
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payOptionsLoading, setPayOptionsLoading] = useState(true);
  const [payOptionsError, setPayOptionsError] = useState("");
  const [registrationLoading, setRegistrationLoading] = useState(Boolean(registrationId));
  const [registrationLoadError, setRegistrationLoadError] = useState("");
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [registrationTournament, setRegistrationTournament] = useState<{
    id: string | null;
    slug: string | null;
    title: string | null;
    entryFeeCents: number | null;
    dropInFeeCents: number | null;
  } | null>(null);
  const paymentLinkTracked = useRef(false);

  const hasRegistration = Boolean(registrationId);
  const selectedTournament =
    tournaments.find((t) => t.id === selectedTournamentId) ??
    initialTournament ??
    tournaments[0] ??
    null;

  const registrationTournamentSlug = registrationTournament?.slug ?? null;
  const isWorldCup =
    isWorldCupTournamentSlug(selectedTournament?.slug) ||
    isWorldCupTournamentSlug(registrationTournamentSlug);

  const worldCupShareCents = worldCupShareAmountCents(rosterSize);

  const selectedAmountCents = (() => {
    if (isWorldCup) {
      if (worldCupPayKind === "captain_paid_ack") return 0;
      if (worldCupPayKind === "team_full") return WORLD_CUP_TEAM_FEE_CENTS;
      return worldCupShareCents > 0 ? worldCupShareCents : null;
    }
    if (hasRegistration) {
      // Open play (and any drop-in-priced event) has no entry fee — charge the
      // configured drop-in amount instead so the preset admin price is used.
      return (
        registrationTournament?.entryFeeCents ??
        registrationTournament?.dropInFeeCents ??
        null
      );
    }
    if (selectedPayKind === "drop_in") {
      return selectedTournament?.drop_in_fee_cents ?? null;
    }
    return selectedTournament?.entry_fee_cents ?? null;
  })();

  const selectedPayTitle = (() => {
    if (isWorldCup) {
      const base = selectedTournament?.title ?? registrationTournament?.title ?? "World Cup";
      if (worldCupPayKind === "team_full") return `${base} — Full team`;
      if (worldCupPayKind === "team_share") {
        return `${base} — Share (${rosterSize} players)`;
      }
      return `${base} — Captain already paid`;
    }
    if (hasRegistration) {
      return registrationTournament?.title ?? "Tournament Entry";
    }
    if (selectedPayKind === "drop_in") {
      return `${selectedTournament?.title ?? "Tournament"} — Drop-in`;
    }
    return selectedTournament?.title ?? "Tournament Entry";
  })();

  const requiresTeamName =
    isWorldCup &&
    (worldCupPayKind === "team_full" || worldCupPayKind === "team_share");
  const teamNameValid = !requiresTeamName || teamName.trim().length > 0;

  useEffect(() => {
    let cancelledFetch = false;
    (async () => {
      try {
        const res = await fetch("/api/pay/options");
        const data = (await res.json()) as {
          tournaments?: TournamentPayOption[];
          error?: string;
        };
        if (cancelledFetch) return;
        if (!res.ok) {
          setPayOptionsError(data.error ?? "Could not load current payment options.");
          return;
        }
        const options = data.tournaments ?? [];
        setTournaments(options);
        if (options.length > 0) {
          setSelectedTournamentId((prev) => prev || options[0].id);
        }
      } catch {
        if (!cancelledFetch) {
          setPayOptionsError("Network error loading payment options. Please refresh.");
        }
      } finally {
        if (!cancelledFetch) setPayOptionsLoading(false);
      }
    })();
    return () => {
      cancelledFetch = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTournament || isWorldCupTournamentSlug(selectedTournament.slug)) return;
    if (selectedPayKind === "entry" && !selectedTournament.entry_fee_cents) {
      setSelectedPayKind("drop_in");
    }
    if (selectedPayKind === "drop_in" && !selectedTournament.drop_in_fee_cents) {
      setSelectedPayKind("entry");
    }
  }, [selectedTournament, selectedPayKind]);

  useEffect(() => {
    if (!registrationId) return;

    let cancelledFetch = false;

    (async () => {
      try {
        const qs = new URLSearchParams({ token: payToken });
        const res = await fetch(`/api/registrations/${registrationId}?${qs}`);
        const data = (await res.json()) as {
          email?: string;
          firstName?: string;
          paymentStatus?: string;
          tournamentId?: string | null;
          tournamentTitle?: string | null;
          tournamentSlug?: string | null;
          tournamentEntryFeeCents?: number | null;
          tournamentDropInFeeCents?: number | null;
          error?: string;
        };

        if (cancelledFetch) return;

        if (!res.ok) {
          setRegistrationLoadError(
            data.error ?? "We couldn't load your registration. Please contact us."
          );
          return;
        }

        if (data.email) setEmail(data.email);
        if (data.firstName) setFirstName(data.firstName);
        if (data.paymentStatus === "paid") setAlreadyPaid(true);
        setRegistrationTournament({
          id: data.tournamentId ?? null,
          slug: data.tournamentSlug ?? null,
          title: data.tournamentTitle ?? null,
          entryFeeCents: data.tournamentEntryFeeCents ?? null,
          dropInFeeCents: data.tournamentDropInFeeCents ?? null,
        });
        if (data.tournamentId) {
          setSelectedTournamentId(data.tournamentId);
        }
        if (!paymentLinkTracked.current && data.paymentStatus !== "paid") {
          paymentLinkTracked.current = true;
          trackRegistrationEvent("registration_payment_link_shown", {
            source: "pay_page",
            registration_id: registrationId,
          });
        }
      } catch {
        if (!cancelledFetch) {
          setRegistrationLoadError(
            "Network error loading your registration. Please refresh."
          );
        }
      } finally {
        if (!cancelledFetch) setRegistrationLoading(false);
      }
    })();

    return () => {
      cancelledFetch = true;
    };
  }, [registrationId, payToken]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (isWorldCup && !teamNameValid) {
      setError("Enter your team name before continuing.");
      return;
    }

    if (isWorldCup && worldCupPayKind === "captain_paid_ack") {
      if (!hasRegistration) {
        setError(
          "Complete registration and your waiver first, then return to this page from your confirmation link."
        );
        return;
      }
    }

    setLoading(true);

    try {
      if (isWorldCup && worldCupPayKind === "captain_paid_ack") {
        const res = await fetch("/api/register/captain-paid-ack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            registrationId,
            payToken: payToken || undefined,
            teamName: teamName.trim() || undefined,
          }),
        });
        const data = (await res.json()) as { redirectUrl?: string; error?: string };
        if (!res.ok || !data.redirectUrl) {
          setError(data.error ?? "Something went wrong. Please try again.");
          setLoading(false);
          return;
        }
        window.location.href = data.redirectUrl;
        return;
      }

      const payKind = isWorldCup
        ? worldCupPayKind
        : hasRegistration
          ? registrationTournament?.entryFeeCents
            ? "entry"
            : "drop_in"
          : selectedPayKind;

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          tournamentId: hasRegistration ? undefined : selectedTournament?.id,
          payKind,
          registrationId: registrationId || undefined,
          payToken: payToken || undefined,
          rosterSize: isWorldCup && worldCupPayKind === "team_share" ? rosterSize : undefined,
          teamName: isWorldCup && requiresTeamName ? teamName.trim() : undefined,
        }),
      });

      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  if (hasRegistration && registrationLoading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 md:py-20">
        <FormFieldsSkeleton fields={2} />
      </div>
    );
  }

  if (hasRegistration && registrationLoadError) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20">
        <div className="dashboard-card p-6 flex items-start gap-3 text-red-400">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold mb-1">We couldn&apos;t load your registration</p>
            <p className="text-sm text-zinc-400">{registrationLoadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasRegistration && payOptionsLoading && !initialTournament) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 md:py-20">
        <FormFieldsSkeleton fields={2} />
      </div>
    );
  }

  if (!hasRegistration && payOptionsError && !initialTournament) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20">
        <div className="dashboard-card p-6 flex items-start gap-3 text-red-400">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold mb-1">We couldn&apos;t load payment options</p>
            <p className="text-sm text-zinc-400">{payOptionsError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (hasRegistration && alreadyPaid) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20">
        <div className="dashboard-card p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand/15 mb-4">
            <CheckCircle2 size={28} className="text-brand" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">You&apos;re all set</h2>
          <p className="text-zinc-400 mb-6">
            {firstName ? `${firstName}, your` : "Your"} payment is already on file. See you on the field.
          </p>
          <Link href="/" className="btn-primary inline-flex justify-center px-6">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 md:py-20">
      {enrolled && (
        <EnrolledBanner
          tournamentTitle={enrolled.tournamentTitle}
          teamName={enrolled.teamName}
          isPaid={enrolled.isPaid}
        />
      )}

      {hasRegistration && (
        <div className="mb-6 flex items-start gap-3 bg-brand/10 border border-brand/30 rounded-lg px-4 py-3 text-brand text-sm">
          <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-semibold">Step 3 of 3 — Payment.</span>{" "}
            {firstName ? `${firstName}, your` : "Your"} registration and waiver are saved
            {email ? <> for <span className="font-mono">{email}</span></> : null}.{" "}
            {isWorldCup
              ? "Choose how your team is paying, then complete checkout or confirm your captain already paid."
              : "Pick a tier and complete checkout to lock in your spot."}
          </span>
        </div>
      )}

      {cancelled && (
        <div className="mb-6 flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 text-yellow-400 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>Payment was cancelled. You can try again whenever you&apos;re ready.</span>
        </div>
      )}

      {!hasRegistration && selectedTournament && (
        <div className="mb-6 space-y-2">
          <label htmlFor="tournamentId" className="block text-sm font-medium text-zinc-300">
            Tournament
          </label>
          <select
            id="tournamentId"
            name="tournamentId"
            value={selectedTournament.id}
            onChange={(e) => setSelectedTournamentId(e.target.value)}
            className="w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors"
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Event info */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-brand rounded-full animate-pulse" />
          <span className="text-xs font-mono text-brand uppercase tracking-wider">
            Payments Open
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-zinc-300">
            <Calendar size={14} className="text-brand flex-shrink-0" />
            <span>{selectedTournament?.recurrence ?? "Schedule posted in events."}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Clock size={14} className="text-brand flex-shrink-0" />
            <span>
              {selectedTournament?.time_start && selectedTournament?.time_end
                ? `${selectedTournament.time_start} – ${selectedTournament.time_end}`
                : "See tournament page"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <MapPin size={14} className="text-brand flex-shrink-0" />
            <span>{selectedTournament?.location ?? "Houston Premier Soccer"}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Users size={14} className="text-brand flex-shrink-0" />
            <span>{selectedTournament?.format ?? "Tournament"}</span>
          </div>
        </div>
      </div>

      {selectedTournament && isWorldCup && (
        <WorldCupPayOptions
          worldCupPayKind={worldCupPayKind}
          onSelectKind={setWorldCupPayKind}
          rosterSize={rosterSize}
          onRosterSizeChange={setRosterSize}
          shareCents={worldCupShareCents}
          hasRegistration={hasRegistration}
        />
      )}

      {selectedTournament && !isWorldCup && !hasRegistration && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {selectedTournament.entry_fee_cents ? (
            <button
              type="button"
              onClick={() => setSelectedPayKind("entry")}
              className={`dashboard-card p-5 text-left transition-all ${
                selectedPayKind === "entry"
                  ? "ring-2 ring-brand border-brand"
                  : "hover:border-border-token"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${
                    selectedPayKind === "entry"
                      ? "bg-brand/20 text-brand"
                      : "bg-base text-zinc-400"
                  }`}
                >
                  Full Tournament
                </span>
                <Trophy
                  size={20}
                  className={selectedPayKind === "entry" ? "text-brand" : "text-zinc-600"}
                />
              </div>
              <p className="text-white font-semibold mb-1">Tournament Entry</p>
              <p className="text-zinc-400 text-sm mb-3">
                Full tournament registration payment.
              </p>
              <p className="text-2xl font-bold text-white">
                {formatUsd(selectedTournament.entry_fee_cents)}
              </p>
            </button>
          ) : null}

          {selectedTournament.drop_in_fee_cents ? (
            <button
              type="button"
              onClick={() => setSelectedPayKind("drop_in")}
              className={`dashboard-card p-5 text-left transition-all ${
                selectedPayKind === "drop_in"
                  ? "ring-2 ring-brand border-brand"
                  : "hover:border-border-token"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${
                    selectedPayKind === "drop_in"
                      ? "bg-brand/20 text-brand"
                      : "bg-base text-zinc-400"
                  }`}
                >
                  Guest / Drop-In
                </span>
                <Trophy
                  size={20}
                  className={selectedPayKind === "drop_in" ? "text-brand" : "text-zinc-600"}
                />
              </div>
              <p className="text-white font-semibold mb-1">Single Round / Guest</p>
              <p className="text-zinc-400 text-sm mb-3">
                One-day guest play or drop-in payment.
              </p>
              <p className="text-2xl font-bold text-white">
                {formatUsd(selectedTournament.drop_in_fee_cents)}
              </p>
            </button>
          ) : null}
        </div>
      )}

      {/* Payment form */}
      <div className="dashboard-card p-6">
        <h3 className="text-lg font-semibold text-white mb-1">
          Complete Payment
        </h3>
        <p className="text-zinc-400 text-sm mb-6">
          {isWorldCup ? (
            <>
              {worldCupPayKind === "captain_paid_ack" ? (
                <>
                  Confirm that your captain already paid the $960 team fee. Houston Premier
                  Soccer will review and mark your registration paid — no charge today.
                </>
              ) : (
                <>
                  Your payment for{" "}
                  <span className="text-zinc-200">{selectedPayTitle}</span> will be linked to your
                  registration. Agree on roster size with your teammates if you are splitting the
                  fee.
                </>
              )}
            </>
          ) : hasRegistration ? (
            <>
              Your payment for <span className="text-zinc-200">{selectedPayTitle}</span> will be
              linked to your registration automatically.
            </>
          ) : (
            <>
              Enter the email you used when registering. Already registered?{" "}
              your payment will be linked to your profile automatically.{" "}
              Not registered yet?{" "}
              <Link href="/register" className="text-white underline underline-offset-2">
                Register first
              </Link>{" "}
              to sign your waiver, then come back here.
            </>
          )}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-400 mb-1"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              readOnly={hasRegistration}
              aria-readonly={hasRegistration}
              className={`w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors ${
                hasRegistration ? "opacity-80 cursor-not-allowed" : ""
              }`}
            />
            {hasRegistration && (
              <p className="text-xs text-zinc-500 mt-1.5">
                Locked to the email on your registration.
              </p>
            )}
          </div>

          {requiresTeamName && (
            <div>
              <label
                htmlFor="teamName"
                className="block text-sm font-medium text-zinc-400 mb-1"
              >
                Team name <span className="text-red-400">*</span>
              </label>
              <input
                id="teamName"
                type="text"
                required
                autoComplete="organization"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Houston FC"
                className="w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors"
              />
              <p className="text-xs text-zinc-500 mt-1.5">
                Used to build your roster and group assignment after payment.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-red-400 text-sm">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              !email ||
              !teamNameValid ||
              (isWorldCup
                ? worldCupPayKind !== "captain_paid_ack" && !selectedAmountCents
                : !selectedAmountCents)
            }
            className="btn-primary w-full justify-center h-12 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>Processing…</>
            ) : isWorldCup && worldCupPayKind === "captain_paid_ack" ? (
              <>
                <UserCheck size={18} />
                Confirm captain already paid
                <ArrowRight size={16} />
              </>
            ) : (
              <>
                <CreditCard size={18} />
                {selectedAmountCents
                  ? `Pay ${formatUsd(selectedAmountCents)} with Card`
                  : "Amount unavailable"}
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {!isWorldCup && !selectedAmountCents && (
            <p className="text-xs text-yellow-400 text-center">
              This payment option has no configured amount yet. Please contact support.
            </p>
          )}

          <p className="text-xs text-zinc-500 text-center">
            Powered by Stripe. Your card details are never stored on our servers.
          </p>
        </form>
      </div>

      {enrolled && !enrolled.isPaid && (
        <PayLaterCard
          statusHref={enrolled.statusHref}
          entryFeeLabel={enrolled.entryFeeLabel}
          payingCash={enrolled.payingCash}
          tournamentTitle={enrolled.tournamentTitle}
          // Read from the URL, which is where this page's authorization already
          // lives — the same pair the checkout call below is signed with.
          registrationId={registrationId || null}
          payToken={payToken || null}
        />
      )}
    </div>
  );
}

function WorldCupPayOptions({
  worldCupPayKind,
  onSelectKind,
  rosterSize,
  onRosterSizeChange,
  shareCents,
  hasRegistration,
}: {
  worldCupPayKind: WorldCupPayKind;
  onSelectKind: (kind: WorldCupPayKind) => void;
  rosterSize: number;
  onRosterSizeChange: (size: number) => void;
  shareCents: number;
  hasRegistration: boolean;
}) {
  const cardClass = (active: boolean) =>
    `dashboard-card p-5 text-left transition-all w-full ${
      active ? "ring-2 ring-brand border-brand" : "hover:border-border-token"
    }`;

  return (
    <div className="space-y-4 mb-8">
      <p className="text-sm text-zinc-400">
        Team fee is <strong className="text-zinc-200">$960</strong> total. Choose one option below.
      </p>

      <div className="grid grid-cols-1 gap-4">
        <button
          type="button"
          onClick={() => onSelectKind("team_full")}
          className={cardClass(worldCupPayKind === "team_full")}
        >
          <div className="flex items-start justify-between mb-3">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${
                worldCupPayKind === "team_full"
                  ? "bg-brand/20 text-brand"
                  : "bg-base text-zinc-400"
              }`}
            >
              Captain / full team
            </span>
            <Trophy
              size={20}
              className={worldCupPayKind === "team_full" ? "text-brand" : "text-zinc-600"}
            />
          </div>
          <p className="text-white font-semibold mb-1">Pay full team</p>
          <p className="text-zinc-400 text-sm mb-3">
            One payment covers the entire roster ($960 flat).
          </p>
          <p className="text-2xl font-bold text-white">
            {formatUsdFromCents(WORLD_CUP_TEAM_FEE_CENTS)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelectKind("team_share")}
          className={cardClass(worldCupPayKind === "team_share")}
        >
          <div className="flex items-start justify-between mb-3">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${
                worldCupPayKind === "team_share"
                  ? "bg-brand/20 text-brand"
                  : "bg-base text-zinc-400"
              }`}
            >
              Split with roster
            </span>
            <Users
              size={20}
              className={worldCupPayKind === "team_share" ? "text-brand" : "text-zinc-600"}
            />
          </div>
          <p className="text-white font-semibold mb-1">Pay my share</p>
          <p className="text-zinc-400 text-sm mb-3">
            $960 divided by your team size (8–12 players). Pick the same size your teammates use.
          </p>
          <div
            className="flex flex-wrap items-end gap-3"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div>
              <label htmlFor="rosterSize" className="block text-xs text-zinc-500 mb-1">
                Roster size
              </label>
              <select
                id="rosterSize"
                value={rosterSize}
                onChange={(e) => onRosterSizeChange(Number(e.target.value))}
                className="px-3 py-2 bg-surface-2 border border-border-token text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {WORLD_CUP_ROSTER_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} players
                  </option>
                ))}
              </select>
            </div>
            <p className="text-2xl font-bold text-white pb-0.5">
              {shareCents > 0 ? formatUsdFromCents(shareCents) : "—"}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelectKind("captain_paid_ack")}
          disabled={!hasRegistration}
          className={`${cardClass(worldCupPayKind === "captain_paid_ack")} ${
            !hasRegistration ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <span
              className={`inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${
                worldCupPayKind === "captain_paid_ack"
                  ? "bg-brand/20 text-brand"
                  : "bg-base text-zinc-400"
              }`}
            >
              No charge
            </span>
            <UserCheck
              size={20}
              className={
                worldCupPayKind === "captain_paid_ack" ? "text-brand" : "text-zinc-600"
              }
            />
          </div>
          <p className="text-white font-semibold mb-1">My captain already paid</p>
          <p className="text-zinc-400 text-sm">
            {hasRegistration
              ? "Your captain paid the $960 team fee. Confirm here so we can mark you paid without charging your card."
              : "Available after you complete registration and your waiver from your confirmation link."}
          </p>
        </button>
      </div>
    </div>
  );
}
