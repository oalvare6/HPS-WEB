import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalList } from "@/components/legal/LegalPage";
import { getSiteSetting } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Privacy Policy | Houston Premier Soccer",
  description:
    "What Houston Premier Soccer collects when you register or pay, who we share it with, and how to get it removed.",
};

export default async function PrivacyPage() {
  const [contactEmail, address] = await Promise.all([
    getSiteSetting("contact.email"),
    getSiteSetting("footer.address"),
  ]);

  return (
    <LegalPage
      title="Privacy Policy"
      intro="What we collect when you register or pay, who else sees it, and how to get it removed."
      updated="August 12, 2026"
    >
      <LegalSection heading="Who we are">
        <p>
          Houston Premier Soccer runs 7v7 soccer events at {address}. This policy
          covers this website and the registration, waiver and payment steps that
          run through it. You can reach us any time at{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="text-brand hover:underline"
          >
            {contactEmail}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="What we collect">
        <p>We ask for the least we can and still run an event safely.</p>
        <LegalList
          items={[
            <>
              <strong className="text-white">When you register:</strong> first and
              last name, email address, phone number, date of birth, and the name
              and phone number of an emergency contact. You may also pick a team.
            </>,
            <>
              <strong className="text-white">When you sign a waiver:</strong> your
              signature and the completed waiver document. Waivers are handled by
              DocuSeal.
            </>,
            <>
              <strong className="text-white">When you pay:</strong> the amount,
              the date, whether it succeeded, and a reference number from Stripe.{" "}
              <strong className="text-white">
                Your card number never reaches us
              </strong>{" "}
              — payment happens on Stripe&apos;s own checkout page.
            </>,
            <>
              <strong className="text-white">If you create an account:</strong>{" "}
              signing in with Google or Apple tells us your email address and an
              account identifier. We do not receive your password.
            </>,
            <>
              <strong className="text-white">While you play:</strong> which team
              you are on, which events you signed up for, and match records such
              as goals scored.
            </>,
            <>
              <strong className="text-white">Automatically:</strong> ordinary web
              server logs, and a small count of registration steps reached (for
              example &ldquo;started the form&rdquo;, &ldquo;submitted the
              form&rdquo;) so we can tell where sign-up is breaking. There are no
              third-party advertising or analytics trackers on this site.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Why we need it">
        <LegalList
          items={[
            "Name, phone and email: to know who is playing and to reach you about your event.",
            "Date of birth: to place players in the right age group and to use the correct waiver.",
            "Emergency contact: so we can reach someone if you are hurt on the field.",
            "Waiver: to record that you understood the risks before playing.",
            "Payment records: to know who has paid, and for our accounting.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Children and youth players">
        <p>
          A parent or guardian registers a player under 18 and signs the youth
          waiver. In that case we collect the young player&apos;s name and date of
          birth, and the registering adult&apos;s contact details. We do not
          knowingly let anyone under 18 create an account on this site or pay us
          directly.
        </p>
        <p>
          If you are a parent or guardian and want your child&apos;s information
          removed, email{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="text-brand hover:underline"
          >
            {contactEmail}
          </a>{" "}
          and we will remove it, keeping only what we are required to keep.
        </p>
      </LegalSection>

      <LegalSection heading="Who else sees your information">
        <p>
          We do not sell your information, and we do not share it for
          advertising. We use a small number of companies to actually run the
          site. They only get what they need to do their job:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-white">Supabase</strong> — stores our
              database and handles sign-in.
            </>,
            <>
              <strong className="text-white">Stripe</strong> — takes payments.
              Stripe collects your card details directly under its own privacy
              policy.
            </>,
            <>
              <strong className="text-white">DocuSeal</strong> — sends and stores
              signed waivers.
            </>,
            <>
              <strong className="text-white">Vercel</strong> — hosts the website.
            </>,
          ]}
        />
        <p>
          We may also share information when the law requires it, or when it is
          necessary to deal with an injury or an insurance claim.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          Waivers stay valid for one year from the day they are signed, and we
          keep the signed document itself for as long as a claim could
          reasonably be brought. Payment and accounting records are kept for
          seven years. Everything else we keep while you are taking part in our
          events, and remove on request.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          Email{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="text-brand hover:underline"
          >
            {contactEmail}
          </a>{" "}
          and we will:
        </p>
        <LegalList
          items={[
            "tell you what we hold about you,",
            "correct anything wrong,",
            "delete what we are not required to keep, and",
            "stop sending you anything you did not ask for.",
          ]}
        />
        <p>
          Texas residents, and residents of states with their own privacy laws,
          have these rights by statute. We extend them to everyone because it is
          simpler and fairer.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Connections to this site are encrypted. Access to the admin dashboard
          is restricted to staff. No system is perfect, so please tell us at once
          if you think something is wrong with your account or your records.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          We only use the cookies needed to keep you signed in. There are no
          advertising or tracking cookies. See the{" "}
          <Link href="/cookies" className="text-brand hover:underline">
            cookie notice
          </Link>{" "}
          for the details.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If we change this policy we will update the date at the top of this
          page. If the change is significant, we will say so on the site.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
