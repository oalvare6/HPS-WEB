import Link from "next/link";
import { Section, SectionHeader } from "@/components/shared/section";
import { EventCard } from "@/components/shared/event-card";
import { ArrowRight, Calendar } from "lucide-react";

export default function EventsPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-zinc-950 text-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Events
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Leagues and tournaments for youth and adult players. 
            Organized competition at the Houston Premier Soccer facility.
          </p>
        </div>
      </section>

      {/* Leagues Section */}
      <Section>
        <SectionHeader
          title="Leagues"
          subtitle="Seasonal play with consistent scheduling."
        />

        {/* Coming Soon State */}
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-8 md:p-12">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-zinc-200 rounded-lg flex items-center justify-center flex-shrink-0">
              <Calendar size={24} className="text-zinc-500" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-zinc-900 mb-2">
                League Registration Opening Soon
              </h3>
              <p className="text-zinc-600 mb-4 max-w-xl">
                We&apos;re finalizing the upcoming league seasons for youth and adult divisions. 
                Contact us to get on the notification list.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 text-zinc-900 font-medium hover:gap-3 transition-all"
              >
                Get notified
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>

        {/* League Info */}
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div className="p-6 border border-zinc-200 rounded-lg">
            <h3 className="font-semibold text-zinc-900 mb-2">Youth Leagues</h3>
            <p className="text-zinc-600 text-sm">
              Development-focused leagues for U8 through U18 age groups. 
              Seasonal play with balanced competition.
            </p>
          </div>
          <div className="p-6 border border-zinc-200 rounded-lg">
            <h3 className="font-semibold text-zinc-900 mb-2">Adult Leagues</h3>
            <p className="text-zinc-600 text-sm">
              Recreational and competitive divisions for players 18+. 
              Evening and weekend scheduling.
            </p>
          </div>
        </div>
      </Section>

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-6">
        <hr className="border-zinc-200" />
      </div>

      {/* Tournaments Section */}
      <Section>
        <SectionHeader
          title="Tournaments"
          subtitle="Competitive events throughout the year."
        />

        {/* Upcoming Tournaments - Coming Soon */}
        <div className="mb-12">
          <h3 className="text-lg font-semibold text-zinc-900 mb-4">Upcoming</h3>
          <div className="bg-zinc-950 text-white rounded-lg p-8 text-center">
            <p className="text-zinc-400 mb-4">
              Next tournament dates will be announced here. Check back soon.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-white text-zinc-900 px-5 py-2.5 font-medium rounded-md hover:bg-zinc-100 transition-colors"
            >
              Contact for info
            </Link>
          </div>
        </div>

        {/* Past Tournaments */}
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-4">Past Tournaments</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <EventCard
              title="Spring Classic 2025"
              date="March 15-16, 2025"
              division="Youth U10-U14"
              teamCount="24 Teams"
              status="completed"
            />
            <EventCard
              title="MLK Weekend Cup"
              date="January 18-19, 2025"
              division="Open Division"
              teamCount="16 Teams"
              status="completed"
            />
            <EventCard
              title="Fall Showdown"
              date="November 9-10, 2024"
              division="Adults 18+"
              teamCount="20 Teams"
              status="completed"
            />
            <EventCard
              title="Back to School Cup"
              date="August 24-25, 2024"
              division="Youth All Ages"
              teamCount="32 Teams"
              status="completed"
            />
            <EventCard
              title="Summer Showcase"
              date="June 22-23, 2024"
              division="Competitive Youth"
              teamCount="28 Teams"
              status="completed"
            />
            <EventCard
              title="Memorial Day Invitational"
              date="May 25-26, 2024"
              division="All Divisions"
              teamCount="36 Teams"
              status="completed"
            />
          </div>
        </div>
      </Section>

      {/* CTA */}
      <Section className="bg-zinc-50">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-semibold text-zinc-900 mb-4">
            Want to Participate?
          </h2>
          <p className="text-zinc-600 mb-8">
            Register to get updates on upcoming leagues and tournaments. 
            We&apos;ll notify you when registration opens.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-zinc-900 text-white px-6 py-3 font-medium rounded-md hover:bg-zinc-800 transition-colors"
            >
              Register
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 border border-zinc-300 text-zinc-900 px-6 py-3 font-medium rounded-md hover:bg-zinc-50 transition-colors"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
