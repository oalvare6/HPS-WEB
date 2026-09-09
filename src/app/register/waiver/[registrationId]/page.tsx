import { redirect } from "next/navigation";
import { getCurrentPlayer } from "@/lib/player-auth";
import { loadWaiverSigningContext } from "@/lib/waiver-sign-server";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import {
  WaiverLinkUnavailable,
  WaiverSigningScreen,
} from "@/components/register/WaiverSigningScreen";

export const dynamic = "force-dynamic";

type Params = Promise<{ registrationId: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata = {
  title: "Sign your waiver | Houston Premier Soccer",
  robots: { index: false, follow: false },
};

/**
 * The in-app waiver for a SIGNED-IN player's own registration — the fallback
 * `/register` offers when a row never got a DocuSeal submission.
 *
 * Authorisation is the Supabase session: the registration's `contact_id`
 * must be the signed-in contact. There is no token in the URL any more; the
 * 90-day HMAC link this page used to accept was retired in Stage 1.3. An
 * unauthorised visitor sees the same card whether or not the id exists.
 */
export default async function WaiverSignPage({ params }: { params: Params }) {
  const { registrationId } = await params;
  const path = `/register/waiver/${encodeURIComponent(registrationId)}`;

  if (!UUID_RE.test(registrationId)) {
    return notYours();
  }

  const player = await getCurrentPlayer();
  if (!player) {
    return (
      <section className="bg-surface text-white min-h-[60vh] flex items-center">
        <div className="max-w-lg mx-auto px-6 py-16 space-y-5">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold">Sign in to sign your waiver</h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Sign in with the account you registered with and we&apos;ll bring you
              straight back here. Or open the link we emailed you from the event&apos;s
              pay page.
            </p>
          </div>
          <OAuthButtons nextPath={path} />
        </div>
      </section>
    );
  }

  const context = await loadWaiverSigningContext(registrationId);
  if (!context || !context.contactId || context.contactId !== player.contact.id) {
    return notYours();
  }

  // Already signed: nothing to do here. Send them to their status card.
  if (context.alreadySigned) {
    redirect(
      context.eventSlug
        ? `/register?tournament=${encodeURIComponent(context.eventSlug)}`
        : "/me"
    );
  }

  const nextHref = context.eventSlug
    ? `/register?tournament=${encodeURIComponent(context.eventSlug)}`
    : "/me";

  return (
    <WaiverSigningScreen
      context={context}
      endpoint={`/api/registrations/${encodeURIComponent(registrationId)}/waiver-sign`}
      nextHref={nextHref}
    />
  );
}

function notYours() {
  return (
    <WaiverLinkUnavailable
      title="We couldn't open that waiver"
      body="This link isn't for a registration on your account. Sign in with the account you registered with, or request a fresh link from the event's pay page."
      href="/events"
      label="View events"
    />
  );
}
