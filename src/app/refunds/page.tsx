import type { Metadata } from "next";
import { LegalPage, LegalSection, LegalList } from "@/components/legal/LegalPage";
import { getSiteSetting } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Refund Policy | Houston Premier Soccer",
  description:
    "When entry fees, guest fees and drop-in fees are refundable at Houston Premier Soccer, and how to ask for one.",
};

export default async function RefundsPage() {
  const contactEmail = await getSiteSetting("contact.email");
  const mailto = (
    <a href={`mailto:${contactEmail}`} className="text-brand hover:underline">
      {contactEmail}
    </a>
  );

  return (
    <LegalPage
      title="Refund Policy"
      intro="When we give money back, when we don't, and how to ask."
      updated="August 12, 2026"
    >
      <LegalSection heading="The short version">
        <p>
          If we cancel and cannot reschedule, you get your money back. If you
          change your mind early, you get your money back. Once a season is
          under way and your place has been held, we generally cannot refund it —
          the field, the referees and the schedule are already paid for.
        </p>
      </LegalSection>

      <LegalSection heading="If we cancel">
        <LegalList
          items={[
            "We cancel an event before it starts — full refund, automatically, to the card you paid with.",
            "We cancel matches mid-season and cannot reschedule them — a proportional refund for the matches lost.",
            "A match is called off for weather or unsafe field conditions and is rescheduled — no refund, because you still get the match.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="If you cancel">
        <LegalList
          items={[
            <>
              <strong className="text-white">
                More than 7 days before the first match:
              </strong>{" "}
              full refund.
            </>,
            <>
              <strong className="text-white">
                Within 7 days of the first match:
              </strong>{" "}
              we can usually move your fee to a future event, but we cannot
              refund it. By then your place has been counted into the schedule.
            </>,
            <>
              <strong className="text-white">Once the event has started:</strong>{" "}
              no refund, including for injury or for missing matches. If you are
              injured, talk to us — we will do what we reasonably can.
            </>,
            <>
              <strong className="text-white">
                Guest and drop-in fees for a single night:
              </strong>{" "}
              refundable up to the start of that night&apos;s play.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Team fees">
        <p>
          Where a captain pays for a whole team, the refund goes back to whoever
          paid. Where players each paid their own share, each share is refunded
          separately. If a team withdraws after the schedule is published, its
          fee is not refundable, because the other teams&apos; fixtures have
          already been built around it.
        </p>
      </LegalSection>

      <LegalSection heading="Removal for conduct">
        <p>
          A player or team removed for violence, threats, abuse, harassment or
          damage to the facility is not refunded.
        </p>
      </LegalSection>

      <LegalSection heading="How to ask">
        <p>
          Email {mailto} with the player&apos;s name, the event, and roughly when
          you paid. We aim to answer within three business days. Approved refunds
          go back to the original card through Stripe and usually appear within
          five to ten business days, depending on your bank.
        </p>
        <p>
          If you think a charge is wrong, please contact us before disputing it
          with your bank — it is almost always faster to fix directly.
        </p>
      </LegalSection>

      <LegalSection heading="Exceptions">
        <p>
          This policy is our normal practice, not a limit on your rights under
          the law. If your situation is genuinely unusual, tell us at {mailto} and
          we will look at it properly.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
