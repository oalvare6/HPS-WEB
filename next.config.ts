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
    ];
  },
};

export default nextConfig;
