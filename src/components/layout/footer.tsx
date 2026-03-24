import Link from "next/link";
import Image from "next/image";
import { MapPin, Navigation, ExternalLink } from "lucide-react";

const GOOGLE_MAPS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=14602+Ambrose+St,+Houston,+TX+77045";

const WHATSAPP_URL = "https://chat.whatsapp.com/HzBW39TgVemIA6EHWMnInY";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M24 4C13 4 4 13 4 24c0 3.6 1 7 2.7 10L4 44l10.3-2.7C17.2 43 20.5 44 24 44c11 0 20-9 20-20S35 4 24 4zm0 36c-3.1 0-6.1-.8-8.7-2.4l-.6-.4-6.1 1.6 1.6-5.9-.4-.6C8.2 30.3 7.4 27.2 7.4 24 7.4 14.8 14.9 7.4 24 7.4S40.6 14.9 40.6 24 33.1 40 24 40zm10.9-14.5c-.6-.3-3.5-1.7-4-1.9-.5-.2-.9-.3-1.3.3-.4.6-1.5 1.9-1.8 2.3-.3.4-.7.4-1.3.1-.6-.3-2.5-.9-4.7-2.9-1.7-1.5-2.9-3.4-3.2-4-.3-.6 0-.9.3-1.2.3-.3.6-.7.9-1 .3-.3.4-.6.6-1 .2-.4.1-.7 0-1-.1-.3-1.3-3.2-1.8-4.3-.5-1.1-1-1-1.3-1H16c-.4 0-1 .1-1.5.7-.5.6-2 1.9-2 4.7s2 5.5 2.3 5.8c.3.4 4 6.1 9.7 8.6 1.4.6 2.4.9 3.3 1.2 1.4.4 2.6.4 3.6.2 1.1-.2 3.5-1.4 4-2.8.5-1.4.5-2.5.3-2.8-.1-.2-.5-.4-1.1-.6z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="bg-zinc-950 text-white border-t border-zinc-800">
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
                <p className="text-zinc-400">14602 Ambrose St, Houston, TX 77045</p>
                <a
                  href={GOOGLE_MAPS_URL}
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
                <a href="mailto:houspremiersoccer@gmail.com" className="hover:text-white transition-colors">
                  houspremiersoccer@gmail.com
                </a>
              </li>
              <li className="pt-1">
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[#25D366] hover:text-[#20bd5a] font-medium transition-colors"
                >
                  <WhatsAppIcon className="w-4 h-4" />
                  Join Community Chat
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-zinc-800 mt-10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
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
          </div>
        </div>
      </div>
    </footer>
  );
}
