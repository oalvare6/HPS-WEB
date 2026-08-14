import type { Metadata } from "next";
import { Inter, Bebas_Neue, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

// Without `metadataBase` Next.js can't resolve relative OG/twitter image
// URLs into absolute ones — and iMessage / WhatsApp / Facebook crawlers
// REQUIRE absolute URLs to render link previews. We prefer the env var so
// preview deploys get correct URLs, fall back to the canonical domain.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "https://houstonpremiersoccer.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Houston Premier Soccer | Your Local Soccer Spot",
  description: "Schedules, standings, and field status for Houston Premier Soccer leagues and tournaments. Check game times, get directions, and register for events.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Houston Premier Soccer",
    description: "Your local 7v7 soccer spot. Quality grass field, competitive leagues, and a community built around the beautiful game.",
    url: "https://houstonpremiersoccer.com",
    siteName: "Houston Premier Soccer",
    images: [
      {
        url: "/brand/hps-badge.png",
        width: 512,
        height: 512,
        alt: "Houston Premier Soccer Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Houston Premier Soccer",
    description: "Your local 7v7 soccer spot. Quality grass field, competitive leagues, and a community built around the beautiful game.",
    images: ["/brand/hps-badge.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${bebas.variable} ${jetbrains.variable} font-sans antialiased bg-base text-white`} suppressHydrationWarning>
        {/*
          No floating WhatsApp button. It lived here, so it rendered on every
          page — a 147x40 pill, 39% of a 375px screen, fixed over the content,
          including the signup form. It was also positioned 88px up to clear the
          QuickActionsBar, which only ever renders on the homepage, so on the
          other twelve pages it hovered in empty space over body text.

          WhatsApp is still on every page in the footer, and contextually where
          somebody might actually be stuck (register, pay, event pages).
        */}
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
