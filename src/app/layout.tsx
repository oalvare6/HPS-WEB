import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
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
      <body className={`${inter.variable} font-sans antialiased bg-zinc-950 text-white`}>
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
