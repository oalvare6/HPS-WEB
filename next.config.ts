import type { NextConfig } from "next";

function supabaseTournamentImagesPattern():
  | { protocol: "https"; hostname: string; pathname: string }
  | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    return {
      protocol: "https",
      hostname: u.hostname,
      pathname: "/storage/v1/object/public/tournament-images/**",
    };
  } catch {
    return null;
  }
}

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  {
    protocol: "https",
    hostname: "images.unsplash.com",
  },
];
const supabasePattern = supabaseTournamentImagesPattern();
if (supabasePattern) {
  remotePatterns.push(supabasePattern);
}

/**
 * The magic-link interstitial carries a one-time token in its URL. It must not
 * be cached anywhere, and no request it makes may carry more than the bare
 * origin as a Referer. `strict-origin` rather than `no-referrer` on purpose:
 * the Fetch standard sends `Origin: null` on a same-origin POST from a
 * `no-referrer` document, which would break the exchange's same-origin check
 * (src/lib/same-origin.ts). Asserted by scripts/test-interstitial.ts.
 */
export const RESUME_EXCHANGE_HEADERS = [
  { key: "Cache-Control", value: "no-store" },
  { key: "Referrer-Policy", value: "strict-origin" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      {
        source: "/pay/resume/exchange",
        headers: RESUME_EXCHANGE_HEADERS,
      },
    ];
  },
};

export default nextConfig;
