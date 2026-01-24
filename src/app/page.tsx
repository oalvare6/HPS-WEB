import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, Trophy, Users, MapPin, Clock, ChevronRight } from "lucide-react";
import { Section, SectionHeader } from "@/components/shared/section";
import { EventCard } from "@/components/shared/event-card";
import { LocationCard } from "@/components/shared/location-card";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { QuickActionsBar } from "@/components/layout/quick-actions-bar";

// Status data - in production this would come from an API/CMS
const statusItems = [
  { label: "Registration Open", status: "open" as const },
  { label: "Fields: Open", status: "open" as const },
];

export default function Home() {
  return (
    <>
      {/* Quick Actions Bar */}
      <QuickActionsBar />

      {/* Hero */}
      <section className="relative bg-zinc-950 text-white bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Content */}
            <div>
              {/* Logo Badge */}
              <div className="mb-6">
                <Image
                  src="/brand/hps-badge.png"
                  alt="Houston Premier Soccer"
                  width={100}
                  height={100}
                  className="w-20 h-20 md:w-24 md:h-24 invert"
                  priority
                />
              </div>

              {/* Status Indicators */}
              <div className="mb-6">
                <StatusIndicator items={statusItems} />
              </div>

              {/* Headline */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
                League Operations
                <br />
                <span className="text-zinc-400">Center</span>
              </h1>

              {/* Subhead */}
              <p className="text-lg md:text-xl text-zinc-400 mb-8 max-w-lg">
                Schedules, standings, and field status for Houston Premier Soccer leagues and tournaments.
              </p>

              {/* Primary CTAs */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/events#schedule"
                  className="btn-primary"
                >
                  <Calendar size={18} />
                  Check Schedule
                </Link>
                <Link
                  href="/register"
                  className="btn-secondary"
                >
                  Register for Tournament
                </Link>
              </div>
            </div>

            {/* Right: Schedule Preview Card */}
            <div className="dashboard-card p-6 bg-tactical-grid-dense">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">Upcoming Matches</h2>
                <Link 
                  href="/events#schedule" 
                  className="text-sm text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  View All
                  <ChevronRight size={14} />
                </Link>
              </div>

              {/* Schedule Preview */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                  <div>
                    <p className="font-medium text-white">Spring League - Week 4</p>
                    <p className="text-sm text-zinc-400 mt-1">Youth U12 Division</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-white">Sat, Jan 25</p>
                    <p className="text-sm text-zinc-400">9:00 AM</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                  <div>
                    <p className="font-medium text-white">Friday Night 7v7</p>
                    <p className="text-sm text-zinc-400 mt-1">Adults 18+</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-white">Fri, Jan 31</p>
                    <p className="text-sm text-zinc-400">7:00 PM</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                  <div>
                    <p className="font-medium text-white">Presidents Cup Qualifier</p>
                    <p className="text-sm text-zinc-400 mt-1">U14-U16 Elite</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-white">Feb 8-9</p>
                    <p className="text-sm text-zinc-400">All Day</p>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-zinc-800">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">12</p>
                  <p className="text-xs text-zinc-500 mt-1">Active Leagues</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">48</p>
                  <p className="text-xs text-zinc-500 mt-1">Teams</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">3</p>
                  <p className="text-xs text-zinc-500 mt-1">Fields</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Happens Here */}
      <Section dark className="bg-zinc-900 bg-topo-lines">
        <SectionHeader
          title="What Happens Here"
          subtitle="Competitive play for all ages and skill levels."
          dark
        />

        <div className="grid md:grid-cols-3 gap-6">
          {/* Tournaments */}
          <div className="dashboard-card p-6 hover:border-zinc-700 transition-colors">
            <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center mb-4">
              <Trophy size={24} className="text-green-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Tournaments</h3>
            <p className="text-zinc-400">
              Weekend competitions for youth and adult divisions. Single-day and multi-day formats.
            </p>
            <Link
              href="/events"
              className="inline-flex items-center gap-1 text-green-500 hover:text-green-400 text-sm font-medium mt-4 transition-colors"
            >
              View Tournaments
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Leagues */}
          <div className="dashboard-card p-6 hover:border-zinc-700 transition-colors">
            <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center mb-4">
              <Calendar size={24} className="text-green-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Leagues</h3>
            <p className="text-zinc-400">
              Seasonal play with consistent scheduling. Youth development and adult recreational divisions.
            </p>
            <Link
              href="/events#schedule"
              className="inline-flex items-center gap-1 text-green-500 hover:text-green-400 text-sm font-medium mt-4 transition-colors"
            >
              View League Table
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Rentals */}
          <div className="dashboard-card p-6 hover:border-zinc-700 transition-colors">
            <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center mb-4">
              <Users size={24} className="text-green-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Field Rentals</h3>
            <p className="text-zinc-400">
              Book field time for your team, training sessions, or private events.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-1 text-green-500 hover:text-green-400 text-sm font-medium mt-4 transition-colors"
            >
              Book a Field
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </Section>

      {/* Past Events */}
      <Section dark className="bg-zinc-950 bg-tactical-grid">
        <SectionHeader
          title="Recent Events"
          subtitle="Completed tournaments and leagues."
          dark
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
            status="registration-open"
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
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white font-medium transition-colors"
          >
            View all events
            <ArrowRight size={18} />
          </Link>
        </div>
      </Section>

      {/* Location Section */}
      <Section dark className="bg-zinc-900">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <SectionHeader
              title="Find the Fields"
              subtitle="Located in South Houston."
              dark
            />
            
            <div className="space-y-6 text-zinc-400">
              <p>
                Our facility is located at 14602 Ambrose St in Houston. Easy access from 
                I-45 and 610, with on-site parking for players and spectators.
              </p>
              
              <div className="flex items-start gap-3">
                <Clock size={20} className="text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-white font-medium">Field Hours</p>
                  <p className="text-zinc-400 text-sm">
                    Mon-Fri: 5PM - 10PM<br />
                    Sat-Sun: 8AM - 10PM
                  </p>
                </div>
              </div>
            </div>

            <Link
              href="/facility"
              className="inline-flex items-center gap-2 text-green-500 hover:text-green-400 font-medium mt-6 transition-colors"
            >
              View Facility Details
              <ArrowRight size={18} />
            </Link>
          </div>

          {/* Location Card */}
          <LocationCard />
        </div>
      </Section>

      {/* CTA Section */}
      <Section dark className="bg-zinc-950 bg-field-pattern">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Ready to Play?
          </h2>
          <p className="text-zinc-400 mb-8">
            Register your team for upcoming tournaments and league seasons. 
            Contact us for group rates and field rental inquiries.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="btn-primary"
            >
              Register for Tournament
            </Link>
            <Link
              href="/contact"
              className="btn-secondary"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </Section>

      {/* Bottom padding for mobile fixed bar */}
      <div className="h-20 md:hidden bg-zinc-950" />
    </>
  );
}
