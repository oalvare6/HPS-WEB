/**
 * Lightweight registration-funnel analytics. Events POST to `/api/analytics`
 * (structured server logs). No third-party SDK.
 */

export const REGISTRATION_EVENTS = [
  "registration_start",
  "registration_form_submit",
  "registration_waiver_needed",
  "registration_waiver_skipped",
  "registration_payment_link_shown",
  "registration_payment_success",
] as const;

export type RegistrationEvent = (typeof REGISTRATION_EVENTS)[number];

export type RegistrationEventProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

type AnalyticsPayload = {
  event: RegistrationEvent;
  properties: RegistrationEventProperties;
  ts: number;
};

function isRegistrationEvent(value: string): value is RegistrationEvent {
  return (REGISTRATION_EVENTS as readonly string[]).includes(value);
}

/**
 * Fire-and-forget client event. Safe to call from effects and handlers.
 */
export function trackRegistrationEvent(
  event: RegistrationEvent,
  properties: RegistrationEventProperties = {}
): void {
  if (typeof window === "undefined") return;

  const payload: AnalyticsPayload = {
    event,
    properties,
    ts: Date.now(),
  };

  try {
    const body = JSON.stringify(payload);
    const url = "/api/analytics";
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        url,
        new Blob([body], { type: "application/json" })
      );
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // Analytics must never block UX.
  }
}

/** Parse event name from API body (server-side guard). */
export function parseRegistrationEvent(
  value: unknown
): RegistrationEvent | null {
  if (typeof value !== "string" || !isRegistrationEvent(value)) return null;
  return value;
}
