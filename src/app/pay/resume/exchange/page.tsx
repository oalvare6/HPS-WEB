import Link from "next/link";
import { looksLikeRawSecret } from "@/lib/resume-access";
import { ExchangeAutoSubmit } from "@/components/pay/ExchangeAutoSubmit";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Opening your registration | Houston Premier Soccer",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ t?: string }>;

/**
 * The magic-link landing page.
 *
 * Email clients and link scanners GET links before the player ever clicks
 * them. If the GET itself consumed the one-time token, the player's real click
 * would arrive at a dead link. So this page does nothing but render a form
 * that POSTs the token to /pay/resume/api/exchange — the consume is a POST, and
 * the token never survives into the final URL.
 */
export default async function ResumeExchangePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { t } = await searchParams;
  const token = looksLikeRawSecret(t) ? t : null;

  return (
    <section className="bg-surface text-white min-h-[60vh] flex items-center">
      <div className="max-w-lg mx-auto px-6 py-16 text-center space-y-5">
        {token ? (
          <>
            <h1 className="text-2xl font-semibold">Opening your registration…</h1>
            <p className="text-sm text-zinc-400">
              If nothing happens, press the button below.
            </p>
            <form method="post" action="/pay/resume/api/exchange" id="resume-exchange-form">
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="btn-primary inline-flex justify-center px-6">
                Continue
              </button>
            </form>
            <ExchangeAutoSubmit formId="resume-exchange-form" />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">This link isn&apos;t valid</h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Resume links are personal and expire after twenty minutes. Request a
              new one from the event&apos;s pay page.
            </p>
            <Link href="/events" className="btn-primary inline-flex justify-center px-6">
              View events
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
