import Link from "next/link";
import { CheckCircle2, Clock, PenLine, RefreshCw } from "lucide-react";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { SavedTeamPicker } from "@/components/register/TeamPicker";
import { PaymentChoice } from "@/components/register/PaymentChoice";
import { CancelSpotButton } from "@/components/register/CancelSpotButton";
import type { TeamOption } from "@/lib/tournaments";

/**
 * The "we already know where you stand" states of the signup screen.
 *
 * These exist so a player who is already on the roster never sees a sign-up
 * form again. Before this, the only way to find out you were already registered
 * was to fill the whole form a second time, or to type your email into a
 * separate `/pay` screen that spoke a different language about the same event.
 *
 * Server components on purpose — every link here is minted server-side with a
 * signed token, so there is nothing for the client to compute.
 */

const cardClass = "dashboard-card p-6 md:p-8 space-y-5";

export function AlreadyPaidCard({
  tournamentTitle,
  tournamentId,
  teams,
  teamId,
  registrationId,
  payToken,
}: {
  tournamentTitle: string;
  tournamentId: string;
  teams: TeamOption[];
  teamId: string | null;
  registrationId: string;
  payToken: string;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
          <CheckCircle2 size={20} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">You&apos;re all set</h2>
          <p className="text-sm text-zinc-400">
            You&apos;re on the roster for{" "}
            <span className="text-zinc-200">{tournamentTitle}</span> and paid up.
            See you on the field.
          </p>
        </div>
      </div>

      {/*
        Still offered after payment. Paying does not decide your team, and the
        alternative is a paid player with nowhere to be on match day — which is
        most of the roster right now.
      */}
      <div className="border-t border-border-token pt-5">
        <SavedTeamPicker
          tournamentId={tournamentId}
          teams={teams}
          initialTeamId={teamId}
        />
      </div>

      <div className="border-t border-border-token pt-5 space-y-3">
        <p className="text-sm text-zinc-400">
          Schedules and last-minute changes go out on WhatsApp.
        </p>
        <WhatsAppCommunityLinkFromSite variant="button" />
        <p className="text-xs text-zinc-500 text-center">
          <Link href="/me" className="underline underline-offset-2">
            View my registrations
          </Link>
        </p>
      </div>

      {/*
        Offered here too, not only on the unpaid card. "Paid" covers the owner
        ticking someone off on the Roster after they hand over cash, and that
        player has as much reason to drop out as anyone. The route decides:
        it refuses only when a Stripe charge actually exists, because that is
        the case that owes a refund.
      */}
      <div className="border-t border-border-token pt-5">
        <CancelSpotButton
          registrationId={registrationId}
          payToken={payToken}
          eventTitle={tournamentTitle}
        />
      </div>
    </div>
  );
}

