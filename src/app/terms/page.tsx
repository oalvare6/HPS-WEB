import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalList } from "@/components/legal/LegalPage";
import { getSiteSetting } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Terms of Service | Houston Premier Soccer",
  description:
    "The rules for registering, paying and playing at Houston Premier Soccer.",
};

export default async function TermsPage() {
  const [contactEmail, address] = await Promise.all([
    getSiteSetting("contact.email"),
    getSiteSetting("footer.address"),
  ]);

  return (
    <LegalPage
      title="Terms of Service"
      intro="The rules for registering, paying and playing with us."
      updated="August 12, 2026"
    >
      <LegalSection heading="Agreeing to these terms">
        <p>
          By registering for an event, paying an entry fee, or playing at our
          facility at {address}, you agree to these terms. If you are registering
          someone under 18, you are agreeing on their behalf as their parent or
          guardian.
        </p>
      </LegalSection>

      <LegalSection heading="Registering">
        <LegalList
          items={[
            "Give us accurate information. We use your phone number to reach you about your event, and your emergency contact if something goes wrong.",
            "One registration per player, per event. Every player on a roster registers individually, including the captain.",
            "A signed waiver is required before you play. A waiver is good for one year from the day it is signed.",
            "We may refuse or cancel a registration — for example if an event is full, if a player is in the wrong age group, or if the entry fee is not paid.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Paying">
        <LegalList
          items={[
            "Fees are shown on the event page and on the payment page before you pay.",
            "Payments are processed by Stripe. We never see or store your card number.",
            "Your place is not held until the fee for it has been paid.",
            <>
              Refunds and cancellations are covered by our{" "}
              <Link href="/refunds" className="text-brand hover:underline">
                refund policy
              </Link>
              .
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Playing: risk and conduct">
        <p>
          Soccer is a physical sport. Collisions, falls and injuries happen even
          when everyone does the right thing. You play at your own risk, and the
          waiver you sign says so in full.
        </p>
        <p>On and around the field, we expect you to:</p>
        <LegalList
          items={[
            "follow the referee's decisions and our staff's instructions,",
            "treat other players, referees and staff with respect,",
            "wear appropriate footwear and shin guards,",
            "stay off the field if you are injured or unwell, and",
            "keep the facility clean and undamaged.",
          ]}
        />
        <p>
          We may remove a player or a team from an event for violence, threats,
          abuse, harassment, damage to the facility, or repeated unsporting
          conduct. Removal for these reasons does not earn a refund.
        </p>
      </LegalSection>

      <LegalSection heading="Fielding a legal team">
        <p>
          Play the players on your roster. Using an unregistered player, a player
          without a valid waiver, or a player registered to a different team can
          cost your team the match and may remove you from the competition. If
          you need a guest player for a night, ask us first.
        </p>
      </LegalSection>

      <LegalSection heading="Schedules, weather and cancellations">
        <p>
          We publish schedules in advance and change them as little as we can,
          but kick-off times, groupings and match dates can move. Lightning,
          unsafe field conditions and facility problems can force us to postpone
          or cancel. When we cancel a match we will reschedule it where we
          reasonably can; where we cannot, the{" "}
          <Link href="/refunds" className="text-brand hover:underline">
            refund policy
          </Link>{" "}
          applies.
        </p>
      </LegalSection>

      <LegalSection heading="Photos and video">
        <p>
          We take photos and video at our events and may use them to promote
          Houston Premier Soccer. If you would rather not appear, tell us at{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="text-brand hover:underline"
          >
            {contactEmail}
          </a>{" "}
          and we will do our best to keep you out of what we publish and will
          remove any specific image you point us to.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          If you create an account, keep it to yourself and tell us if someone
          else gets into it. You are responsible for what happens under your
          account. We may suspend an account being used to abuse the site or
          other people.
        </p>
      </LegalSection>

      <LegalSection heading="This website">
        <p>
          The content on this site — our name, badge, photos and text — belongs
          to us. Please do not copy it for your own commercial use. Standings,
          scores and schedules are published in good faith and may be corrected
          when we spot a mistake.
        </p>
      </LegalSection>

      <LegalSection heading="Limits">
        <p>
          Except where the law does not allow it to be limited, our
          responsibility to you for anything connected with an event is limited
          to the amount you paid us for that event. We are not responsible for
          personal property lost, stolen or damaged at the facility.
        </p>
        <p>
          Nothing here limits responsibility for death or personal injury caused
          by our negligence where the law does not permit that limit.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          These terms are governed by the laws of the State of Texas, and any
          dispute belongs in the state or federal courts located in Harris
          County, Texas.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and contact">
        <p>
          We may update these terms; the date at the top shows when they last
          changed, and the version in force is the one published when you
          register. Questions go to{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="text-brand hover:underline"
          >
            {contactEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
