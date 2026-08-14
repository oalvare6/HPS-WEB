/**
 * Tournament or open-play night — one place that decides, and the vocabulary
 * that follows from the answer.
 *
 * ## Why every read goes through here
 *
 * `tournaments.kind` arrives in `20260814230000_add_tournaments_kind.sql`, and
 * the last column added to this table (`is_draft`) taught an expensive lesson:
 * six queries selected it, so deploying the code before the migration would
 * have returned a PostgREST 42703 and taken the public site and the pay flow
 * down together. The migration had to go first, and somebody had to remember.
 *
 * This module removes the need to remember. `kind` is optional on the type, and
 * anything unrecognised — missing column, NULL, a value from a future release —
 * resolves to `'tournament'`, which is exactly how every event behaved before
 * this feature existed. An un-migrated database therefore renders today's site.
 *
 * The migration should still be applied first. It just isn't load-bearing.
 *
 * ## What it may never do
 *
 * `kind` decides words and panels. It must never gate money, sign-ups or
 * visibility — those belong to `tournament-state.ts`, which derives them from
 * the calendar and is fail-safe by design. A pricing rule that reads `kind`
 * would be a second, quieter place for an event to become unsellable.
 */
import type { EventKind, Tournament } from "@/lib/types";

type KindBearing = Pick<Tournament, "kind">;

export function resolveEventKind(t: KindBearing | null | undefined): EventKind {
  return t?.kind === "open_play" ? "open_play" : "tournament";
}

export function isOpenPlay(t: KindBearing | null | undefined): boolean {
  return resolveEventKind(t) === "open_play";
}

/**
 * The words that change with the kind, in one table.
 *
 * Scattering `isOpenPlay(t) ? "night" : "tournament"` across a dozen JSX
 * branches is how half a screen ends up calling the same thing by two names.
 */
export type EventKindCopy = {
  /** "tournament" / "open play night" — lowercase, for mid-sentence use. */
  noun: string;
  /** "Tournament" / "Open play" — for badges and column headers. */
  label: string;
  /** Heading above the description block on the public page. */
  aboutHeading: string;
  /** What the fee is called, in admin and to the public. */
  feeLabel: string;
  /** Header for the roster/attendance screen. */
  rosterHeading: string;
  /** Whether teams, standings, rounds and match scores apply at all. */
  hasTeams: boolean;
};

const TOURNAMENT_COPY: EventKindCopy = {
  noun: "tournament",
  label: "Tournament",
  aboutHeading: "About this tournament",
  feeLabel: "Entry fee",
  rosterHeading: "Roster",
  hasTeams: true,
};

const OPEN_PLAY_COPY: EventKindCopy = {
  noun: "open play night",
  label: "Open play",
  aboutHeading: "About this night",
  feeLabel: "Door price",
  // Not "Roster" — nobody is on a season roster for a Friday night, and calling
  // it one is what made an open play look like a tournament in the first place.
  rosterHeading: "Who's coming",
  hasTeams: false,
};

export function eventKindCopy(t: KindBearing | null | undefined): EventKindCopy {
  return isOpenPlay(t) ? OPEN_PLAY_COPY : TOURNAMENT_COPY;
}

export function copyForKind(kind: EventKind): EventKindCopy {
  return kind === "open_play" ? OPEN_PLAY_COPY : TOURNAMENT_COPY;
}

/** Narrow an untrusted value (form post, query param) to a real kind. */
export function parseEventKind(v: unknown): EventKind | null {
  return v === "tournament" || v === "open_play" ? v : null;
}
