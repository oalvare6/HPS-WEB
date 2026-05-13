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

/** Hard cap on how many tournaments may be featured at once. */
export const MAX_FEATURED_TOURNAMENTS = 3;

/** Hard cap on the body length of a per-tournament update. */
export const MAX_UPDATE_BODY_LENGTH = 500;
