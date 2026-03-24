import Link from "next/link";
import { CheckCircle, Calendar, ArrowRight, Home } from "lucide-react";

export default function PaySuccessPage() {
  return (
    <>
      <section className="bg-zinc-950 text-white py-12 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-3xl font-bold tracking-tight">Payment Confirmed</h1>
        </div>
      </section>

      <section className="bg-zinc-900 min-h-[60vh] flex items-center justify-center">
        <div className="max-w-lg w-full mx-auto px-6 py-12 text-center">
          <div className="dashboard-card p-8 space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle size={36} className="text-green-400" />
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                You&apos;re in!
              </h2>
              <p className="text-zinc-400">
                Your payment was successful. A confirmation receipt has been sent
                to your email by Stripe.
              </p>
            </div>

            <div className="bg-zinc-800/60 rounded-lg p-4 text-sm text-zinc-300 space-y-1">
              <div className="flex items-center gap-2 justify-center">
                <Calendar size={14} className="text-green-500" />
                <span>Spring Classic 2026 — Every Friday starting Mar 27</span>
              </div>
              <p className="text-zinc-500 text-xs mt-1">
                14602 Ambrose St · 7:00 PM – 12:00 AM
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/events" className="btn-secondary justify-center">
                <Calendar size={16} />
                View Schedule
              </Link>
              <Link href="/" className="btn-primary justify-center">
                <Home size={16} />
                Back to Home
                <ArrowRight size={14} />
              </Link>
            </div>

            <p className="text-xs text-zinc-500">
              Questions? Reach out via the contact info on our site.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
