"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, Trophy, Users, MapPin, Clock, ChevronRight, ChevronDown } from "lucide-react";
import { Section, SectionHeader } from "@/components/shared/section";
import { EventCard } from "@/components/shared/event-card";
import { LocationCard } from "@/components/shared/location-card";
import { StatusIndicator } from "@/components/shared/status-indicator";
import { QuickActionsBar } from "@/components/layout/quick-actions-bar";
import { useState } from "react";

// Status data - in production this would come from an API/CMS
const statusItems = [
  { label: "Registration Open", status: "open" as const },
  { label: "Fields: Open", status: "open" as const },
];

export default function Home() {
  const [isFormExpanded, setIsFormExpanded] = useState(false);

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

            {/* Right: Community + Planning */}
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

              {/* Spring Planning Card */}
              <div className="dashboard-card bg-tactical-grid-dense overflow-hidden">
                {/* Collapsed Header - Always Visible */}
                <div 
                  className="p-4 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                  onClick={() => setIsFormExpanded(!isFormExpanded)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-mono text-green-500 uppercase tracking-wider">Planning Phase</span>
                      </div>
                      <h2 className="text-xl font-bold text-white">March 2026</h2>
                      <p className="text-xs text-zinc-400 mt-1">Express interest & availability</p>
                    </div>
                    <div className={`transform transition-transform ${isFormExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDown size={24} className="text-green-500" />
                    </div>
                  </div>
                </div>

                {/* Expanded Form */}
                {isFormExpanded && (
                  <div className="p-6 pt-0 border-t border-zinc-800/50">
                    <form className="space-y-3.5">
                    <div>
                      <label htmlFor="name" className="block text-xs font-medium text-green-400 mb-1 uppercase tracking-wide">
                        Full Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        className="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-600 focus:ring-2 focus:ring-green-900/30 transition-all font-mono text-sm"
                        placeholder="Enter your name"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-xs font-medium text-green-400 mb-1 uppercase tracking-wide">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        className="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-600 focus:ring-2 focus:ring-green-900/30 transition-all font-mono text-sm"
                        placeholder="your@email.com"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-xs font-medium text-green-400 mb-1 uppercase tracking-wide">
                        Phone
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        className="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-600 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-green-600 focus:ring-2 focus:ring-green-900/30 transition-all font-mono text-sm"
                        placeholder="(555) 000-0000"
                      />
                    </div>

                    <div>
                      <label htmlFor="division" className="block text-xs font-medium text-green-400 mb-1 uppercase tracking-wide">
                        Division Interest
                      </label>
                      <select
                        id="division"
                        name="division"
                        className="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-green-600 focus:ring-2 focus:ring-green-900/30 transition-all font-mono text-sm"
                        required
                      >
                        <option value="">Select division</option>
                        <option value="youth-u8">Youth U8</option>
                        <option value="youth-u10">Youth U10</option>
                        <option value="youth-u12">Youth U12</option>
                        <option value="youth-u14">Youth U14</option>
                        <option value="youth-u16">Youth U16</option>
                        <option value="adult-rec">Adult Recreational</option>
                        <option value="adult-comp">Adult Competitive</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="format" className="block text-xs font-medium text-green-400 mb-1 uppercase tracking-wide">
                        Preferred Format
                      </label>
                      <select
                        id="format"
                        name="format"
                        className="w-full px-3 py-2 bg-zinc-800/80 border border-zinc-600 rounded-lg text-white focus:outline-none focus:border-green-600 focus:ring-2 focus:ring-green-900/30 transition-all font-mono text-sm"
                        required
                      >
                        <option value="">Select format</option>
                        <option value="4-day-tournament">4-Day Tournament</option>
                        <option value="8-week-season">8-Week Season</option>
                        <option value="either">Either Works</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-green-400 mb-2 uppercase tracking-wide">
                        Best Days (Select All That Apply)
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                          <label key={day} className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded border border-zinc-700/50 hover:border-green-600/50 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              name="days[]"
                              value={day.toLowerCase()}
                              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-green-600 focus:ring-2 focus:ring-green-900/30 focus:ring-offset-0"
                            />
                            <span className="text-xs text-white font-mono">{day}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-green-400 mb-2 uppercase tracking-wide">
                        Best Times (Select All That Apply)
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {['5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM'].map((time) => (
                          <label key={time} className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded border border-zinc-700/50 hover:border-green-600/50 cursor-pointer transition-colors">
                            <input
                              type="checkbox"
                              name="times[]"
                              value={time.toLowerCase().replace(/[:\s]/g, '')}
                              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-green-600 focus:ring-2 focus:ring-green-900/30 focus:ring-offset-0"
                            />
                            <span className="text-xs text-white font-mono">{time}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-green-700 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-600 transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-sm shadow-lg shadow-green-900/50 hover:shadow-green-800/60 border border-green-600"
                    >
                      <Users size={18} />
                      Submit Interest
                    </button>

                    {/* Quick Info */}
                    <div className="mt-3 p-2.5 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                      <p className="text-xs text-zinc-400 text-center">
                        <span className="text-green-400 font-semibold">Format TBD</span> — Your input helps us plan the best schedule.
                      </p>
                    </div>
                  </form>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What Happens Here */}
      <Section dark className="bg-zinc-900 bg-topo-lines">
        <SectionHeader
          title="What Happens Here"
          subtitle="Fast-paced 7v7 soccer for all ages and skill levels."
          dark
        />

        <div className="grid md:grid-cols-3 gap-6">
          {/* Tournaments */}
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

          {/* Leagues */}
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

          {/* Rentals */}
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

          {/* Location Card */}
          <LocationCard />
        </div>
      </Section>

      {/* CTA Section */}
      <Section dark className="bg-zinc-950 bg-field-pattern">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Ready to Play 7v7?
          </h2>
          <p className="text-zinc-400 mb-8">
            Register your team for upcoming 7v7 tournaments and league seasons. 
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
