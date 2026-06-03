/** Slug for the World Cup 7v7 tournament (Jun 2026). Shared by register + pay flows. */
export const WORLD_CUP_TOURNAMENT_SLUG = "world-cup-summer-tournament";

/** Flat team fee ($960.00). */
export const WORLD_CUP_TEAM_FEE_CENTS = 96_000;

export const WORLD_CUP_MIN_ROSTER_SIZE = 8;
export const WORLD_CUP_MAX_ROSTER_SIZE = 12;

export const WORLD_CUP_ROSTER_SIZE_OPTIONS = [8, 9, 10, 11, 12] as const;

export type WorldCupPayKind = "team_full" | "team_share" | "captain_paid_ack";

export type GenericPayKind = "entry" | "drop_in";

export type CheckoutPayKind = GenericPayKind | WorldCupPayKind;

const CHECKOUT_PAY_KINDS: readonly CheckoutPayKind[] = [
  "entry",
  "drop_in",
  "team_full",
  "team_share",
  "captain_paid_ack",
];

export function parseCheckoutPayKind(value: unknown): CheckoutPayKind | undefined {
  if (typeof value !== "string") return undefined;
  return CHECKOUT_PAY_KINDS.includes(value as CheckoutPayKind)
    ? (value as CheckoutPayKind)
    : undefined;
}

export function parseWorldCupRosterSize(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= WORLD_CUP_MIN_ROSTER_SIZE && value <= WORLD_CUP_MAX_ROSTER_SIZE
      ? value
      : undefined;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return parseWorldCupRosterSize(Number(value));
  }
  return undefined;
}

export function isWorldCupTournamentSlug(slug: string | null | undefined): boolean {
  return slug === WORLD_CUP_TOURNAMENT_SLUG;
}

export function worldCupShareAmountCents(rosterSize: number): number {
  if (rosterSize < WORLD_CUP_MIN_ROSTER_SIZE || rosterSize > WORLD_CUP_MAX_ROSTER_SIZE) {
    return 0;
  }
  return Math.round(WORLD_CUP_TEAM_FEE_CENTS / rosterSize);
}

export function formatUsdFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
