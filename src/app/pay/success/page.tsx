import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle,
  Home,
  Trophy,
} from "lucide-react";
import { ClaimAccountForm } from "@/components/pay/ClaimAccountForm";
import { normalizeEmail } from "@/lib/contacts";
import {
  getCurrentPlayer,
  hasAuthUserForEmail,
} from "@/lib/player-auth";
import { getStripe } from "@/lib/stripe";
import { recordCheckoutSessionPayment } from "@/lib/stripe-payments";
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { PaySuccessTracker } from "./PaySuccessTracker";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ session_id?: string; captain_ack?: string }>;

type VerifyState =
  | { status: "no_session" }
  | { status: "verified"; email: string | null }
  | { status: "verify_error"; message: string };

/**
 * Stripe Checkout success surface.
 *
 * Server-rendered so we can:
 *   - retrieve and idempotently record the Stripe session in one round-trip,
 *   - decide between three trailing UI states (claim card / "view
 *     registrations" / nothing) based on the player session and whether the
 *     email already has an `auth.users` row.
 *
 * Analytics still fire client-side via `<PaySuccessTracker />`. The
 * `/api/stripe/verify-session` route is intentionally left untouched —
 * other entry points may still call it, and the webhook is the
 * authoritative recorder.
 */
export default async function PaySuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { session_id: sessionId, captain_ack: captainAck } = await searchParams;
  const isCaptainAck = captainAck === "1";

  const verify = isCaptainAck
    ? ({ status: "no_session" } as const)
    : await verifyStripeSession(sessionId);
  const player = await getCurrentPlayer();

  const verifiedEmail =
    verify.status === "verified" ? verify.email : null;

  let claimEligible = false;
  if (!player && verifiedEmail) {
    claimEligible = !(await hasAuthUserForEmail(verifiedEmail));
  }

  const showError = verify.status === "verify_error";

  return (
    <>
      <section className="bg-base text-white py-12 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-3xl font-bold tracking-tight">
            {isCaptainAck ? "Confirmation Received" : "Payment Confirmed"}
          </h1>
        </div>
      </section>

      <section className="bg-surface min-h-[60vh] py-12 px-6">
        <div className="max-w-lg w-full mx-auto space-y-6">
          <div className="dashboard-card p-8 space-y-6 text-center">
            <div className="flex justify-center">
              {showError ? (
                <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <AlertTriangle size={36} className="text-yellow-400" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center">
                  <CheckCircle size={36} className="text-brand" />
                </div>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {isCaptainAck ? "Thanks — we received your confirmation" : "You're in!"}
              </h2>
              <p className="text-zinc-400">
                {isCaptainAck ? (
                  <>
                    You confirmed that your captain already paid the World Cup team
                    fee. Houston Premier Soccer will verify with your captain and mark
                    your registration paid — no charge was made today.
                  </>
                ) : (
                  <>
                    Your payment was successful. A confirmation receipt has been sent
                    to your email by Stripe.
                  </>
                )}
              </p>
              {showError && (
                <p className="text-yellow-400 text-sm mt-2">
                  Note: {verify.message} Your Stripe payment was still
                  processed. Please contact us if you need assistance.
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/events" className="btn-secondary justify-center">
                <Calendar size={16} />
                View Schedule
              </Link>
              <Link href="/" className="btn-primary justify-center">
                <Home size={16} />
                Back to Home
                <ArrowRight size={14} />
              </Link>
            </div>

            <div className="pt-2 border-t border-border-token/50">
              <p className="text-xs text-zinc-500 mb-3">
                Join our community for schedules, updates, and questions.
              </p>
              <WhatsAppCommunityLinkFromSite variant="card" />
            </div>
          </div>

          {player ? (
            <div className="dashboard-card p-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center mx-auto">
                <Trophy size={18} />
              </div>
              <h3 className="text-lg font-semibold text-white">
                Welcome back, {firstNameOrEmail(player)}.
              </h3>
              <p className="text-sm text-zinc-400">
                This receipt is already on your account. View your full
                registration history any time.
              </p>
              <Link
                href="/me"
                className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline justify-center"
              >
                View my registrations <ArrowRight size={14} />
              </Link>
            </div>
          ) : claimEligible && verifiedEmail ? (
            <ClaimAccountForm email={verifiedEmail} />
          ) : null}
        </div>
      </section>

      <PaySuccessTracker
        sessionId={sessionId ?? null}
        status={verify.status === "verified" ? "verified" : "skipped"}
      />
    </>
  );
}

async function verifyStripeSession(
  sessionId: string | undefined
): Promise<VerifyState> {
  if (!sessionId) return { status: "no_session" };

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid" || session.status !== "complete") {
      return {
        status: "verify_error",
        message: "We couldn't confirm payment status with Stripe.",
      };
    }

    const outcome = await recordCheckoutSessionPayment(session);
    if (outcome.status === "error") {
      return {
        status: "verify_error",
        message: "We couldn't fully record this payment internally.",
      };
    }

    const email = normalizeEmail(
      session.metadata?.email ?? session.customer_email ?? ""
    );
    return { status: "verified", email: email || null };
  } catch (err) {
    console.error("[pay/success] verifyStripeSession failed:", err);
    return {
      status: "verify_error",
      message: "We couldn't reach Stripe to verify the receipt.",
    };
  }
}

function firstNameOrEmail(player: NonNullable<
  Awaited<ReturnType<typeof getCurrentPlayer>>
>): string {
  const first = player.contact.first_name?.trim();
  if (first) return first;
  return player.email;
}
