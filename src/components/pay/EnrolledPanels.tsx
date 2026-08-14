"use client";

import Link from "next/link";
import { CalendarClock, CheckCircle2 } from "lucide-react";

/**
 * The two things a player needs to see on `/pay` that the payment form itself
 * cannot say: **you are already on the roster**, and **you do not have to pay
 * right now.**
 *
 * Why this exists: players sign up weeks before they pay, and several pay at
 * the field in cash. The flow used to end on a bare Stripe form, so the only
 * visible exit from signing up was a card payment — a player who wasn't ready
 * to pay closed the tab, and had no way to tell whether they had a spot. Their
 * registration row existed the whole time. The system knew; the player didn't.
 *
 * Nothing here changes payment state. `payment_status` stays `'pending'`, the
 * admin Roster keeps showing them as owing, and the by-team panel keeps
 * counting them. This is the missing half of a state the database already had.
 *
 * ⚠ **Both components must stay synchronous and dependency-free.** They render
 * beside `PayForm`, which sits behind a Suspense boundary because it calls
 * `useSearchParams()`. An earlier version of `PayLaterCard` embedded
 * `WhatsAppCommunityLinkFromSite` — an *async* server component that awaits a
 * site-settings query — and that suspension stranded the neighbouring
 * boundary's fallback `<template>`, so the Pay button never rendered at all.
 * Verified against a clean build. Do not add an awaiting child here.
 */

export function EnrolledBanner({
  tournamentTitle,
  teamName,
  isPaid,
}: {
  tournamentTitle: string | null;
  teamName: string | null;
  isPaid: boolean;
}) {
  return (
    <div className="dashboard-card p-5 md:p-6 mb-6 flex items-start gap-3 border-emerald-500/30 bg-emerald-500/5">
      <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
        <CheckCircle2 size={20} />
      </div>
      <div className="space-y-1 min-w-0">
        <h2 className="text-base font-semibold text-white">
          You&apos;re on the roster{tournamentTitle ? ` for ${tournamentTitle}` : ""}
        </h2>
        <p className="text-sm text-zinc-400">
          {teamName ? (
            <>
              Waiver signed, playing for{" "}
              <span className="text-zinc-200">{teamName}</span>.{" "}
            </>
          ) : (
            <>Waiver signed. </>
          )}
          {isPaid
            ? "You're paid up too — nothing left to do."
            : "Your spot is saved whether you pay now or later."}
        </p>
      </div>
    </div>
  );
}

export function PayLaterCard({
  statusHref,
  entryFeeLabel,
}: {
  /** Where the player checks their standing later. */
  statusHref: string;
  entryFeeLabel: string | null;
}) {
  return (
    <div className="dashboard-card p-5 md:p-6 mt-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-zinc-500/15 text-zinc-300 flex items-center justify-center shrink-0">
          <CalendarClock size={20} />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-white">
            Not paying today?
          </h3>
          <p className="text-sm text-zinc-400">
            That&apos;s fine — you&apos;re already signed up and on your team.
            We&apos;ll show {entryFeeLabel ? `${entryFeeLabel} ` : "the entry fee "}
            as outstanding until it&apos;s settled. You can pay here any time
            before your first match, or bring it to the field.
          </p>
        </div>
      </div>
      <Link
        href={statusHref}
        className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-border-token text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
      >
        I&apos;ll pay later — save my spot
      </Link>
      <p className="text-xs text-zinc-500 text-center">
        We&apos;ll keep your spot on the roster either way.
      </p>
    </div>
  );
}
