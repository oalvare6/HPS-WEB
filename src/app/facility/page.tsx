import Link from "next/link";
import { Section, SectionHeader } from "@/components/shared/section";
import { LocationCard } from "@/components/shared/location-card";
import {
  Sun,
  Car,
  Users,
  ShieldCheck,
  ArrowRight,
  Clock,
} from "lucide-react";

export default function FacilityPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-base text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            The Facility
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Purpose-built for 7v7 competitive play. Quality turf, professional lighting, 
            and the infrastructure to run fast-paced tournaments and leagues.
          </p>
        </div>
      </section>

      {/* Field Overview */}
      <Section dark className="bg-surface bg-topo-lines">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <SectionHeader
              title="The Fields"
              subtitle="Dedicated 7v7 turf fields for fast-paced action."
              dark
            />
            <ul className="space-y-4 text-zinc-400">
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-brand rounded-full mt-2.5" />
                <span>Professional-grade turf maintained to competitive standards</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-brand rounded-full mt-2.5" />
                <span>Purpose-built 7v7 field configurations</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-brand rounded-full mt-2.5" />
                <span>Full lighting for evening matches and night leagues</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-brand rounded-full mt-2.5" />
                <span>Regular maintenance and pre-event inspections</span>
              </li>
            </ul>
          </div>

          {/* Field Video */}
          <div className="dashboard-card aspect-video relative overflow-hidden">
            <video
              className="w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              controls
              poster="/community/hps-community-7v7.png"
            >
              <source src="/videos/FACILITY.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-base/70 via-transparent to-transparent" />
          </div>
        </div>
      </Section>

      {/* Amenities */}
      <Section dark className="bg-base bg-tactical-grid">
        <SectionHeader
          title="Amenities"
          subtitle="Everything you need for game day."
          dark
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div className="dashboard-card p-6 text-center">
            <Sun size={28} className="text-white mx-auto mb-3" />
            <h3 className="font-medium text-white">Field Lighting</h3>
            <p className="text-sm text-zinc-500 mt-1">Night games available</p>
          </div>

          <div className="dashboard-card p-6 text-center">
            <Users size={28} className="text-white mx-auto mb-3" />
            <h3 className="font-medium text-white">Spectator Areas</h3>
            <p className="text-sm text-zinc-500 mt-1">Covered seating</p>
          </div>

          <div className="dashboard-card p-6 text-center">
            <Car size={28} className="text-white mx-auto mb-3" />
            <h3 className="font-medium text-white">Parking</h3>
            <p className="text-sm text-zinc-500 mt-1">On-site lot</p>
          </div>

          <div className="dashboard-card p-6 text-center">
            <ShieldCheck size={28} className="text-white mx-auto mb-3" />
            <h3 className="font-medium text-white">Restrooms</h3>
            <p className="text-sm text-zinc-500 mt-1">Clean facilities</p>
          </div>
        </div>
      </Section>

      {/* Field Rules */}
      <Section dark className="bg-surface">
        <SectionHeader
          title="Field Rules"
          subtitle="Help us keep the facility in top condition."
          dark
        />

        <div className="max-w-2xl">
          <ul className="space-y-4">
            <li className="dashboard-card flex items-start gap-4 p-4">
              <span className="text-white font-mono text-sm">01</span>
              <div>
                <h3 className="font-medium text-white">No metal cleats on turf</h3>
                <p className="text-sm text-zinc-500 mt-1">Molded rubber or turf shoes only</p>
              </div>
            </li>
            <li className="dashboard-card flex items-start gap-4 p-4">
              <span className="text-white font-mono text-sm">02</span>
              <div>
                <h3 className="font-medium text-white">No glass containers</h3>
                <p className="text-sm text-zinc-500 mt-1">Plastic or aluminum only on the fields</p>
              </div>
            </li>
            <li className="dashboard-card flex items-start gap-4 p-4">
              <span className="text-white font-mono text-sm">03</span>
              <div>
                <h3 className="font-medium text-white">Check in 15 minutes before match time</h3>
                <p className="text-sm text-zinc-500 mt-1">Ensures games start on schedule</p>
              </div>
            </li>
            <li className="dashboard-card flex items-start gap-4 p-4">
              <span className="text-white font-mono text-sm">04</span>
              <div>
                <h3 className="font-medium text-white">Respect staff and other players</h3>
                <p className="text-sm text-zinc-500 mt-1">Sportsmanship is expected at all times</p>
              </div>
            </li>
          </ul>
        </div>
      </Section>

      {/* Location */}
      <Section dark className="bg-base bg-tactical-grid">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <SectionHeader
              title="Location & Hours"
              subtitle="14062 Ambrose St, Houston, TX 77045"
              dark
            />
            
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <Clock size={20} className="text-white mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-white font-medium">Operating Hours</p>
                  <p className="text-zinc-400 text-sm mt-1">
                    Monday - Friday: 5:00 PM - 10:00 PM<br />
                    Saturday - Sunday: 8:00 AM - 10:00 PM
                  </p>
                </div>
              </div>

              <p className="text-zinc-400">
                Field availability varies by season and event schedule. 
                Contact us for current availability and booking information.
              </p>
            </div>

            <Link
              href="/contact"
              className="btn-primary mt-6"
            >
              Contact Us
              <ArrowRight size={18} />
            </Link>
          </div>

          {/* Location Card */}
          <LocationCard />
        </div>
      </Section>

      {/* Bottom padding for mobile fixed bar */}
      <div className="h-20 md:hidden bg-base" />
    </>
  );
}
