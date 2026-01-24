import Link from "next/link";
import Image from "next/image";
import { MapPin, Navigation, ExternalLink } from "lucide-react";

const GOOGLE_MAPS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=14602+Ambrose+St,+Houston,+TX+77045";

export function Footer() {
  return (
    <footer className="bg-zinc-950 text-white border-t border-zinc-800">
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-4">
              <Image
                src="/brand/hps-badge.png"
                alt="Houston Premier Soccer"
                width={48}
                height={48}
                className="w-12 h-12 invert"
              />
              <span className="font-semibold text-lg">Houston Premier Soccer</span>
            </Link>
            <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">
              Houston&apos;s home for competitive soccer. Quality fields, organized events, 
              and a community built around the game.
            </p>
            
            {/* Quick Location */}
            <div className="flex items-start gap-2 mt-4 text-sm">
              <MapPin size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-zinc-400">14602 Ambrose St, Houston, TX 77045</p>
                <a
                  href={GOOGLE_MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-green-500 hover:text-green-400 text-xs font-medium mt-1 transition-colors"
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
                <Link href="/events#schedule" className="text-zinc-400 hover:text-white text-sm transition-colors">
                  Schedule
                </Link>
              </li>
              <li>
                <Link href="/events#standings" className="text-zinc-400 hover:text-white text-sm transition-colors">
                  Standings
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
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wide mb-4 text-zinc-300">
              Contact
            </h3>
            <ul className="space-y-3 text-sm text-zinc-400">
              <li>
                <a href="mailto:info@houstonpremiersoccer.com" className="hover:text-white transition-colors">
                  info@houstonpremiersoccer.com
                </a>
              </li>
              <li>
                <a href="tel:+17135550100" className="hover:text-white transition-colors">
                  (713) 555-0100
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-zinc-800 mt-10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-zinc-500 text-sm">
            &copy; {new Date().getFullYear()} Houston Premier Soccer. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/contact" className="text-zinc-500 hover:text-white text-sm transition-colors">
              Contact Us
            </Link>
            <Link href="/about" className="text-zinc-500 hover:text-white text-sm transition-colors">
              About
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
