"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle,
  Calendar,
  ArrowRight,
  Home,
  AlertTriangle,
} from "lucide-react";
import { Skeleton } from "@/components/shared/skeleton";
import { trackRegistrationEvent } from "@/lib/analytics";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [verifying, setVerifying] = useState(!!sessionId);
  const [error, setError] = useState("");
  const successTracked = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    fetch("/api/stripe/verify-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "recorded" || data.status === "already_recorded") {
          if (!successTracked.current) {
            successTracked.current = true;
            trackRegistrationEvent("registration_payment_success", {
              session_id: sessionId,
              status: data.status,
            });
          }
          return;
        }
        setError(data.error ?? "Could not verify payment.");
      })
      .catch(() => setError("Could not verify payment."))
      .finally(() => setVerifying(false));
  }, [sessionId]);

  return (
    <>
      <section className="bg-base text-white py-12 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-3xl font-bold tracking-tight">
            Payment Confirmed
          </h1>
        </div>
      </section>

      <section className="bg-surface min-h-[60vh] flex items-center justify-center">
        <div className="max-w-lg w-full mx-auto px-6 py-12 text-center">
          <div className="dashboard-card p-8 space-y-6">
            <div className="flex justify-center">
              {verifying ? (
                <Skeleton className="w-16 h-16 rounded-full" />
              ) : error ? (
                <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <AlertTriangle size={36} className="text-yellow-400" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center">
                  <CheckCircle size={36} className="text-brand" />
                </div>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {verifying
                  ? "Confirming your payment…"
                  : error
                    ? "You're in!"
                    : "You're in!"}
              </h2>
              <p className="text-zinc-400">
                {verifying
                  ? "Please wait while we confirm your payment."
                  : "Your payment was successful. A confirmation receipt has been sent to your email by Stripe."}
              </p>
              {error && (
                <p className="text-yellow-400 text-sm mt-2">
                  Note: {error} Your Stripe payment was still processed. Please
                  contact us if you need assistance.
                </p>
              )}
            </div>

            <div className="bg-surface-2/60 rounded-lg p-4 text-sm text-zinc-300 space-y-1">
              <div className="flex items-center gap-2 justify-center">
                <Calendar size={14} className="text-brand" />
                <span>Spring Classic 2026 — Every Friday starting Mar 27</span>
              </div>
              <p className="text-zinc-500 text-xs mt-1">
                14062 Ambrose St · 7:00 PM – 12:00 AM
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

function PaySuccessFallback() {
  return (
    <section className="bg-surface min-h-[60vh] flex items-center justify-center px-6">
      <div className="dashboard-card p-8 w-full max-w-lg space-y-4">
        <Skeleton className="w-16 h-16 rounded-full mx-auto" />
        <Skeleton className="h-7 w-48 mx-auto" />
        <Skeleton className="h-4 w-full max-w-sm mx-auto" />
      </div>
    </section>
  );
}

export default function PaySuccessPage() {
  return (
    <Suspense fallback={<PaySuccessFallback />}>
      <SuccessContent />
    </Suspense>
  );
}
