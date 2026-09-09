import type { WaiverType } from "@/lib/types";

export type PayEligibilityWaiverType = WaiverType;

export type PayEligibilityStatus =
  | "unknown_email"
  | "no_waiver"
  | "needs_registration"
  | "needs_waiver"
  | "ready_to_pay"
  | "already_paid";

/**
 * The signed-in `/pay` answer. Carries ids for routing only — never a
 * capability. The 90-day HMAC `payToken` that used to ride on `ready_to_pay`
 * was retired in Stage 1.3; a signed-in player pays through the
 * session-authorised account routes from `/register`.
 */
export type PayEligibilitySuccessBody =
  | { status: "unknown_email" }
  | { status: "no_waiver"; contactId: string }
  | { status: "needs_registration"; contactId: string }
  | { status: "needs_waiver"; contactId: string; registrationId: string }
  | { status: "ready_to_pay"; contactId: string; registrationId: string }
  | { status: "already_paid"; contactId: string; registrationId: string };
