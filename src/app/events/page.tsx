import Link from "next/link";
import { Section, SectionHeader } from "@/components/shared/section";
import { EventCard } from "@/components/shared/event-card";
import { WeeklySchedule } from "@/components/shared/weekly-schedule";
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
          <p className="text-xl text-zinc-300 max-w-2xl">
            Weekly 7v7 league games and tournaments for youth and adult players. 
            See when teams play at your local 7v7 soccer spot.
          </p>
        </div>
      </section>

      {/* Schedule Section */}
      <Section dark className="bg-zinc-900 bg-topo-lines" id="schedule">
        <SectionHeader
          title="Weekly 7v7 League Schedule"
          subtitle="See when teams play. Youth 7v7 on Saturdays, Adult 7v7 on Fridays."
          dark
        />

        <WeeklySchedule leagues={[
          {
            name: "Youth U12 7v7 League",
            type: "youth",
            days: [
              {
                day: "Saturday",
                games: [
                  { time: "9:00 AM", homeTeam: "Houston Strikers", awayTeam: "Southside United" },
                  { time: "10:30 AM", homeTeam: "Ambrose Athletic", awayTeam: "Third Ward SC" },
                  { time: "12:00 PM", homeTeam: "Midtown FC", awayTeam: "Heights Dynamo" },
                  { time: "1:30 PM", homeTeam: "East End Eagles", awayTeam: "Westside Warriors" },
                ]
              }
            ]
          },
          {
            name: "Adult 7v7 League",
            type: "adult",
            days: [
              {
                day: "Friday",
                games: [
                  { time: "7:00 PM", homeTeam: "Houston FC", awayTeam: "Southside United" },
                  { time: "8:30 PM", homeTeam: "Ambrose Athletic", awayTeam: "Third Ward SC" },
                  { time: "9:00 PM", homeTeam: "Midtown Strikers", awayTeam: "Heights FC" },
                  { time: "9:30 PM", homeTeam: "East End Elite", awayTeam: "Westside United" },
                ]
              }
            ]
          }
        ]} />
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
              <Trophy size={18} className="text-white" />
              <h3 className="font-semibold text-white">Adult 7v7 League - Spring 2026</h3>
            </div>
            <span className="text-xs text-zinc-500">Updated Weekly</span>
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
                  <td className="px-4 py-3 text-white font-bold">1</td>
                  <td className="px-4 py-3 font-medium text-white">Houston FC</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">5</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-zinc-400">0</td>
                  <td className="px-4 py-3 text-center text-white">+12</td>
                  <td className="px-4 py-3 text-center font-bold text-white">16</td>
                </tr>
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400 font-bold">2</td>
                  <td className="px-4 py-3 font-medium text-white">Southside United</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">4</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-white">+8</td>
                  <td className="px-4 py-3 text-center font-bold text-white">13</td>
                </tr>
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400 font-bold">3</td>
                  <td className="px-4 py-3 font-medium text-white">Ambrose Athletic</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">3</td>
                  <td className="px-4 py-3 text-center text-zinc-400">2</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-white">+4</td>
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
                  <td className="px-4 py-3 text-center text-zinc-500">-6</td>
                  <td className="px-4 py-3 text-center font-bold text-white">4</td>
                </tr>
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400 font-bold">6</td>
                  <td className="px-4 py-3 font-medium text-white">Heights FC</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-zinc-400">0</td>
                  <td className="px-4 py-3 text-center text-zinc-400">5</td>
                  <td className="px-4 py-3 text-center text-zinc-500">-12</td>
                  <td className="px-4 py-3 text-center font-bold text-white">3</td>
                </tr>
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400 font-bold">7</td>
                  <td className="px-4 py-3 font-medium text-white">Westside United</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">0</td>
                  <td className="px-4 py-3 text-center text-zinc-400">2</td>
                  <td className="px-4 py-3 text-center text-zinc-400">4</td>
                  <td className="px-4 py-3 text-center text-zinc-500">-10</td>
                  <td className="px-4 py-3 text-center font-bold text-white">2</td>
                </tr>
                <tr className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-400 font-bold">8</td>
                  <td className="px-4 py-3 font-medium text-white">East End Elite</td>
                  <td className="px-4 py-3 text-center text-zinc-400">6</td>
                  <td className="px-4 py-3 text-center text-zinc-400">0</td>
                  <td className="px-4 py-3 text-center text-zinc-400">1</td>
                  <td className="px-4 py-3 text-center text-zinc-400">5</td>
                  <td className="px-4 py-3 text-center text-zinc-500">-18</td>
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
          title="7v7 Leagues"
          subtitle="Seasonal 7v7 play with consistent scheduling."
          dark
        />

        {/* Coming Soon State */}
        <div className="dashboard-card p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Calendar size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Spring 7v7 League Registration Open
              </h3>
              <p className="text-zinc-400 mb-4 max-w-xl">
                Registration is now open for youth and adult spring 7v7 league seasons. 
                Contact us for team registration or to join as a free agent.
              </p>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 text-white font-medium hover:text-zinc-300 transition-colors"
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
            <h3 className="font-semibold text-white mb-2">Youth 7v7 Leagues</h3>
            <p className="text-zinc-400 text-sm">
              Development-focused 7v7 leagues for U8 through U18 age groups. 
              Seasonal play with balanced competition in fast-paced format.
            </p>
          </div>
          <div className="dashboard-card p-6">
            <h3 className="font-semibold text-white mb-2">Adult 7v7 Leagues</h3>
            <p className="text-zinc-400 text-sm">
              Recreational and competitive 7v7 divisions for players 18+. 
              Evening and weekend scheduling with fast-paced action.
            </p>
          </div>
        </div>
      </Section>

      {/* Tournaments Section */}
      <Section dark className="bg-zinc-950 bg-tactical-grid">
        <SectionHeader
          title="Past 7v7 Tournaments"
          subtitle="Completed 7v7 events."
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
            Want to Play 7v7?
          </h2>
          <p className="text-zinc-400 mb-8">
            Register to get updates on upcoming 7v7 leagues and tournaments. 
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
