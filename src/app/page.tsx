"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, Trophy, Users, MapPin, Clock } from "lucide-react";
import { Section, SectionHeader } from "@/components/shared/section";
import { EventCard } from "@/components/shared/event-card";
import { LocationCard } from "@/components/shared/location-card";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { QuickActionsBar } from "@/components/layout/quick-actions-bar";

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
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white p-1 shadow-lg shadow-black/30">
                  <Image
                    src="/brand/hps-badge.png"
                    alt="Houston Premier Soccer"
                    width={100}
                    height={100}
                    className="w-full h-full rounded-full"
                    priority
                  />
                </div>
              </div>

              {/* Status Indicators */}
              <div className="mb-6">
                <StatusIndicator items={statusItems} />
              </div>

              {/* Headline */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
                Houston Premier
                <br />
                <span className="text-zinc-400">Soccer</span>
              </h1>

              {/* Subhead */}
              <p className="text-lg md:text-xl text-zinc-300 mb-8 max-w-lg">
                Your local 7v7 soccer spot. Quality grass field, competitive leagues, and a community built around the beautiful game.
              </p>

              {/* Primary CTAs */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/register" className="btn-primary">
                  <Trophy size={18} />
                  Register for Tournament
                </Link>
                <Link href="/events#schedule" className="btn-secondary">
                  <Calendar size={18} />
                  Check Schedule
                </Link>
              </div>
            </div>

            {/* Right: Community Photo + Tournament Info */}
            <div className="space-y-4">
              {/* Community Photo */}
              <div className="dashboard-card overflow-hidden border border-zinc-700/70 shadow-xl shadow-black/30">
                <div className="relative aspect-video">
                  <Image
                    src="/community/hps-community-7v7.png"
                    alt="Houston Premier Soccer 7v7 community"
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 520px, 100vw"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="text-sm font-semibold text-white tracking-tight">
                      Real players. Real community.
                    </p>
                    <p className="text-xs text-green-400 font-mono mt-0.5">
                      Houston 7v7 under the lights
                    </p>
                  </div>
                </div>
              </div>

              {/* Spring Classic Card */}
              <div className="dashboard-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs font-mono text-green-500 uppercase tracking-wider">Registration Open</span>
                    </div>
                    <h2 className="text-xl font-bold text-white">Spring Classic 2026</h2>
                  </div>
                  <Trophy size={24} className="text-green-500" />
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Calendar size={14} className="text-green-500 flex-shrink-0" />
                    <span>Every Friday starting Mar 27</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Clock size={14} className="text-green-500 flex-shrink-0" />
                    <span>7:00 PM – 12:00 AM</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300">
                    <MapPin size={14} className="text-green-500 flex-shrink-0" />
                    <span>14602 Ambrose St</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-300">
                    <Users size={14} className="text-green-500 flex-shrink-0" />
                    <span>Youth & Adult 7v7</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Link
                    href="/register"
                    className="btn-primary w-full justify-center text-sm"
                  >
                    Register Now
                    <ArrowRight size={14} />
                  </Link>
                  <Link
                    href="/pay"
                    className="btn-secondary w-full justify-center text-sm"
                  >
                    Pay for Tournament
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Happens Here */}
      <Section dark className="bg-zinc-900 overflow-hidden relative">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=1400&q=80"
            alt="Soccer field"
            fill
            className="object-cover opacity-[0.07]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-transparent to-zinc-950/60" />
        </div>

        <div className="relative">
          <SectionHeader
            title="What Happens Here"
            subtitle="Fast-paced 7v7 soccer for all ages and skill levels."
            dark
          />

          <div className="grid md:grid-cols-3 gap-6">
            <div className="dashboard-card overflow-hidden hover:border-zinc-700 transition-colors">
              <div className="aspect-video bg-zinc-800 relative">
                <Image
                  src="https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&q=80"
                  alt="Soccer tournament action"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-2">7v7 Tournaments</h3>
                <p className="text-zinc-400">
                  Weekend 7v7 competitions for youth and adult divisions. Fast-paced single-day and multi-day formats.
                </p>
                <Link
                  href="/events"
                  className="inline-flex items-center gap-1 text-white hover:text-zinc-300 text-sm font-medium mt-4 transition-colors"
                >
                  View Tournaments
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            <div className="dashboard-card overflow-hidden hover:border-zinc-700 transition-colors">
              <div className="aspect-video bg-zinc-800 relative">
                <Image
                  src="https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=600&q=80"
                  alt="Soccer league match"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-2">7v7 Leagues</h3>
                <p className="text-zinc-400">
                  Seasonal 7v7 play with consistent scheduling. Youth development and adult recreational divisions.
                </p>
                <Link
                  href="/events#schedule"
                  className="inline-flex items-center gap-1 text-white hover:text-zinc-300 text-sm font-medium mt-4 transition-colors"
                >
                  View League Table
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>

            <div className="dashboard-card overflow-hidden hover:border-zinc-700 transition-colors">
              <div className="aspect-video bg-zinc-800 relative">
                <Image
                  src="https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=600&q=80"
                  alt="Soccer field at night"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-2">Field Rentals</h3>
                <p className="text-zinc-400">
                  Book 7v7 field time for your team, training sessions, or private matches.
                </p>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-1 text-white hover:text-zinc-300 text-sm font-medium mt-4 transition-colors"
                >
                  Book a Field
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Past Events */}
      <Section dark className="bg-zinc-950 bg-tactical-grid-dense">
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
            
            <div className="space-y-6 text-zinc-300">
              <p className="leading-relaxed">
                Our facility is located at <span className="text-green-400 font-semibold">14602 Ambrose St</span> in Houston. Easy access from 
                I-45 and 610, with on-site parking for players and spectators.
              </p>
              
              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-900/40 to-green-950/40 rounded-lg flex items-center justify-center flex-shrink-0 border border-green-800/30">
                    <Clock size={20} className="text-green-500" />
                  </div>
                  <div>
                    <p className="text-white font-semibold mb-2">Field Hours</p>
                    <div className="space-y-1 text-sm">
                      <p className="text-zinc-300">
                        <span className="text-green-400 font-mono">Mon-Fri:</span> 5PM - 10PM
                      </p>
                      <p className="text-zinc-300">
                        <span className="text-green-400 font-mono">Sat-Sun:</span> 8AM - 10PM
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Link
              href="/facility"
              className="inline-flex items-center gap-2 text-white hover:text-green-400 font-medium mt-6 transition-colors group"
            >
              View Facility Details
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          <LocationCard />
        </div>
      </Section>

      {/* CTA Section */}
      <Section dark className="bg-zinc-950 relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1400&q=80"
            alt="Soccer action"
            fill
            className="object-cover opacity-[0.07]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-zinc-950/80" />
        </div>
        <div className="relative text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Ready to Play 7v7?
          </h2>
          <p className="text-zinc-400 mb-8">
            Register for upcoming 7v7 tournaments and league seasons. 
            Contact us for group rates and field rental inquiries.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="btn-primary">
              Register for Tournament
            </Link>
            <Link href="/contact" className="btn-secondary">
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
