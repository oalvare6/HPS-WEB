"use client";

import { useState } from "react";
import { AlertCircle, Banknote, CreditCard, ShieldCheck } from "lucide-react";
import { NO_TEAM, TeamSelect } from "@/components/register/TeamPicker";
import type { TeamOption } from "@/lib/tournaments";

/**
 * The returning-player path (REBUILD-PLAN §6, D5): recognized → "waiver good
 * through <date>" → pick team → pay.
 *
 * The whole point is what is *missing*. No name, email, phone, DOB or emergency
 * contact fields: we already hold all of that, and re-asking is what taught
 * players that signing up is a chore. One dropdown and one button.
 */
export function QuickJoinCard({
  tournamentId,
  tournamentTitle,
  teams,
  playerName,
  waiverExpiresAt,
  entryFeeLabel,
}: {
  tournamentId: string;
  tournamentTitle: string;
  teams: TeamOption[];
  playerName: string;
  waiverExpiresAt: string | null;
  entryFeeLabel: string | null;
}) {
  const [teamId, setTeamId] = useState(NO_TEAM);
  const [submitting, setSubmitting] = useState<"card" | "cash" | null>(null);
  const [error, setError] = useState("");

  /**
   * Both buttons join the roster; they differ only in what happens next.
   *
   * The join itself is the commitment, and it is identical either way — which
   * is the point. Before this there was one button, "Join and pay", so joining
   * and paying looked like a single indivisible act and anyone not ready to pay
   * had nothing to press.
   */
  const join = async (method: "card" | "cash") => {
    setError("");
    setSubmitting(method);
    try {
      const res = await fetch("/api/register/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, teamId: teamId || null }),
      });
      const data = (await res.json()) as {
        error?: string;
        payUrl?: string;
        payToken?: string;
        registrationId?: string;
      };

      if (!res.ok || !data.payUrl) {
        setError(data.error || "We couldn't add you to this roster. Please try again.");
        setSubmitting(null);
        return;
      }

      if (method === "card") {
        window.location.href = data.payUrl;
        return;
      }

      // Record the cash intent, then reload. This screen resolves state from
      // the server on every load, so the reload lands on the "you're on the
      // roster, cash due at the field" card without this component having to
      // reimplement it. A failure here is not worth blocking on — they are on
      // the roster, which is the part that mattered.
      if (data.registrationId && data.payToken) {
        await fetch("/api/register/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationId: data.registrationId,
            payToken: data.payToken,
            method: "cash",
          }),
        }).catch(() => {});
      }
      window.location.reload();
    } catch {
      setError("Network error. Check your connection and try again.");
      setSubmitting(null);
    }
  };

  const busy = submitting !== null;

  return (
    <div className="dashboard-card p-6 md:p-8 space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0">
          <ShieldCheck size={20} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">
            {playerName ? `Welcome back, ${playerName.split(" ")[0]}.` : "Welcome back."}
          </h2>
          <p className="text-sm text-zinc-400">
            {waiverExpiresAt ? (
              <>
                Your waiver is good through{" "}
                <span className="text-zinc-200">{formatDate(waiverExpiresAt)}</span> — nothing
                to sign.
              </>
            ) : (
              <>Your waiver is on file — nothing to sign.</>
            )}
          </p>
        </div>
      </div>

      <div className="border-t border-border-token pt-6 space-y-5">
        <p className="text-sm text-zinc-300">
          Joining <span className="text-white font-medium">{tournamentTitle}</span>
          {entryFeeLabel ? <span className="text-zinc-400"> · {entryFeeLabel}</span> : null}
        </p>

        {teams.length > 0 ? (
          <TeamSelect
            id="quick-team"
            value={teamId}
            onChange={setTeamId}
            teams={teams}
            disabled={busy}
          />
        ) : (
          <p className="text-xs text-zinc-500">
            Teams for this event aren&apos;t set up yet. We&apos;ll place you when they are.
          </p>
        )}

        {error && (
          <div
            className="flex gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => join("card")}
            disabled={busy}
            className="w-full btn-primary h-12 justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <CreditCard size={16} />
            {submitting === "card"
              ? "Adding you to the roster…"
              : `Join and pay${entryFeeLabel ? ` ${entryFeeLabel}` : ""} by card`}
          </button>

          <button
            type="button"
            onClick={() => join("cash")}
            disabled={busy}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-lg border border-border-token text-sm font-medium text-zinc-200 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Banknote size={16} />
            {submitting === "cash"
              ? "Saving your spot…"
              : "Join — I'll pay cash at the field"}
          </button>

          <p className="text-xs text-zinc-500 text-center">
            Both save your spot. Your waiver is what holds it, not the payment.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
