import Link from "next/link";
import Image from "next/image";
import { MapPin, Navigation, ExternalLink } from "lucide-react";
// QRO branding intentionally lives on the homepage only; the per-page footer
// stays clean (see src/app/page.tsx for the QroBadge mount).
import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { getSiteSetting } from "@/lib/site-settings";

export async function Footer() {
  const [address, mapsUrl, contactEmail, contactPhone] = await Promise.all([
    getSiteSetting("footer.address"),
    getSiteSetting("footer.maps_url"),
    getSiteSetting("contact.email"),
    getSiteSetting("contact.phone"),
  ]);

  return (
    <footer className="bg-base text-white border-t border-border-token">
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-white p-0.5 shadow-md shadow-black/20">
                <Image
                  src="/brand/hps-badge.png"
                  alt="Houston Premier Soccer"
                  width={48}
                  height={48}
                  className="w-full h-full rounded-full"
                />
              </div>
              <span className="font-semibold text-lg">Houston Premier Soccer</span>
            </Link>
            <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">
              Houston&apos;s home for competitive soccer. Quality fields, organized events, 
              and a community built around the game.
            </p>
            
            {/* Quick Location */}
            <div className="flex items-start gap-2 mt-4 text-sm">
              <MapPin size={16} className="text-white mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-zinc-400">{address}</p>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-white hover:text-zinc-300 text-xs font-medium mt-1 transition-colors"
                >
                  <Navigation size={12} />
                  Get Directions
                  <ExternalLink size={10} className="opacity-70" />
                </a>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wide mb-4 text-zinc-300">
              Quick Links
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href="/events" className="text-zinc-400 hover:text-white text-sm transition-colors">
                  Tournaments
                </Link>
              </li>
              <li>
                <Link href="/facility" className="text-zinc-400 hover:text-white text-sm transition-colors">
                  Facility
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-zinc-400 hover:text-white text-sm transition-colors">
                  Register
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-zinc-400 hover:text-white text-sm transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wide mb-4 text-zinc-300">
              Contact
            </h3>
            <ul className="space-y-3 text-sm text-zinc-400">
              <li>
                <a
                  href={`mailto:${contactEmail}`}
                  className="break-all hover:text-white transition-colors"
                >
                  {contactEmail}
                </a>
              </li>
              {contactPhone && (
                <li>
                  <a href={`tel:${contactPhone.replace(/[^+\d]/g, "")}`} className="hover:text-white transition-colors">
                    {contactPhone}
                  </a>
                </li>
              )}
              <li className="pt-1">
                <WhatsAppCommunityLinkFromSite
                  variant="inline"
                  className="inline-flex items-center gap-2 text-[#25D366] no-underline hover:text-[#20bd5a] font-medium"
                >
                  Join Community Chat
                </WhatsAppCommunityLinkFromSite>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-border-token mt-10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-zinc-500 text-sm">
            &copy; 2026 Houston Premier Soccer. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/contact" className="text-zinc-500 hover:text-white text-sm transition-colors">
              Contact Us
            </Link>
            <Link href="/about" className="text-zinc-500 hover:text-white text-sm transition-colors">
              About
            </Link>
            <Link
              href="/admin"
              className="text-zinc-600 hover:text-zinc-300 text-sm transition-colors"
              title="Staff dashboard (login required)"
            >
              Admin
            </Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
