import type { WaiverType } from "@/lib/types";

export type PayEligibilityWaiverType = WaiverType;

export type PayEligibilityStatus =
  | "unknown_email"
  | "no_waiver"
  | "needs_registration"
  | "needs_waiver"
  | "ready_to_pay"
  | "already_paid";

export type PayEligibilitySuccessBody =
  | { status: "unknown_email" }
  | { status: "no_waiver"; contactId: string }
  | { status: "needs_registration"; contactId: string }
  | { status: "needs_waiver"; contactId: string; registrationId: string }
  | {
      status: "ready_to_pay";
      contactId: string;
      registrationId: string;
      payToken: string;
    }
  | { status: "already_paid"; contactId: string; registrationId: string };
