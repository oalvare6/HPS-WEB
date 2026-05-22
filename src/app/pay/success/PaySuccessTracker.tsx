"use client";

import { useEffect, useRef } from "react";
import { trackRegistrationEvent } from "@/lib/analytics";

/**
 * Client island that fires the `registration_payment_success` analytics
 * event once on mount. The page itself is now a Server Component that
 * verifies the Stripe session synchronously, so this component only does
 * the browser-side analytics emit.
 */
export function PaySuccessTracker({
  sessionId,
  status,
}: {
  sessionId: string | null;
  status: "verified" | "skipped";
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (!sessionId || status !== "verified" || fired.current) return;
    fired.current = true;
    trackRegistrationEvent("registration_payment_success", {
      session_id: sessionId,
      status: "recorded",
    });
  }, [sessionId, status]);

  return null;
}
