import Link from "next/link";
import { Section, SectionHeader } from "@/components/shared/section";
import { EventCard } from "@/components/shared/event-card";
import { ArrowRight, Calendar, Trophy } from "lucide-react";

export default function EventsPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-zinc-950 text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Schedule & Events
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Leagues and tournaments for youth and adult players. 
            Organized competition at the Houston Premier Soccer facility.
          </p>
        </div>
      </section>

      {/* Schedule Section */}
      <Section dark className="bg-zinc-900 bg-topo-lines" id="schedule">
        <SectionHeader
          title="Current Schedule"
          subtitle="Upcoming games and events."
          dark
        />

        {/* Schedule Grid */}
        <div className="space-y-4">
          <div className="dashboard-card p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-800 rounded-lg flex flex-col items-center justify-center text-center">
                  <span className="text-xs text-zinc-500 uppercase">Jan</span>
                  <span className="text-lg font-bold text-white">25</span>
                </div>
                <div>
                  <p className="font-semibold text-white">Spring League - Week 4</p>
                  <p className="text-sm text-zinc-400">Youth U12 Division • 9:00 AM - 12:00 PM</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-zinc-900 bg-green-500 px-2 py-1 rounded">
                  Scheduled
                </span>
                <span className="text-sm text-zinc-500">Field 1 & 2</span>
              </div>
            </div>
          </div>

          <div className="dashboard-card p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-800 rounded-lg flex flex-col items-center justify-center text-center">
                  <span className="text-xs text-zinc-500 uppercase">Jan</span>
                  <span className="text-lg font-bold text-white">31</span>
                </div>
                <div>
                  <p className="font-semibold text-white">Friday Night 7v7</p>
                  <p className="text-sm text-zinc-400">Adults 18+ • 7:00 PM - 10:00 PM</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-zinc-900 bg-green-500 px-2 py-1 rounded">
                  Scheduled
                </span>
                <span className="text-sm text-zinc-500">All Fields</span>
              </div>
            </div>
          </div>

          <div className="dashboard-card p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-800 rounded-lg flex flex-col items-center justify-center text-center">
                  <span className="text-xs text-zinc-500 uppercase">Feb</span>
                  <span className="text-lg font-bold text-white">8-9</span>
                </div>
                <div>
                  <p className="font-semibold text-white">Presidents Cup Qualifier</p>
                  <p className="text-sm text-zinc-400">U14-U16 Elite • All Day Tournament</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-white bg-zinc-700 px-2 py-1 rounded">
                  Registration Open
                </span>
                <span className="text-sm text-zinc-500">All Fields</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Standings Section */}
      <Section dark className="bg-zinc-950 bg-tactical-grid" id="standings">
        <SectionHeader
          title="League Standings"
          subtitle="Current season rankings."
          dark
        />

        {/* Standings Table */}
        <div className="dashboard-card overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy size={18} className="text-green-500" />
              <h3 className="font-semibold text-white">Adult 7v7 League - Spring 2026</h3>
            </div>
            <span className="text-xs text-zinc-500">Updated Jan 24, 2026</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-800/50">
                <tr className="text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  <th className="px-4 py-3">Pos</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3 text-center">P</th>
                  <th className="px-4 py-3 text-center">W</th>
                  <th className="px-4 py-3 text-center">D</th>
                  <th className="px-4 py-3 text-center">L</th>
                  <th className="px-4 py-3 text-center">GD</th>
                  <th className="px-4 py-3 text-center font-bold">Pts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-green-500 font-bold">1</td>
                  <td className="px-4 py-3 font-medium text-white">Houston FC</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">5</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-zinc-400">0</td>
                  <td className="px-4 py-3 text-center text-green-500">+12</td>
                  <td className="px-4 py-3 text-center font-bold text-white">16</td>
                </tr>
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400 font-bold">2</td>
                  <td className="px-4 py-3 font-medium text-white">Southside United</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">4</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-green-500">+8</td>
                  <td className="px-4 py-3 text-center font-bold text-white">13</td>
                </tr>
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400 font-bold">3</td>
                  <td className="px-4 py-3 font-medium text-white">Ambrose Athletic</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">3</td>
                  <td className="px-4 py-3 text-center text-zinc-400">2</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-green-500">+4</td>
                  <td className="px-4 py-3 text-center font-bold text-white">11</td>
                </tr>
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400 font-bold">4</td>
                  <td className="px-4 py-3 font-medium text-white">Third Ward SC</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">2</td>
                  <td className="px-4 py-3 text-center text-zinc-400">2</td>
                  <td className="px-4 py-3 text-center text-zinc-400">2</td>
                  <td className="px-4 py-3 text-center text-zinc-400">0</td>
                  <td className="px-4 py-3 text-center font-bold text-white">8</td>
                </tr>
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400 font-bold">5</td>
                  <td className="px-4 py-3 font-medium text-white">Midtown Strikers</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-zinc-400">4</td>
                  <td className="px-4 py-3 text-center text-red-500">-6</td>
                  <td className="px-4 py-3 text-center font-bold text-white">4</td>
                </tr>
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400 font-bold">6</td>
                  <td className="px-4 py-3 font-medium text-white">Heights FC</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">0</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-zinc-400">5</td>
                  <td className="px-4 py-3 text-center text-red-500">-18</td>
                  <td className="px-4 py-3 text-center font-bold text-white">1</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Leagues Section */}
      <Section dark className="bg-zinc-900">
        <SectionHeader
          title="Leagues"
          subtitle="Seasonal play with consistent scheduling."
          dark
        />

        {/* Coming Soon State */}
        <div className="dashboard-card p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Calendar size={24} className="text-green-500" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Spring League Registration Open
              </h3>
              <p className="text-zinc-400 mb-4 max-w-xl">
                Registration is now open for youth and adult spring league seasons. 
                Contact us for team registration or to join as a free agent.
              </p>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 text-green-500 font-medium hover:text-green-400 transition-colors"
              >
                Register Now
                <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>

        {/* League Info */}
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div className="dashboard-card p-6">
            <h3 className="font-semibold text-white mb-2">Youth Leagues</h3>
            <p className="text-zinc-400 text-sm">
              Development-focused leagues for U8 through U18 age groups. 
              Seasonal play with balanced competition.
            </p>
          </div>
          <div className="dashboard-card p-6">
            <h3 className="font-semibold text-white mb-2">Adult Leagues</h3>
            <p className="text-zinc-400 text-sm">
              Recreational and competitive divisions for players 18+. 
              Evening and weekend scheduling.
            </p>
          </div>
        </div>
      </Section>

      {/* Tournaments Section */}
      <Section dark className="bg-zinc-950 bg-tactical-grid">
        <SectionHeader
          title="Past Tournaments"
          subtitle="Completed events."
          dark
        />

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
      </Section>

      {/* CTA */}
      <Section dark className="bg-zinc-900">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Want to Participate?
          </h2>
          <p className="text-zinc-400 mb-8">
            Register to get updates on upcoming leagues and tournaments. 
            We&apos;ll notify you when registration opens.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="btn-primary"
            >
              Register Now
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
      <div className="h-20 md:hidden bg-zinc-900" />
    </>
  );
}
