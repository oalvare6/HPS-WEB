import { NextResponse } from "next/server";
import {
  parseRegistrationEvent,
  type RegistrationEventProperties,
} from "@/lib/analytics";

type AnalyticsBody = {
  event?: unknown;
  properties?: unknown;
  ts?: unknown;
};

function sanitizeProperties(
  raw: unknown
): RegistrationEventProperties {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: RegistrationEventProperties = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== "string" || key.length > 64) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Accept registration funnel events. Logs a single JSON line for Vercel /
 * host log drains. No persistence in Phase 8.
 */
export async function POST(request: Request) {
  let body: AnalyticsBody;
  try {
    body = (await request.json()) as AnalyticsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = parseRegistrationEvent(body.event);
  if (!event) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }

  const properties = sanitizeProperties(body.properties);
  const ts =
    typeof body.ts === "number" && Number.isFinite(body.ts)
      ? body.ts
      : Date.now();

  console.info(
    JSON.stringify({
      type: "hps_analytics",
      event,
      properties,
      ts,
      received_at: Date.now(),
    })
  );

  return new NextResponse(null, { status: 204 });
}
