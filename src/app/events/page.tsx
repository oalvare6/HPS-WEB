import Link from "next/link";
import { Section, SectionHeader } from "@/components/shared/section";
import { ArrowRight, Calendar, Trophy, MapPin, Clock, Users, CreditCard } from "lucide-react";

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
            Adult 7v7 league — Spring 2026. 8 rounds of Friday night soccer, 7–10 PM.
          </p>
        </div>
      </section>

      {/* Spring Classic 2026 — Upcoming Tournament Banner */}
      <Section dark className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-4xl mx-auto">
          <div className="dashboard-card overflow-hidden">
            <div className="bg-green-500/10 border-b border-green-500/20 px-6 py-3 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono text-green-400 uppercase tracking-wider font-semibold">
                Upcoming — Registration &amp; Payments Open
              </span>
            </div>
            <div className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <Trophy size={22} className="text-green-400 flex-shrink-0" />
                    <h2 className="text-2xl font-bold text-white">
                      Spring Classic 2026
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Calendar size={14} className="text-green-500 flex-shrink-0" />
                      <span>Every Friday starting Mar 27, 2026</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Clock size={14} className="text-green-500 flex-shrink-0" />
                      <span>7:00 PM – 10:00 PM</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-300">
                      <MapPin size={14} className="text-green-500 flex-shrink-0" />
                      <span>14062 Ambrose St, Houston TX</span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Users size={14} className="text-green-500 flex-shrink-0" />
                      <span>Adult 7v7</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-3 md:min-w-[200px]">
                  <Link href="/register" className="btn-primary justify-center text-sm">
                    <Trophy size={16} />
                    Register Now
                    <ArrowRight size={14} />
                  </Link>
                  <Link href="/pay" className="btn-secondary justify-center text-sm">
                    <CreditCard size={16} />
                    Pay Entry Fee
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Schedule Section */}
      <Section dark className="bg-zinc-900 bg-topo-lines" id="schedule">
        <SectionHeader
          title="Adult 7v7 — Spring 2026 Schedule"
          subtitle="8 rounds of play. All rounds run 7:00 PM – 10:00 PM every Friday."
          dark
        />

        <div className="dashboard-card overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-green-400" />
              <h3 className="font-semibold text-white">Adult 7v7 League — Spring 2026</h3>
            </div>
            <div className="flex items-center gap-2 text-zinc-400 text-xs">
              <Clock size={13} />
              <span>7:00 PM – 10:00 PM</span>
            </div>
          </div>

          <ul className="divide-y divide-zinc-800">
            {[
              { label: "Round 1",          date: "Friday, March 27",  current: true,  special: false },
              { label: "Round 2",          date: "Friday, April 3",   current: false, special: false },
              { label: "Round 3",          date: "Friday, April 10",  current: false, special: false },
              { label: "Round 4",          date: "Friday, April 17",  current: false, special: false },
              { label: "Round 5",          date: "Friday, April 24",  current: false, special: false },
              { label: "Round 6",          date: "Friday, May 1",     current: false, special: false },
              { label: "Round 7",          date: "Friday, May 8",     current: false, special: false },
              { label: "Break",            date: "Friday, May 15",    current: false, special: true  },
              { label: "Round 8 (Final)",  date: "Friday, May 22",    current: false, special: false },
              { label: "Make-up Round",    date: "Friday, May 29",    current: false, special: true, note: "if needed" },
            ].map(({ label, date, current, special, note }) => (
              <li
                key={label}
                className={`flex items-center justify-between px-6 py-4 ${current ? "bg-green-500/10" : "hover:bg-zinc-800/30"}`}
              >
                <div className="flex items-center gap-3">
                  {current && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />}
                  <span className={`font-medium ${special ? "text-zinc-400 italic" : current ? "text-green-300" : "text-white"}`}>
                    {label}{note ? ` (${note})` : ""}
                  </span>
                  {current && (
                    <span className="text-xs font-mono bg-green-500/20 text-green-400 px-2 py-0.5 rounded uppercase tracking-wider">
                      Tonight
                    </span>
                  )}
                </div>
                <span className={`text-sm ${special ? "text-zinc-500 italic" : current ? "text-green-400 font-semibold" : "text-zinc-400"}`}>
                  {date}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Leagues Section */}
      <Section dark className="bg-zinc-900">
        <SectionHeader
          title="Adult 7v7 League"
          subtitle="Spring 2026 — Registration and payments are open."
          dark
        />

        <div className="dashboard-card p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0">
              <Users size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Join the Spring 2026 Season
              </h3>
              <p className="text-zinc-400 mb-4 max-w-xl">
                8 rounds of adult 7v7, every Friday night 7–10 PM starting March 27.
                Register your team or sign up as a free agent.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 text-white font-medium hover:text-zinc-300 transition-colors"
                >
                  Register Now
                  <ArrowRight size={18} />
                </Link>
                <Link
                  href="/pay"
                  className="inline-flex items-center gap-2 text-zinc-400 font-medium hover:text-zinc-300 transition-colors"
                >
                  Pay Entry Fee
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
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
            <Link href="/register" className="btn-primary">
              Register Now
            </Link>
            <Link href="/pay" className="btn-secondary">
              <CreditCard size={18} />
              Pay Entry Fee
            </Link>
          </div>
        </div>
      </Section>

      {/* Bottom padding for mobile fixed bar */}
      <div className="h-20 md:hidden bg-zinc-900" />
    </>
  );
}