export function OwesPaymentCard({
  tournamentTitle,
  tournamentId,
  payHref,
  entryFeeLabel,
  teams,
  teamId,
  teamName,
  payingCash,
  registrationId,
  payToken,
}: {
  tournamentTitle: string;
  tournamentId: string;
  payHref: string;
  entryFeeLabel: string | null;
  teams: TeamOption[];
  teamId: string | null;
  teamName: string | null;
  /** They have already told us they're bringing cash. */
  payingCash: boolean;
  registrationId: string;
  payToken: string;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0">
          <CheckCircle2 size={20} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">
            You&apos;re signed up for {tournamentTitle}
          </h2>
          <p className="text-sm text-zinc-400">
            {teamName ? (
              <>
                Your spot is confirmed and you&apos;re playing for{" "}
                <span className="text-zinc-200">{teamName}</span>.
              </>
            ) : (
              <>
                Your spot is confirmed and your waiver is done. Pick your team
                below.
              </>
            )}
          </p>
        </div>
      </div>

      {/*
        This is the screen a returning player actually lands on, and until now it
        had no team control at all — so nobody who was already signed up was ever
        asked which team they were on, however many teams the event had.
      */}
      <div className="border-t border-border-token pt-5">
        <SavedTeamPicker
          tournamentId={tournamentId}
          teams={teams}
          initialTeamId={teamId}
        />
      </div>

      <div className="border-t border-border-token pt-5 space-y-3">
        {/*
          Deliberately framed as outstanding, not as a barrier. Players sign up
          weeks before they pay and several pay cash at the field; the roster
          already tracks who owes what, so nothing here needs to block them.
          What this must never do is imply their spot is contingent on paying
          today — that misread is what sent people back through signup twice.

          Card and cash are two buttons of equal weight (D14). This used to be a
          pay button with "or pay later" as a grey caption underneath, which is
          why the only exit anybody found was a card payment.
        */}
        <PaymentChoice
          registrationId={registrationId}
          payToken={payToken}
          payHref={payHref}
          entryFeeLabel={entryFeeLabel}
          initialMethod={payingCash ? "cash" : null}
        />
        <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 text-center">
          <Clock size={12} />
          You can settle up from this page any time before your first match.
        </p>
      </div>

      {/*
        The exit. Until this existed the card was payment controls and nothing
        else, so a player who couldn't make it had no way to say so — the
        operator's report was that the screen "wants me to pay" with no other
        move available. Deliberately understated and behind a confirm: it is the
        door marked exit, not a third payment option.
      */}
      <div className="border-t border-border-token pt-5">
        <CancelSpotButton
          registrationId={registrationId}
          payToken={payToken}
          eventTitle={tournamentTitle}
        />
      </div>
    </div>
  );
}

export function NeedsWaiverCard({
  tournamentTitle,
  waiverHref,
  isExternalWaiver = false,
  recheckHref,
}: {
  tournamentTitle: string;
  waiverHref: string;
  /** True when the link leaves the site for DocuSeal. */
  isExternalWaiver?: boolean;
  /**
   * Somewhere to send a player who insists they already signed. The page that
   * renders this re-checks with DocuSeal on every load, so "check again" is
   * just this screen again — no extra endpoint, and no way for the button to
   * disagree with the page.
   */
  recheckHref?: string;
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
          <PenLine size={20} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">
            One thing left — your waiver
          </h2>
          <p className="text-sm text-zinc-400">
            You&apos;re on the roster for{" "}
            <span className="text-zinc-200">{tournamentTitle}</span>, but we
            don&apos;t have your signed waiver yet. It takes about a minute, and
            it covers you for the next 365 days.
          </p>
        </div>
      </div>
      <div className="border-t border-border-token pt-5 space-y-3">
        <Link
          href={waiverHref}
          {...(isExternalWaiver
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className="btn-primary w-full h-12 inline-flex items-center justify-center gap-2"
        >
          <PenLine size={16} />
          Sign my waiver
        </Link>

        {/*
          The loop this breaks: sign in DocuSeal, come back, get told to sign
          again. That happened to every player for a month because the webhook
          that was supposed to report the signature was rejecting every
          delivery. Reloading this page now asks DocuSeal directly.
        */}
        {recheckHref && (
          <Link
            href={recheckHref}
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg border border-border-token text-sm text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors"
          >
            <RefreshCw size={14} />
            I already signed — check again
          </Link>
        )}

        <p className="text-xs text-zinc-500 text-center">
          You can&apos;t play without it — no exceptions, for everyone&apos;s sake.
        </p>
      </div>
    </div>
  );
}

export function ClosedCard({ tournamentTitle }: { tournamentTitle: string | null }) {
  return (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-white">
        Sign-ups aren&apos;t open right now
      </h2>
      <p className="text-sm text-zinc-400">
        {tournamentTitle
          ? `${tournamentTitle} isn't taking sign-ups at the moment.`
          : "Nothing is open for sign-ups at the moment."}{" "}
        New events go up regularly — check the events page or join WhatsApp and
        we&apos;ll tell you when the next one opens.
      </p>
      <div className="flex flex-col gap-3 pt-2">
        <Link href="/events" className="btn-primary w-full justify-center">
          See all events
        </Link>
        <WhatsAppCommunityLinkFromSite variant="button" />
      </div>
    </div>
  );
}
