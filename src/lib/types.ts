export type TournamentStatus = "upcoming" | "ongoing" | "completed" | "cancelled";

export const TOURNAMENT_STATUSES: { value: TournamentStatus; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export type TournamentFormat =
  | "Adult 7v7"
  | "Youth 7v7"
  | "Mixed 7v7"
  | "Adult 5v5"
  | "Youth 5v5"
  | "Other";

export const TOURNAMENT_FORMATS: TournamentFormat[] = [
  "Adult 7v7",
  "Youth 7v7",
  "Mixed 7v7",
  "Adult 5v5",
  "Youth 5v5",
  "Other",
];

export type Tournament = {
  id: string;
  title: string;
  slug: string;
  status: TournamentStatus;
  registration_open: boolean;
  payments_open: boolean;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  time_start: string | null;
  time_end: string | null;
  recurrence: string | null;
  location: string | null;
  format: string | null;
  entry_fee: number | null;
  /** Server-authoritative entry fee in cents. Source of truth for Stripe. */
  entry_fee_cents: number | null;
  /** Default drop-in (guest play) fee in cents. Default 2000 ($20). */
  drop_in_fee_cents: number;
  /** Reserved for future Stripe Products/Prices sync. */
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  max_teams: number | null;
  image_url: string | null;
  image_preset: string | null;
  register_url: string | null;
  pay_url: string | null;
  display_order: number;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export type TournamentInput = Omit<Tournament, "id" | "created_at" | "updated_at">;

export type TournamentUpdate = {
  id: string;
  tournament_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type TournamentRoundStatus =
  | "scheduled"
  | "cancelled"
  | "rescheduled"
  | "note";

export const TOURNAMENT_ROUND_STATUSES: TournamentRoundStatus[] = [
  "scheduled",
  "cancelled",
  "rescheduled",
  "note",
];

export type TournamentRound = {
  id: string;
  tournament_id: string;
  label: string;
  /** YYYY-MM-DD or null */
  round_date: string | null;
  time_start: string | null;
  time_end: string | null;
  status: TournamentRoundStatus;
  note: string | null;
  /** YYYY-MM-DD or null */
  rescheduled_to: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Hard cap on how many tournaments may be featured at once. */
export const MAX_FEATURED_TOURNAMENTS = 3;

/** Hard cap on the body length of a per-tournament update. */
export const MAX_UPDATE_BODY_LENGTH = 500;

/** Hard cap on a round's label length. */
export const MAX_ROUND_LABEL_LENGTH = 80;

/** Hard cap on a round's note length. */
export const MAX_ROUND_NOTE_LENGTH = 280;

// ============================================================================
// People + commerce types (Phase 0 schema overhaul)
// ============================================================================

/**
 * Canonical person record. Every registration, drop-in, payment, and team
 * member ultimately points to a contact. There is no auth/login — contacts
 * are admin-managed.
 */
export type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  /** Stored as Postgres `citext`, unique. Always lowercased in the API layer. */
  email: string;
  phone: string | null;
  /** YYYY-MM-DD or null. */
  dob: string | null;
  notes: string | null;
  tags: string[];
  marketing_opt_in: boolean;
  waiver_type: WaiverType | null;
  waiver_signed_at: string | null;
  waiver_expires_at: string | null;
  waiver_document_url: string | null;
  waiver_submission_id: number | null;
  waiver_source: "docuseal" | "admin_override" | "import" | null;
  /**
   * Emergency contact on the canonical person record. Added in Phase 6 so
   * player-managed profile data persists across registrations. Nullable for
   * backfilled rows that pre-date player accounts.
   */
  emergency_name: string | null;
  emergency_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  dob?: string | null;
  notes?: string | null;
  tags?: string[];
  marketing_opt_in?: boolean;
};

export type RegistrationType = "adult" | "youth";

export type RegistrationPaymentStatus =
  | "pending"
  | "paid"
  | "partial"
  | "waived"
  | "refunded";

export type WaiverType = "adult" | "youth";

export type DocuSealStatus = "pending" | "sent" | "signed";

/**
 * A specific person's registration for a specific tournament. Links to the
 * canonical contact via `contact_id` and to the tournament via `tournament_id`.
 * Both are nullable for legacy rows from before the Phase 0 overhaul.
 */
export type Registration = {
  id: string;
  tournament_id: string | null;
  contact_id: string | null;
  team_id: string | null;
  registration_type: RegistrationType;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  dob: string;
  emergency_name: string;
  emergency_phone: string;
  team_name: string | null;
  waiver_type: WaiverType;
  waiver_signed: boolean;
  waiver_signed_at: string | null;
  waiver_submission_id: string | null;
  waiver_match_key: string;
  waiver_document_url: string | null;
  payment_status: RegistrationPaymentStatus;
  payment_method: string | null;
  payment_amount: number | null;
  notes: string | null;
  docuseal_submission_id: number | null;
  docuseal_sign_url: string | null;
  docuseal_status: DocuSealStatus;
  /**
   * Set by Phase 5 contact-linking when more than one distinct contact
   * matches the registration's email or phone. The registration is still
   * linked (to the email-canonical contact), but an admin should review the
   * duplicate before merging.
   */
  needs_admin_review: boolean;
  created_at: string;
  updated_at: string;
};

export type DropInPaymentStatus = "pending" | "paid" | "waived" | "refunded";

export const DROP_IN_PAYMENT_STATUSES: DropInPaymentStatus[] = [
  "pending",
  "paid",
  "waived",
  "refunded",
];

/**
 * Drop-in / guest appearance. Common case: someone fills in for a friend for
 * one round and pays a small fee (~$15-20). `contact_id` is who actually
 * plays; `paid_by_contact_id` is who paid (when different).
 */
export type DropIn = {
  id: string;
  tournament_id: string;
  round_id: string | null;
  contact_id: string;
  paid_by_contact_id: string | null;
  amount_cents: number;
  payment_status: DropInPaymentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DropInInput = {
  tournament_id: string;
  round_id?: string | null;
  contact_id: string;
  paid_by_contact_id?: string | null;
  amount_cents: number;
  payment_status?: DropInPaymentStatus;
  notes?: string | null;
};

export type Team = {
  id: string;
  tournament_id: string;
  name: string;
  captain_contact_id: string | null;
  color: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamInput = {
  tournament_id: string;
  name: string;
  captain_contact_id?: string | null;
  color?: string | null;
  notes?: string | null;
};

export type TeamMemberRole = "player" | "captain" | "sub";

export const TEAM_MEMBER_ROLES: TeamMemberRole[] = ["player", "captain", "sub"];

export type TeamMember = {
  team_id: string;
  contact_id: string;
  role: TeamMemberRole;
  notes: string | null;
  joined_at: string;
};

export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export type Payment = {
  id: string;
  created_at: string;
  registration_id: string | null;
  drop_in_id: string | null;
  tournament_id: string | null;
  contact_id: string | null;
  email: string;
  amount: number;
  currency: string;
  /** Legacy free-text label of what was paid for; superseded by tournament_id. */
  tournament_name: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  status: PaymentStatus;
  notes: string | null;
};

/** Hard cap on a contact's notes / contact-edit free-text fields. */
export const MAX_CONTACT_NOTES_LENGTH = 1000;

/** Hard cap on a drop-in's note length. */
export const MAX_DROP_IN_NOTE_LENGTH = 280;
