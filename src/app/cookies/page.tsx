import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { getSiteSetting } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Cookie Notice | Houston Premier Soccer",
  description:
    "Houston Premier Soccer uses only the cookies needed to keep you signed in. No advertising or tracking cookies.",
};

/**
 * Deliberately short, because the honest answer is short: the site sets no
 * advertising or analytics cookies and loads no third-party tracking scripts.
 * Padding that out with a consent-banner-shaped wall of text would misrepresent
 * what actually happens.
 */
export default async function CookiesPage() {
  const contactEmail = await getSiteSetting("contact.email");

  return (
    <LegalPage
      title="Cookie Notice"
      intro="We use the cookies that keep you signed in, and nothing else."
      updated="August 12, 2026"
    >
      <LegalSection heading="The whole story">
        <p>
          This site does not use advertising cookies, does not use third-party
          analytics, and does not load tracking scripts from other companies.
          There is no consent banner because there is nothing to consent to
          beyond the cookies that make signing in work.
        </p>
      </LegalSection>

      <LegalSection heading="What we actually set">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-border-token rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-surface-2 text-left">
                <th className="px-4 py-3 font-semibold text-white">Cookie</th>
                <th className="px-4 py-3 font-semibold text-white">
                  What it does
                </th>
                <th className="px-4 py-3 font-semibold text-white">
                  How long it lasts
                </th>
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-t border-border-token">
                <td className="px-4 py-3 font-mono text-xs">sb-…</td>
                <td className="px-4 py-3">
                  Keeps you signed in to your player account after you sign in
                  with Google or Apple.
                </td>
                <td className="px-4 py-3">
                  Until you sign out or it expires.
                </td>
              </tr>
              <tr className="border-t border-border-token">
                <td className="px-4 py-3 font-mono text-xs">admin_token</td>
                <td className="px-4 py-3">
                  Keeps our own staff signed in to the admin dashboard. It is
                  never set for regular visitors.
                </td>
                <td className="px-4 py-3">
                  Until sign-out or expiry.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Both are strictly necessary: without them, signing in would not work
          at all.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies set by other companies">
        <p>
          When you pay, you are taken to Stripe&apos;s own checkout page, and
          when you sign a waiver you are taken to DocuSeal. Those companies set
          their own cookies on their own pages under their own policies. We do
          not control them and we do not receive anything from them beyond the
          result — that you paid, or that you signed.
        </p>
      </LegalSection>

      <LegalSection heading="Turning them off">
        <p>
          Your browser can block or delete cookies. If you block ours, you can
          still browse events, schedules and standings, but you will not be able
          to stay signed in to an account.
        </p>
      </LegalSection>

      <LegalSection heading="Questions">
        <p>
          Email{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="text-brand hover:underline"
          >
            {contactEmail}
          </a>
          , or read the{" "}
          <Link href="/privacy" className="text-brand hover:underline">
            privacy policy
          </Link>{" "}
          for the fuller picture of what we collect.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
