import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, Trophy, Users, Calendar } from "lucide-react";
import { Section, SectionHeader } from "@/components/shared/section";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { EventCard } from "@/components/shared/event-card";

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative bg-zinc-950 text-white">
        <div className="max-w-6xl mx-auto px-6 py-24 md:py-32 lg:py-40">
          <div className="max-w-3xl">
            {/* Logo Badge */}
            <div className="mb-8">
              <Image
                src="/brand/hps-badge.png"
                alt="Houston Premier Soccer"
                width={120}
                height={120}
                className="w-24 h-24 md:w-32 md:h-32 invert"
                priority
              />
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Houston&apos;s Home for
              <br />
              Competitive Soccer
            </h1>

            {/* Subhead */}
            <p className="text-xl md:text-2xl text-zinc-400 mb-10 max-w-xl">
              Quality fields. Organized competition. A place to play.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/events"
                className="inline-flex items-center justify-center gap-2 bg-white text-zinc-900 px-6 py-3 font-medium rounded-md hover:bg-zinc-100 transition-colors"
              >
                View Events
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 border border-zinc-700 text-white px-6 py-3 font-medium rounded-md hover:bg-zinc-900 transition-colors"
              >
                Register
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* Facility Preview */}
      <Section className="pt-16 md:pt-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900 mb-6">
              The Facility
            </h2>
            <p className="text-lg text-zinc-600 leading-relaxed mb-6">
              Lighted turf fields built for the game. Our Houston facility is configured 
              for 5v5, 7v7, and 11v11 formats—maintained to competitive standards and 
              open for leagues, tournaments, and private rentals.
            </p>
            <Link
              href="/facility"
              className="inline-flex items-center gap-2 text-zinc-900 font-medium hover:gap-3 transition-all"
            >
              See the facility
              <ArrowRight size={18} />
            </Link>
          </div>
          <ImagePlaceholder caption="Turf field under evening lights" />
        </div>
      </Section>

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-6">
        <hr className="border-zinc-200" />
      </div>

      {/* What Happens Here */}
      <Section>
        <SectionHeader
          title="What Happens Here"
          subtitle="Competitive play for all ages and skill levels."
        />

        <div className="grid md:grid-cols-3 gap-8">
          {/* Tournaments */}
          <div className="p-6 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors">
            <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center mb-4">
              <Trophy size={24} className="text-zinc-700" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">Tournaments</h3>
            <p className="text-zinc-600">
              Weekend competitions for youth and adult divisions. Single-day and multi-day formats.
            </p>
          </div>

          {/* Leagues */}
          <div className="p-6 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors">
            <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center mb-4">
              <Calendar size={24} className="text-zinc-700" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">Leagues</h3>
            <p className="text-zinc-600">
              Seasonal play with consistent scheduling. Youth development and adult recreational divisions.
            </p>
          </div>

          {/* Rentals */}
          <div className="p-6 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors">
            <div className="w-12 h-12 bg-zinc-100 rounded-lg flex items-center justify-center mb-4">
              <Users size={24} className="text-zinc-700" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">Field Rentals</h3>
            <p className="text-zinc-600">
              Book field time for your team, training sessions, or private events.
            </p>
          </div>
        </div>
      </Section>

      {/* Past Events */}
      <Section className="bg-zinc-50">
        <SectionHeader
          title="Past Events"
          subtitle="Recent tournaments and leagues at the facility."
        />

        <div className="grid md:grid-cols-3 gap-6">
          <EventCard
            title="Spring Classic 2025"
            date="March 2025"
            division="Youth U10-U14"
            teamCount="24 Teams"
            status="completed"
          />
          <EventCard
            title="Friday Night 7v7"
            date="Ongoing"
            division="Adults 18+"
            teamCount="12 Teams"
            status="completed"
          />
          <EventCard
            title="MLK Weekend Cup"
            date="January 2025"
            division="Open Division"
            teamCount="16 Teams"
            status="completed"
          />
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/events"
            className="inline-flex items-center gap-2 text-zinc-900 font-medium hover:gap-3 transition-all"
          >
            View all events
            <ArrowRight size={18} />
          </Link>
        </div>
      </Section>

      {/* Upcoming */}
      <Section>
        <div className="bg-zinc-950 text-white rounded-lg p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">
            Upcoming Events
          </h2>
          <p className="text-zinc-400 mb-6 max-w-lg mx-auto">
            New tournaments and league seasons are being scheduled. Check back soon 
            or contact us for announcements.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-white text-zinc-900 px-6 py-3 font-medium rounded-md hover:bg-zinc-100 transition-colors"
          >
            Get in Touch
          </Link>
        </div>
      </Section>

      {/* Location */}
      <Section className="bg-zinc-50">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <SectionHeader
              title="Find Us"
              subtitle="Located in Houston, TX."
            />
            <div className="flex items-start gap-3 mb-6">
              <MapPin size={20} className="text-zinc-400 mt-1 flex-shrink-0" />
              <div>
                <p className="text-zinc-900 font-medium">Houston Premier Soccer</p>
                <p className="text-zinc-600">Houston, TX</p>
                <p className="text-zinc-500 text-sm mt-1">Full address coming soon</p>
              </div>
            </div>
            <Link
              href="/facility"
              className="inline-flex items-center gap-2 text-zinc-900 font-medium hover:gap-3 transition-all"
            >
              Facility details
              <ArrowRight size={18} />
            </Link>
          </div>

          {/* Map Placeholder */}
          <div className="aspect-video bg-zinc-200 rounded-lg flex items-center justify-center">
            <span className="text-zinc-500 text-sm">Map embed coming soon</span>
          </div>
        </div>
      </Section>
    </>
  );
}
