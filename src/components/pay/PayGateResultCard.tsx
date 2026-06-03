"use client";

import Link from "next/link";
import { CheckCircle2, Shield, User } from "lucide-react";
import { WhatsAppCommunityLink } from "@/components/shared/WhatsAppCommunityLink";
import type {
  PayEligibilitySuccessBody,
  PayEligibilityWaiverType,
} from "@/lib/pay-eligibility-types";

export type PayGateResultTournament = {
  id: string;
  title: string;
  slug: string;
};

function registerHref(slug: string, waiverType: PayEligibilityWaiverType) {
  return `/register?tournament=${encodeURIComponent(slug)}&type=${waiverType}`;
}

const cardClass =
  "rounded-xl border border-border-token bg-surface-2 p-6 md:p-8 space-y-5";

export function PayGateResultCard({
  result,
  tournament,
  whatsappUrl,
  waiverType,
  onRetryType,
  isLoggedIn,
}: {
  result: PayEligibilitySuccessBody;
  tournament: PayGateResultTournament;
  whatsappUrl: string;
  waiverType: PayEligibilityWaiverType;
  /** Only meaningful for the client gate; omit when rendered from the server page. */
  onRetryType?: () => void;
  isLoggedIn: boolean;
}) {
  const title = tournament.title;
  const regHref = registerHref(tournament.slug, waiverType);

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
    const heading = isLoggedIn ? "One more step to enroll" : "Register for this event";
    const body = isLoggedIn
      ? `Your waiver is on file, but we need a couple more details (emergency contact) to enroll you in ${title}. Complete the short form, then return here to pay.`
      : `Your waiver is on file. Register for ${title} to join the roster, then return here to pay.`;
    return (
      <div className="max-w-lg mx-auto px-6 py-10 md:py-14">
        <div className={cardClass}>
          <Shield className="w-10 h-10 text-brand" aria-hidden />
          <h2 className="text-xl font-semibold text-white">{heading}</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
          <div className="flex flex-col gap-3">
            <Link href={regHref} className="btn-primary w-full justify-center">
              {isLoggedIn ? "Finish enrolling" : "Register for this event"}
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
      ? "Sign your facility waiver first"
      : isNoWaiver
        ? "Waiver required"
        : "Complete your waiver";

    const body = isUnknown
      ? `We don't have a signed waiver for this email. Complete the short facility waiver for ${title}, then come back here to pay. Questions? Join our WhatsApp community.`
      : isNoWaiver
        ? `We don't have a valid ${waiverType} waiver on file for this email. Complete the facility waiver for ${title}, then return here to pay.`
        : `Your registration for ${title} still needs a signed waiver. Complete the waiver, then return here to pay.`;

    return (
      <div className="max-w-lg mx-auto px-6 py-10 md:py-14">
        <div className={cardClass}>
          <User className="w-10 h-10 text-amber-400" aria-hidden />
          <h2 className="text-xl font-semibold text-white">{heading}</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
          <div className="flex flex-col gap-3">
            <Link href={regHref} className="btn-primary w-full justify-center">
              {isUnknown ? "Start facility waiver" : "Sign your waiver"}
            </Link>
            <WhatsAppCommunityLink href={whatsappUrl} variant="button" />
          </div>
          {onRetryType && (
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
