import { NextResponse } from "next/server";
import {
  checkPayEligibilityRateLimit,
  getClientIpFromRequest,
} from "@/lib/pay-eligibility-rate-limit";
import {
  runPayEligibilityCheck,
  type PayEligibilityWaiverType,
} from "@/lib/pay-eligibility";
import { normalizeEmail } from "@/lib/contacts";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_WAIVER_TYPES = new Set<PayEligibilityWaiverType>(["adult", "youth"]);

type EligibilityRequestBody = {
  email?: string;
  tournamentId?: string;
  waiverType?: string;
};

export async function POST(request: Request) {
  const clientIp = getClientIpFromRequest(request);
  if (!checkPayEligibilityRateLimit(clientIp)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  let body: EligibilityRequestBody;
  try {
    body = (await request.json()) as EligibilityRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const tournamentId =
    typeof body.tournamentId === "string" ? body.tournamentId.trim() : "";
  const waiverType = body.waiverType;

  if (!email) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  if (!tournamentId || !UUID_RE.test(tournamentId)) {
    return NextResponse.json(
      { error: "A valid tournamentId is required." },
      { status: 400 }
    );
  }

  if (
    typeof waiverType !== "string" ||
    !VALID_WAIVER_TYPES.has(waiverType as PayEligibilityWaiverType)
  ) {
    return NextResponse.json(
      { error: "waiverType must be adult or youth." },
      { status: 400 }
    );
  }

  const result = await runPayEligibilityCheck({
    email,
    tournamentId,
    waiverType: waiverType as PayEligibilityWaiverType,
    // Typing an email into a gate is not signing up. This route used to put a
    // recognised player on the roster as a side effect of answering "who are
    // you?" — nobody pressed anything. An unregistered player now comes back
    // `needs_registration`, and the card routes them to `/register`, where
    // joining is a Confirm button.
    allowAutoEnroll: false,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }

  return NextResponse.json(result.body);
}
