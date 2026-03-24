"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Trophy,
  Calendar,
  MapPin,
  Clock,
  CreditCard,
  ArrowRight,
  AlertCircle,
  Users,
} from "lucide-react";

// Tournament entry — add more here when new events open up
const TOURNAMENTS = [
  {
    id: "spring-classic-2026",
    name: "Spring Classic 2026 — March 27",
    description: "Friday 7v7 Tournament | Every Friday starting Mar 27",
    date: "Every Friday starting Mar 27, 2026",
    time: "7:00 PM – 12:00 AM",
    location: "14602 Ambrose St, Houston TX",
    format: "Youth & Adult 7v7",
    amountCents: 4000, // $40.00 — update when pricing is confirmed
  },
];

function PayForm() {
  const searchParams = useSearchParams();
  const cancelled = searchParams.get("cancelled") === "true";

  const [email, setEmail] = useState("");
  const [selectedId, setSelectedId] = useState(TOURNAMENTS[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selected = TOURNAMENTS.find((t) => t.id === selectedId) ?? TOURNAMENTS[0];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          tournamentName: selected.name,
          amountCents: selected.amountCents,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      // Redirect to Stripe-hosted checkout
      window.location.href = data.url;
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 md:py-20">
      {cancelled && (
        <div className="mb-6 flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-3 text-yellow-400 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>Payment was cancelled. You can try again whenever you&apos;re ready.</span>
        </div>
      )}

      {/* Tournament card */}
      <div className="dashboard-card p-6 mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono text-green-500 uppercase tracking-wider">
                Registration Open
              </span>
            </div>
            <h2 className="text-xl font-bold text-white">{selected.name}</h2>
            <p className="text-zinc-400 text-sm mt-1">{selected.description}</p>
          </div>
          <Trophy size={24} className="text-green-500 flex-shrink-0 ml-4" />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div className="flex items-center gap-2 text-zinc-300">
            <Calendar size={14} className="text-green-500 flex-shrink-0" />
            <span>{selected.date}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Clock size={14} className="text-green-500 flex-shrink-0" />
            <span>{selected.time}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <MapPin size={14} className="text-green-500 flex-shrink-0" />
            <span>{selected.location}</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Users size={14} className="text-green-500 flex-shrink-0" />
            <span>{selected.format}</span>
          </div>
        </div>

        <div className="border-t border-zinc-700 pt-4 flex items-center justify-between">
          <span className="text-zinc-400 text-sm">Entry fee</span>
          <span className="text-2xl font-bold text-white">
            ${(selected.amountCents / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Payment form */}
      <div className="dashboard-card p-6">
        <h3 className="text-lg font-semibold text-white mb-1">
          Complete Payment
        </h3>
        <p className="text-zinc-400 text-sm mb-6">
          Enter the email you used when registering. Already registered?{" "}
          your payment will be linked to your profile automatically.{" "}
          Not registered yet?{" "}
          <Link href="/register" className="text-white underline underline-offset-2">
            Register first
          </Link>{" "}
          to sign your waiver, then come back here.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-400 mb-1"
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-red-400 text-sm">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="btn-primary w-full justify-center h-12 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>Processing…</>
            ) : (
              <>
                <CreditCard size={18} />
                Pay ${(selected.amountCents / 100).toFixed(2)} with Card
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <p className="text-xs text-zinc-500 text-center">
            Powered by Stripe. Your card details are never stored on our servers.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function PayPage() {
  return (
    <>
      <section className="bg-zinc-950 text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            Pay for Tournament
          </h1>
          <p className="text-zinc-400">
            Secure payment via Stripe. You must register and sign the waiver before paying.
          </p>
        </div>
      </section>

      <section className="bg-zinc-900 min-h-[60vh]">
        <Suspense fallback={null}>
          <PayForm />
        </Suspense>
      </section>
    </>
  );
}
