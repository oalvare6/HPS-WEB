import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-8">
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
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wide mb-4">
              Quick Links
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href="/about" className="text-zinc-400 hover:text-white text-sm transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/facility" className="text-zinc-400 hover:text-white text-sm transition-colors">
                  Facility
                </Link>
              </li>
              <li>
                <Link href="/events" className="text-zinc-400 hover:text-white text-sm transition-colors">
                  Events
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
            <h3 className="font-semibold text-sm uppercase tracking-wide mb-4">
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
              <li className="pt-2">
                Houston, TX
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-zinc-800 mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-zinc-500 text-sm">
            &copy; {new Date().getFullYear()} Houston Premier Soccer. All rights reserved.
          </p>
          <div className="flex gap-6">
            <Link href="/contact" className="text-zinc-500 hover:text-white text-sm transition-colors">
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
