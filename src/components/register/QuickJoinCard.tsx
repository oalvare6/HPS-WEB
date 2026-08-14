"use client";

import { useState } from "react";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  Check,
  CreditCard,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { NO_TEAM, TeamSelect } from "@/components/register/TeamPicker";
import type { PaymentMethodChoice } from "@/lib/payment-method";
import type { TeamOption } from "@/lib/tournaments";
import type { OpenPlayFreeEntryNotice } from "@/lib/open-play-attendance";

/**
 * The returning-player path (REBUILD-PLAN §6, D5): recognized → "waiver good
 * through <date>" → check the details → say how you're paying → confirm.
 *
 * ## What is missing, and why
 *
 * No name, email, phone, DOB or emergency contact fields: we already hold all of
 * that, and re-asking is what taught players that signing up is a chore.
 *
 * ## What is deliberately NOT one tap
 *
 * This screen used to be two buttons — "Join and pay by card" and "Join — I'll
 * pay cash at the field" — and **either one wrote the roster row on the first
 * press.** Card then bounced straight to Stripe, so anyone who had a second
 * thought at the checkout was already, permanently, on the roster: unpaid, with
 * no way off it. The operator's report: *"a lot of people will click the
 * register and not even pay or select payment ... i dont want ppl to sign up if
 * they havent commited."*
 *
 * So joining is now two deliberate actions — pick a method, then confirm — and
 * nothing at all is written until the second one. The line under the button says
 * so plainly, because a player who is not sure whether they signed up is the
 * state this whole screen exists to prevent.
 *
 * Fewer taps was never the goal. Knowing what you just did was.
 */
