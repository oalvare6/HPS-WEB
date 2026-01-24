import Link from "next/link";
import { Section, SectionHeader } from "@/components/shared/section";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import {
  Sun,
  Car,
  Users,
  ShieldCheck,
  ArrowRight,
  MapPin,
} from "lucide-react";

export default function FacilityPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-zinc-950 text-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            The Facility
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Purpose-built for competitive play. Quality turf, professional lighting, 
            and the infrastructure to run events right.
          </p>
        </div>
      </section>

      {/* Field Overview */}
      <Section>
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <SectionHeader
              title="The Fields"
              subtitle="Turf fields configured for multiple formats."
            />
            <ul className="space-y-4 text-zinc-600">
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full mt-2.5" />
                <span>Professional-grade turf maintained to competitive standards</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full mt-2.5" />
                <span>Configurable for 5v5, 7v7, and 11v11 formats</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full mt-2.5" />
                <span>Full lighting for evening matches and night leagues</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full mt-2.5" />
                <span>Regular maintenance and pre-event inspections</span>
              </li>
            </ul>
          </div>
          <ImagePlaceholder caption="Main field with LED lighting system" />
        </div>
      </Section>

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-6">
        <hr className="border-zinc-200" />
      </div>

      {/* Amenities */}
      <Section>
        <SectionHeader
          title="Amenities"
          subtitle="Everything you need for game day."
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="p-6 bg-zinc-50 rounded-lg text-center">
            <Sun size={28} className="text-zinc-700 mx-auto mb-3" />
            <h3 className="font-medium text-zinc-900">Field Lighting</h3>
            <p className="text-sm text-zinc-500 mt-1">Night games available</p>
          </div>

          <div className="p-6 bg-zinc-50 rounded-lg text-center">
            <Users size={28} className="text-zinc-700 mx-auto mb-3" />
            <h3 className="font-medium text-zinc-900">Spectator Areas</h3>
            <p className="text-sm text-zinc-500 mt-1">Covered seating</p>
          </div>

          <div className="p-6 bg-zinc-50 rounded-lg text-center">
            <Car size={28} className="text-zinc-700 mx-auto mb-3" />
            <h3 className="font-medium text-zinc-900">Parking</h3>
            <p className="text-sm text-zinc-500 mt-1">On-site lot</p>
          </div>

          <div className="p-6 bg-zinc-50 rounded-lg text-center">
            <ShieldCheck size={28} className="text-zinc-700 mx-auto mb-3" />
            <h3 className="font-medium text-zinc-900">Restrooms</h3>
            <p className="text-sm text-zinc-500 mt-1">Clean facilities</p>
          </div>
        </div>
      </Section>

      {/* Field Rules */}
      <Section className="bg-zinc-50">
        <SectionHeader
          title="Field Rules"
          subtitle="Help us keep the facility in top condition."
        />

        <div className="max-w-2xl">
          <ul className="space-y-4">
            <li className="flex items-start gap-4 p-4 bg-white border border-zinc-200 rounded-lg">
              <span className="text-zinc-400 font-mono text-sm">01</span>
              <div>
                <h3 className="font-medium text-zinc-900">No metal cleats on turf</h3>
                <p className="text-sm text-zinc-500 mt-1">Molded rubber or turf shoes only</p>
              </div>
            </li>
            <li className="flex items-start gap-4 p-4 bg-white border border-zinc-200 rounded-lg">
              <span className="text-zinc-400 font-mono text-sm">02</span>
              <div>
                <h3 className="font-medium text-zinc-900">No glass containers</h3>
                <p className="text-sm text-zinc-500 mt-1">Plastic or aluminum only on the fields</p>
              </div>
            </li>
            <li className="flex items-start gap-4 p-4 bg-white border border-zinc-200 rounded-lg">
              <span className="text-zinc-400 font-mono text-sm">03</span>
              <div>
                <h3 className="font-medium text-zinc-900">Check in 15 minutes before match time</h3>
                <p className="text-sm text-zinc-500 mt-1">Ensures games start on schedule</p>
              </div>
            </li>
            <li className="flex items-start gap-4 p-4 bg-white border border-zinc-200 rounded-lg">
              <span className="text-zinc-400 font-mono text-sm">04</span>
              <div>
                <h3 className="font-medium text-zinc-900">Respect staff and other players</h3>
                <p className="text-sm text-zinc-500 mt-1">Sportsmanship is expected at all times</p>
              </div>
            </li>
          </ul>
        </div>
      </Section>

      {/* Location */}
      <Section>
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div>
            <SectionHeader
              title="Location"
              subtitle="Houston, TX"
            />
            <div className="flex items-start gap-3 mb-6">
              <MapPin size={20} className="text-zinc-400 mt-1 flex-shrink-0" />
              <div>
                <p className="text-zinc-900 font-medium">Houston Premier Soccer</p>
                <p className="text-zinc-600">Houston, TX</p>
                <p className="text-zinc-500 text-sm mt-1">Full address coming soon</p>
              </div>
            </div>
            <p className="text-zinc-600 mb-6">
              Field availability varies by season and event schedule. 
              Contact us for current availability and booking information.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-zinc-900 text-white px-5 py-2.5 font-medium rounded-md hover:bg-zinc-800 transition-colors"
            >
              Contact Us
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