export function QuickJoinCard({
  tournamentId,
  tournamentTitle,
  teams,
  playerName,
  waiverExpiresAt,
  entryFeeLabel,
  feeLabel,
  showTeams,
  whenLabel,
  freeEntry,
}: {
  tournamentId: string;
  tournamentTitle: string;
  teams: TeamOption[];
  playerName: string;
  waiverExpiresAt: string | null;
  /** `"$15.00"`, or null when the event has no fee configured. */
  entryFeeLabel: string | null;
  /** "Door price" for an open play night, "Entry fee" for a tournament. */
  feeLabel: string;
  /**
   * Whether this event has teams at all. False for open play, where sides are
   * made on the night — asking a Friday-night player to pick one, or telling
   * them "teams aren't set up yet", is describing a tournament they didn't
   * sign up for.
   */
  showTeams: boolean;
  /** "Friday, August 14 · 7:00 PM – 9:00 PM", or null when undated. */
  whenLabel: string | null;
  /**
   * Set when this person walks in free (D7). A **display hint only** — the
   * server re-derives the entitlement at write time and is the sole authority
   * on what anyone is charged. If this is wrong in the generous direction the
   * join route still charges them; if it is wrong in the mean direction they
   * are still comped. It exists so the screen stops asking an entitled player
   * how they intend to settle a fee they do not owe.
   */
  freeEntry: OpenPlayFreeEntryNotice | null;
}) {
  const [teamId, setTeamId] = useState(NO_TEAM);
  const [method, setMethod] = useState<PaymentMethodChoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // No fee configured means there is nothing to choose between, so the radios
  // would be a question with one answer. Confirm stands alone.
  //
  // Free entry is the same situation arrived at differently: there is nothing
  // to collect, so "how are you paying?" is a question with no true answer, and
  // both options would name a price this person does not owe.
  const asksForPayment = entryFeeLabel !== null && !freeEntry;
  const canConfirm = !submitting && (!asksForPayment || method !== null);

  const confirm = async () => {
    if (!canConfirm) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/register/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          teamId: showTeams ? teamId || null : null,
          // One request, not two. The old flow joined and then declared the
          // method separately, swallowing any failure of the second call — so a
          // cash player could land on the roster with no method recorded and the
          // owner would never know to expect cash from them.
          paymentMethod: method,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        payUrl?: string;
        settledFree?: boolean;
      };

      if (!res.ok || !data.payUrl) {
        setError(data.error || "We couldn't add you to this roster. Please try again.");
        setSubmitting(false);
        return;
      }

      /*
        D7: a comped open-play spot never reaches checkout, whatever the player
        picked. The server decides this — not `method`, and not anything else on
        this screen — because the entitlement is derived from their roster, not
        from what the browser claims. Sending them to `payUrl` here would ask a
        free player for $15, and Stripe rejects sub-$0.50 amounts anyway, so
        there is no "$0 session" fallback to take instead.
      */
      if (method === "card" && !data.settledFree) {
        window.location.href = data.payUrl;
        return;
      }

      // Cash, a free event, or free entry. Reload rather than render a confirmation here:
      // this screen resolves state from the server on every load, so the reload
      // lands on the real "you're on the roster" card — which now also carries
      // the way back off it — without this component reimplementing any of it.
      window.location.reload();
    } catch {
      setError("Network error. Check your connection and try again.");
      setSubmitting(false);
    }
  };

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

      {/*
        What they are about to commit to, stated before the commitment. The old
        card named the event in a single line of body text and put the price
        inside the button label, so the thing being agreed to was smaller on the
        page than the way of agreeing to it.
      */}
      <div className="rounded-lg border border-border-token bg-surface-2/50 p-4 space-y-2">
        <p className="text-base font-semibold text-white">{tournamentTitle}</p>
        {whenLabel && (
          <p className="flex items-center gap-2 text-sm text-zinc-300">
            <CalendarDays size={14} className="text-brand shrink-0" />
            {whenLabel}
          </p>
        )}
        {/*
          Free entry replaces the price rather than sitting next to it. Showing
          "Door price: $15.00" above "Free for you" states the thing they do not
          owe more prominently than the thing that is true, which is how a player
          ends up at the field expecting to hand over cash.
        */}
        {freeEntry ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
            <Ticket size={14} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden />
            <p className="text-sm text-emerald-100">
              <span className="font-semibold">Free for you.</span>{" "}
              {freeEntry.viaTournamentTitle
                ? `You're on the ${freeEntry.viaTournamentTitle} roster, so there's nothing to pay at the door.`
                : `You're on a qualifying tournament roster, so there's nothing to pay at the door.`}
              {entryFeeLabel ? ` Normally ${entryFeeLabel}.` : ""}
            </p>
          </div>
        ) : entryFeeLabel ? (
          <p className="text-sm text-zinc-300">
            {feeLabel}: <span className="text-white font-medium">{entryFeeLabel}</span>
          </p>
        ) : null}
      </div>

      <div className="border-t border-border-token pt-6 space-y-5">
        {showTeams && teams.length > 0 && (
          <TeamSelect
            id="quick-team"
            value={teamId}
            onChange={setTeamId}
            teams={teams}
            disabled={submitting}
          />
        )}

        {asksForPayment && (
          <fieldset className="space-y-3" disabled={submitting}>
            <legend className="text-sm font-semibold text-zinc-200 mb-1">
              How are you paying?
            </legend>
            <MethodOption
              checked={method === "card"}
              onSelect={() => setMethod("card")}
              icon={<CreditCard size={16} />}
              label={`Pay ${entryFeeLabel} now by card`}
              hint="Takes you to checkout after you confirm."
            />
            <MethodOption
              checked={method === "cash"}
              onSelect={() => setMethod("cash")}
              icon={<Banknote size={16} />}
              label={`I'll pay ${entryFeeLabel} cash at the field`}
              hint="Nothing to pay now — hand it over on the night."
            />
          </fieldset>
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
            onClick={confirm}
            disabled={!canConfirm}
            className="w-full btn-primary h-12 justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={16} />
            {submitting ? "Saving your spot…" : "Confirm my spot"}
          </button>

          <p className="text-xs text-zinc-500 text-center">
            {asksForPayment && method === null
              ? "Pick how you're paying to confirm."
              : "You're not signed up until you press Confirm."}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * A radio rendered as a full-width card.
 *
 * A real `<input type="radio">` sits underneath — the whole row is the label, so
 * it is one big tap target on a phone at the field, while keyboard and screen
 * reader users get the native radio group behaviour that a div with an onClick
 * would have thrown away.
 */
function MethodOption({
  checked,
  onSelect,
  icon,
  label,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
        checked
          ? "border-brand bg-brand/10"
          : "border-border-token hover:border-zinc-500"
      }`}
    >
      {/*
        `accent-[var(--accent)]`, not `--brand`: globals.css stores `--brand` as
        a bare RGB triple ("34 211 238") for Tailwind's `rgb(var(--brand) / a)`
        syntax, so using it directly as a colour yields nothing. `--accent` is
        the rgb() form of the same value.
      */}
      <input
        type="radio"
        name="payment-method"
        checked={checked}
        onChange={onSelect}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium text-white">
          <span className={checked ? "text-brand" : "text-zinc-400"}>{icon}</span>
          {label}
        </span>
        <span className="block text-xs text-zinc-400 mt-0.5">{hint}</span>
      </span>
    </label>
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
